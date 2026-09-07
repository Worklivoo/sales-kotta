import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { HttpError } from './createMemberService.js';

/* Verificacao do ENCAMINHAMENTO da caixa do cliente.
 *
 * O cliente configura, na propria caixa, um encaminhamento para o
 * endereco de integracao dele. Direto ele diz que configurou e nada
 * chega - e so descobrimos isso quando um pedido de cotacao se perde.
 *
 * Este servico fecha o circuito de verdade: manda um e-mail NOSSO para a
 * caixa dele e espera esse mesmo e-mail voltar para integracao@. Quem
 * marca como validado e a Triagem Global, ao ler o token no assunto.
 *
 * O envio em si mora no n8n (credencial de SMTP nossa fica la, nao aqui)
 * - mesma divisao ja usada na leitura de planilha. */
const URL_WEBHOOK_N8N =
  'https://primary-production-b86f1.up.railway.app/webhook/verificar-encaminhamento-kotta';

interface Options {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  n8nToken: string;
  requesterAccessToken: string;
  payload: { acao?: string };
}

interface CanalEmail {
  smtp_email?: string | null;
  email_integracao?: string | null;
  redirecionamento_teste_token?: string | null;
  redirecionamento_teste_em?: string | null;
  redirecionamento_validado_em?: string | null;
  [chave: string]: unknown;
}

const resolverMembro = async (options: Options) => {
  if (!options.supabaseUrl || !options.supabaseAnonKey || !options.supabaseServiceRoleKey) {
    throw new HttpError(500, 'As credenciais do servidor nao estao configuradas.');
  }

  if (!options.requesterAccessToken) {
    throw new HttpError(401, 'Nao foi possivel validar o usuario autenticado.');
  }

  const publicClient = createClient(options.supabaseUrl, options.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const adminClient = createClient(options.supabaseUrl, options.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await publicClient.auth.getUser(options.requesterAccessToken);

  if (userError || !user?.id) {
    throw new HttpError(401, 'Nao foi possivel validar o usuario autenticado.');
  }

  /* O membro vem SEMPRE do usuario autenticado - nunca do corpo da
     requisicao. Do contrario daria para disparar o teste, e marcar a
     validacao, na conta de outra pessoa. */
  const { data: membro, error: membroError } = await adminClient
    .from('sales_membros_v2')
    .select('membro_id, nome, email, status, canal_email')
    .eq('user_id', user.id)
    .maybeSingle();

  if (membroError) {
    throw new HttpError(500, membroError.message);
  }

  if (!membro?.membro_id) {
    throw new HttpError(400, 'Nao foi possivel identificar o seu cadastro.');
  }

  if (membro.status !== 'ATIVO') {
    throw new HttpError(403, 'Seu acesso esta inativo no momento.');
  }

  return { adminClient, membro };
};

const estadoDoCanal = (canal: CanalEmail) => {
  const validadoEm = canal.redirecionamento_validado_em || null;
  const testeEm = canal.redirecionamento_teste_em || null;
  const aguardando = Boolean(canal.redirecionamento_teste_token) && !!testeEm;

  return {
    validado_em: validadoEm,
    teste_em: testeEm,
    /* "aguardando" so vale enquanto o token existe: a Triagem apaga o
       token ao validar, entao ele e o proprio sinal de "ainda esperando". */
    aguardando,
  };
};

export async function verificarEncaminhamentoService(options: Options) {
  const { adminClient, membro } = await resolverMembro(options);
  const canal = (membro.canal_email ?? {}) as CanalEmail;
  const acao = String(options.payload?.acao ?? 'status');

  if (acao === 'status') {
    return { ...estadoDoCanal(canal), destino: canal.smtp_email || membro.email || '' };
  }

  if (acao !== 'enviar') {
    throw new HttpError(400, 'Acao desconhecida.');
  }

  if (!canal.email_integracao) {
    throw new HttpError(
      400,
      'Seu e-mail de integracao ainda nao foi gerado - sem ele nao ha para onde encaminhar.',
    );
  }

  /* A caixa a testar e a que o cliente conectou. Quando o SMTP ainda nao
     foi configurado, cai no e-mail de login, que e o endereco que ele
     usa no dia a dia. */
  const destino = String(canal.smtp_email || membro.email || '').trim();

  if (!destino) {
    throw new HttpError(400, 'Nao ha um e-mail seu cadastrado para receber o teste.');
  }

  if (destino.toLowerCase() === String(canal.email_integracao).toLowerCase()) {
    throw new HttpError(400, 'O e-mail de destino nao pode ser o proprio endereco de integracao.');
  }

  if (!options.n8nToken) {
    throw new HttpError(500, 'A variavel N8N_KOTTA_TOKEN nao chegou ao servidor.');
  }

  const token = randomUUID();

  /* Grava o token ANTES de mandar. Se gravasse depois, um encaminhamento
     rapido poderia trazer o e-mail de volta antes de existir o que
     comparar - e a validacao se perderia sem ninguem entender por que. */
  const { error: erroToken } = await adminClient
    .from('sales_membros_v2')
    .update({
      canal_email: {
        ...canal,
        redirecionamento_teste_token: token,
        redirecionamento_teste_em: new Date().toISOString(),
      },
    })
    .eq('membro_id', membro.membro_id);

  if (erroToken) {
    throw new HttpError(500, `Nao foi possivel registrar o teste: ${erroToken.message}`);
  }

  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 30000);

  let resposta: Response;

  try {
    resposta = await fetch(URL_WEBHOOK_N8N, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kotta-token': options.n8nToken },
      body: JSON.stringify({ email_destino: destino, token, nome: membro.nome || '' }),
      signal: controle.signal,
    });
  } catch (erro) {
    const motivo =
      erro instanceof Error && erro.name === 'AbortError'
        ? 'A automacao de envio demorou mais de 30s para responder.'
        : 'Nao foi possivel falar com a automacao de envio.';
    throw new HttpError(502, motivo);
  } finally {
    clearTimeout(limite);
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    console.error('[verificar-encaminhamento] webhook falhou:', resposta.status, detalhe.slice(0, 300));
    throw new HttpError(502, `Nao foi possivel enviar o e-mail de teste (a automacao respondeu ${resposta.status}).`);
  }

  return { enviado: true, destino, teste_em: new Date().toISOString(), aguardando: true, validado_em: null };
}
