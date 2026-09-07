import { createClient } from '@supabase/supabase-js';
import { HttpError } from './createMemberService.js';
import { validateSmtpService } from './validateSmtpService.js';

/* Salvar a configuracao de e-mail passa por aqui, e nao mais direto do
 * navegador, por um motivo: a SENHA nao pode ser gravada pelo cliente.
 *
 * Ela vai para o cofre (vault) pela funcao sales_v2_smtp_gravar, que so
 * a service_role pode executar. O resto (host, porta, ssl, e-mail) segue
 * em canal_email, que nao e segredo.
 *
 * Antes a senha ficava em texto puro em sales_membros_v2.canal_email, e
 * como a politica de RLS e por EMPRESA - nao por pessoa - e nao ha
 * restricao por coluna, qualquer membro lia a senha de e-mail de
 * qualquer colega. */
interface Options {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  anthropicApiKey?: string;
  requesterAccessToken: string;
  payload: {
    smtp_host?: string;
    smtp_port?: string;
    smtp_ssl?: boolean;
    smtp_email?: string;
    smtp_senha?: string;
  };
}

export async function salvarSmtpService(options: Options) {
  const { payload } = options;

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

  /* O membro vem SEMPRE do usuario autenticado. Se viesse do corpo da
     requisicao, daria para gravar a senha na conta de outra pessoa. */
  const { data: membro, error: membroError } = await adminClient
    .from('sales_membros_v2')
    .select('membro_id, canal_email, status')
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

  const host = String(payload.smtp_host ?? '').trim();
  const port = String(payload.smtp_port ?? '').trim();
  const email = String(payload.smtp_email ?? '').trim();
  const senha = String(payload.smtp_senha ?? '');
  const ssl = payload.smtp_ssl === true;

  if (!host || !port || !email || !senha) {
    throw new HttpError(400, 'Preencha host, porta, e-mail e senha.');
  }

  /* Testa antes de gravar: senha errada guardada no cofre so apareceria
     como falha de envio la na frente, longe da causa. */
  const validacao = await validateSmtpService({
    supabaseUrl: options.supabaseUrl,
    supabaseAnonKey: options.supabaseAnonKey,
    supabaseServiceRoleKey: options.supabaseServiceRoleKey,
    anthropicApiKey: options.anthropicApiKey,
    requesterAccessToken: options.requesterAccessToken,
    payload: { smtp_host: host, smtp_port: port, smtp_ssl: ssl, smtp_email: email, smtp_senha: senha },
  });

  if (!validacao.validated) {
    return { salvo: false, validated: false, resultado: validacao.resultado };
  }

  /* Cofre PRIMEIRO. Se ele falhar, canal_email nem e tocado - do
     contrario a tela diria "senha configurada" sem haver senha guardada,
     e o erro so apareceria no primeiro envio, longe da causa. */
  const { error: erroSenha } = await adminClient.rpc('sales_v2_smtp_gravar', {
    p_membro_id: membro.membro_id,
    p_senha: senha,
  });

  if (erroSenha) {
    throw new HttpError(500, `Nao foi possivel guardar a senha com seguranca: ${erroSenha.message}`);
  }

  const canalAtual = (membro.canal_email ?? {}) as Record<string, unknown>;

  // a senha NAO entra aqui - so o que nao e segredo
  const { smtp_senha: _fora, ...semSenha } = canalAtual;

  const { error: erroCanal } = await adminClient
    .from('sales_membros_v2')
    .update({
      canal_email: {
        ...semSenha,
        smtp_host: host,
        smtp_port: port,
        smtp_ssl: ssl,
        smtp_email: email,
        /* Nao e a senha: e so um aviso de que existe uma guardada, para a
           tela poder mostrar o estado sem nunca revelar o valor. */
        senha_configurada: true,
      },
    })
    .eq('membro_id', membro.membro_id);

  if (erroCanal) {
    throw new HttpError(500, `A senha foi guardada, mas a configuracao nao: ${erroCanal.message}`);
  }

  return { salvo: true, validated: true, resultado: validacao.resultado };
}
