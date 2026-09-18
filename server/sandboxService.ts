import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { HttpError } from './createMemberService.js';

/* Pagina /sandbox ("Testar atendimento"): o cliente simula um lead mandando
   e-mail para a propria empresa e acompanha a IA respondendo.

   A mensagem entra pela Triagem Global REAL (webhook "Webhook (Teste E-mail)",
   que cai no mesmo "Normalizar Email" do IMAP) e segue Worker, orcamento etc.
   Se algo quebrar, o erro aparece na execucao real. O atendimento nasce com
   sales_atendimentos_v2.sandbox = true e as RPCs cuidam do resto: o envio final
   ao lead e simulado, nada vai para o ERP do cliente, nao ha follow-up e nao
   conta consumo do plano. */

const TRIAGEM_EMAIL_TESTE_URL = 'https://primary-production-b86f1.up.railway.app/webhook/triagem-email-teste-v2';
// Mesmo webhook do botao "Aprovar" do orcamento (components/OrcamentoEditorModal.tsx).
const APROVAR_ORCAMENTO_URL = 'https://primary-production-b86f1.up.railway.app/webhook/aprovar-orcamento-v2';

// .invalid e reservado (RFC 2606): nenhum e-mail para esse dominio e entregue,
// entao mesmo que algum envio escapasse da trava, nao chegaria a ninguem.
const DOMINIO_TESTE = 'teste.invalid';

const LIMITE_TEXTO = 5000;
const LIMITE_ASSUNTO = 200;

interface SandboxServiceEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  sandboxWebhookToken: string;
}

interface SandboxServiceOptions {
  env: SandboxServiceEnv;
  requesterAccessToken: string;
}

const buildClients = (env: SandboxServiceEnv) => {
  if (!env.supabaseUrl || !env.supabaseAnonKey || !env.supabaseServiceRoleKey) {
    throw new HttpError(500, 'Credenciais do servidor para o sandbox nao estao configuradas.');
  }

  const publicClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { publicClient, adminClient };
};

// Sempre opera no membro do proprio usuario logado - nunca recebe empresa_id
// nem membro_id do navegador. Cada membro ve e mexe so nas conversas de teste
// que ele mesmo criou (sandbox = true), nunca num atendimento real.
const resolverMembroDoRequester = async (env: SandboxServiceEnv, requesterAccessToken: string) => {
  const { publicClient, adminClient } = buildClients(env);

  if (!requesterAccessToken) {
    throw new HttpError(401, 'Nao foi possivel validar o usuario autenticado.');
  }

  const { data: userData, error: userError } = await publicClient.auth.getUser(requesterAccessToken);

  if (userError || !userData?.user?.id) {
    throw new HttpError(401, 'Nao foi possivel validar o usuario autenticado.');
  }

  const { data: membro, error: membroError } = await adminClient
    .from('sales_membros_v2')
    .select('membro_id, empresa_id, status, canal_email')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (membroError) {
    throw new HttpError(500, membroError.message);
  }

  if (!membro?.empresa_id) {
    throw new HttpError(400, 'Nao foi possivel identificar a empresa do usuario atual.');
  }

  const { data: empresa, error: empresaError } = await adminClient
    .from('sales_empresas_v2')
    .select('empresa_id, razao_social')
    .eq('empresa_id', membro.empresa_id)
    .maybeSingle();

  if (empresaError) {
    throw new HttpError(500, empresaError.message);
  }

  if (!empresa) {
    throw new HttpError(400, 'Nao foi possivel identificar a empresa do usuario atual.');
  }

  const canalEmail = (membro.canal_email || null) as { email_integracao?: string } | null;

  return {
    adminClient,
    empresa,
    membro,
    emailIntegracao: canalEmail?.email_integracao || null,
  };
};

const buscarAtendimentoDeTeste = async (
  adminClient: ReturnType<typeof buildClients>['adminClient'],
  membroId: string,
  atendimentoId: string,
) => {
  if (!atendimentoId) {
    throw new HttpError(400, 'Informe a conversa.');
  }

  const { data, error } = await adminClient
    .from('sales_atendimentos_v2')
    .select('atendimento_id, empresa_id, email_lead, assunto')
    .eq('atendimento_id', atendimentoId)
    .eq('membro_id', membroId)
    .eq('sandbox', true)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message);
  }

  if (!data) {
    throw new HttpError(404, 'Conversa de teste nao encontrada.');
  }

  return data;
};

const gerarId = () => randomBytes(6).toString('hex');

export const sandboxObterMinhaEmpresaService = async ({ env, requesterAccessToken }: SandboxServiceOptions) => {
  const { empresa, membro, emailIntegracao } = await resolverMembroDoRequester(env, requesterAccessToken);

  return {
    empresa_id: empresa.empresa_id,
    razao_social: empresa.razao_social,
    membro_id: membro.membro_id,
    email_integracao: emailIntegracao,
  };
};

export const sandboxListarAtendimentosService = async ({ env, requesterAccessToken }: SandboxServiceOptions) => {
  const { adminClient, empresa, membro } = await resolverMembroDoRequester(env, requesterAccessToken);

  const { data, error } = await adminClient
    .from('sales_atendimentos_v2')
    .select('atendimento_id, numero_ticket, email_lead, assunto, status, categoria, created_at, updated_at')
    .eq('empresa_id', empresa.empresa_id)
    .eq('membro_id', membro.membro_id)
    .eq('sandbox', true)
    // Conversas da auditoria interna da Worklivoo tambem sao sandbox, mas nao
    // podem aparecer na tela "Testar atendimento" do cliente.
    .not('email_lead', 'like', '%@auditoria-worklivoo.invalid')
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new HttpError(500, error.message);
  }

  return { atendimentos: data || [] };
};

export const sandboxListarMensagensService = async ({
  env,
  requesterAccessToken,
  atendimentoId,
}: SandboxServiceOptions & { atendimentoId: string }) => {
  const { adminClient, membro } = await resolverMembroDoRequester(env, requesterAccessToken);
  const atendimento = await buscarAtendimentoDeTeste(adminClient, membro.membro_id, atendimentoId);

  const { data, error } = await adminClient
    .from('sales_mensagens_v2')
    .select('mensagem_id, created_at, origem, conteudo, anexos')
    .eq('atendimento_id', atendimento.atendimento_id)
    .order('created_at', { ascending: true });

  if (error) {
    throw new HttpError(500, error.message);
  }

  // A mensagem da proposta e salva sem anexo; o PDF fica no orcamento.
  const { data: orcamento } = await adminClient
    .from('sales_orcamentos_v2')
    .select('pdf_url, data_aprovacao')
    .eq('atendimento_id', atendimento.atendimento_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    mensagens: data || [],
    proposta_pdf_url: orcamento?.data_aprovacao && orcamento.pdf_url ? orcamento.pdf_url : null,
  };
};

/* Simula o modo AUTOMATICO no teste: quando a IA para o orcamento em
   "Aguardando aprovacao" (membro no modo semiautomatico), aprova como o
   vendedor faria. So conversa de teste do proprio membro; o fluxo de
   aprovacao trata atendimento sandbox como envio simulado e nunca manda para
   o sistema externo do cliente (sales_v2_worker_buscar_contexto_aprovacao). */
export const sandboxAprovarOrcamentoService = async ({
  env,
  requesterAccessToken,
  atendimentoId,
}: SandboxServiceOptions & { atendimentoId: string }) => {
  const { adminClient, membro } = await resolverMembroDoRequester(env, requesterAccessToken);
  const atendimento = await buscarAtendimentoDeTeste(adminClient, membro.membro_id, atendimentoId);

  const { data: estado } = await adminClient
    .from('sales_atendimentos_v2')
    .select('status')
    .eq('atendimento_id', atendimento.atendimento_id)
    .eq('sandbox', true)
    .maybeSingle();

  if (estado?.status !== 'AGUARDANDO_APROVACAO') {
    return { aprovado: false, motivo: 'A conversa nao esta aguardando aprovacao.' };
  }

  const { data: orcamento } = await adminClient
    .from('sales_orcamentos_v2')
    .select('orcamento_id, data_aprovacao')
    .eq('atendimento_id', atendimento.atendimento_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!orcamento) {
    return { aprovado: false, motivo: 'Ainda nao ha orcamento nesta conversa.' };
  }
  if (orcamento.data_aprovacao) {
    return { aprovado: false, motivo: 'O orcamento ja foi aprovado.' };
  }

  let response: Response;
  try {
    response = await fetch(APROVAR_ORCAMENTO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orcamento_id: orcamento.orcamento_id,
        atendimento_id: atendimento.atendimento_id,
        membro_id: membro.membro_id,
      }),
    });
  } catch {
    throw new HttpError(502, 'Nao foi possivel falar com a automacao de aprovacao agora.');
  }

  if (!response.ok) {
    throw new HttpError(502, `A automacao de aprovacao recusou o pedido (status ${response.status}).`);
  }

  return { aprovado: true };
};

export const sandboxEnviarEmailService = async ({
  env,
  requesterAccessToken,
  texto,
  assunto,
  atendimentoId,
}: SandboxServiceOptions & { texto: string; assunto: string; atendimentoId: string }) => {
  const { adminClient, membro, emailIntegracao } = await resolverMembroDoRequester(env, requesterAccessToken);

  if (!env.sandboxWebhookToken) {
    throw new HttpError(500, 'O ambiente de teste nao esta configurado no servidor.');
  }

  if (!emailIntegracao) {
    throw new HttpError(400, 'Seu usuario ainda nao tem o e-mail de integracao configurado.');
  }

  const textoLimpo = String(texto || '').trim().slice(0, LIMITE_TEXTO);

  if (!textoLimpo) {
    throw new HttpError(400, 'Escreva a mensagem do lead.');
  }

  let emailLead: string;
  let assuntoFinal: string;
  let inReplyTo: string | null = null;

  if (atendimentoId) {
    // Continuacao: responde "em cima" da ultima mensagem da conversa, como um
    // cliente de e-mail faria. E assim que o "Resolver Atendimento" da Triagem
    // acha a conversa (in-reply-to + mesmo remetente).
    const atendimento = await buscarAtendimentoDeTeste(adminClient, membro.membro_id, atendimentoId);

    const { data: ultima, error: ultimaError } = await adminClient
      .from('sales_mensagens_v2')
      .select('provedor_message_id')
      .eq('atendimento_id', atendimento.atendimento_id)
      .not('provedor_message_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ultimaError) {
      throw new HttpError(500, ultimaError.message);
    }

    if (!atendimento.email_lead || !ultima?.provedor_message_id) {
      throw new HttpError(409, 'Aguarde a conversa terminar de ser processada antes de responder.');
    }

    emailLead = atendimento.email_lead;
    assuntoFinal = /^re:/i.test(atendimento.assunto || '') ? atendimento.assunto : `Re: ${atendimento.assunto || ''}`.trim();
    inReplyTo = ultima.provedor_message_id;
  } else {
    emailLead = `lead-${gerarId()}@${DOMINIO_TESTE}`;
    assuntoFinal = String(assunto || '').trim().slice(0, LIMITE_ASSUNTO) || 'Pedido de cotação';
  }

  const messageId = `sandbox-${Date.now()}-${gerarId()}@${DOMINIO_TESTE}`;

  // Mesmo formato que o Email Trigger (IMAP) entrega - a Triagem passa isso
  // direto para o "Normalizar Email" real.
  const payload = {
    sandbox: true,
    from: `Lead de teste <${emailLead}>`,
    to: emailIntegracao,
    subject: assuntoFinal,
    textPlain: textoLimpo,
    metadata: {
      'message-id': `<${messageId}>`,
      ...(inReplyTo ? { 'in-reply-to': `<${inReplyTo}>` } : {}),
    },
  };

  let response: Response;

  try {
    response = await fetch(TRIAGEM_EMAIL_TESTE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sandbox-token': env.sandboxWebhookToken,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new HttpError(502, 'Nao foi possivel falar com a automacao agora. Tente de novo.');
  }

  if (!response.ok) {
    throw new HttpError(502, `A automacao recusou a mensagem de teste (status ${response.status}).`);
  }

  return { email_lead: emailLead, assunto: assuntoFinal };
};

export const sandboxExcluirAtendimentoService = async ({
  env,
  requesterAccessToken,
  atendimentoId,
}: SandboxServiceOptions & { atendimentoId: string }) => {
  const { adminClient, membro } = await resolverMembroDoRequester(env, requesterAccessToken);

  // So passa daqui se for conversa de teste do proprio membro - nunca apaga
  // um atendimento real, mesmo que alguem mande outro id.
  const atendimento = await buscarAtendimentoDeTeste(adminClient, membro.membro_id, atendimentoId);
  const alvoId = atendimento.atendimento_id;

  const { data: orcamentos } = await adminClient
    .from('sales_orcamentos_v2')
    .select('orcamento_id')
    .eq('atendimento_id', alvoId);

  const orcamentoIds = (orcamentos || []).map((item) => item.orcamento_id);

  if (orcamentoIds.length) {
    await adminClient.from('sales_orcamentos_itens_v2').delete().in('orcamento_id', orcamentoIds);
    await adminClient.from('sales_orcamentos_v2').delete().in('orcamento_id', orcamentoIds);
  }

  await adminClient.from('sales_notificacoes_v2').delete().eq('atendimento_id', alvoId);
  await adminClient.from('sales_solicitacoes_itens_v2').delete().eq('atendimento_id', alvoId);
  await adminClient.from('sales_mensagens_v2').delete().eq('atendimento_id', alvoId);

  const { error: deleteAtendimentoError } = await adminClient
    .from('sales_atendimentos_v2')
    .delete()
    .eq('atendimento_id', alvoId)
    .eq('sandbox', true);

  if (deleteAtendimentoError) {
    throw new HttpError(500, deleteAtendimentoError.message);
  }

  return { excluido: true };
};
