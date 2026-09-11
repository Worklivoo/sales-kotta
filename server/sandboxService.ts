import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './createMemberService.js';

interface SandboxServiceEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
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

// O sandbox sempre opera na empresa do proprio usuario logado - nunca recebe
// um empresa_id do cliente. Isso resolve duas coisas de uma vez: remove a
// necessidade de selecionar empresa na tela, e fecha a unica brecha de
// seguranca que existiria (nao da pra pedir dados de uma empresa que nao e a
// sua so trocando um parametro). Se a empresa do usuario nao for
// ambiente_teste=true, a acao falha com uma mensagem clara.
const resolverEmpresaSandboxDoRequester = async (env: SandboxServiceEnv, requesterAccessToken: string) => {
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
    .select('membro_id, empresa_id, canal_whatsapp, canal_email')
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
    .select('empresa_id, razao_social, ambiente_teste')
    .eq('empresa_id', membro.empresa_id)
    .maybeSingle();

  if (empresaError) {
    throw new HttpError(500, empresaError.message);
  }

  if (!empresa || empresa.ambiente_teste !== true) {
    throw new HttpError(
      403,
      'Sua empresa nao esta marcada como ambiente de teste (ambiente_teste=true). Fale com o time pra habilitar.',
    );
  }

  return { adminClient, empresa, membro };
};

export const sandboxObterMinhaEmpresaService = async ({ env, requesterAccessToken }: SandboxServiceOptions) => {
  const { empresa, membro } = await resolverEmpresaSandboxDoRequester(env, requesterAccessToken);
  const canalWhatsapp = (membro.canal_whatsapp || null) as { numero_meta_id?: string } | null;
  const canalEmail = (membro.canal_email || null) as { email_integracao?: string } | null;

  return {
    empresa_id: empresa.empresa_id,
    razao_social: empresa.razao_social,
    membro_id: membro.membro_id,
    numero_meta_id: canalWhatsapp?.numero_meta_id || null,
    email_integracao: canalEmail?.email_integracao || null,
  };
};

export const sandboxListarAtendimentosService = async ({ env, requesterAccessToken }: SandboxServiceOptions) => {
  const { adminClient, empresa } = await resolverEmpresaSandboxDoRequester(env, requesterAccessToken);

  const { data, error } = await adminClient
    .from('sales_atendimentos_v2')
    .select('atendimento_id, numero_ticket, telefone_lead, email_lead, origem, status, categoria, created_at, updated_at')
    .eq('empresa_id', empresa.empresa_id)
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
  const { adminClient, empresa } = await resolverEmpresaSandboxDoRequester(env, requesterAccessToken);

  if (!atendimentoId) {
    throw new HttpError(400, 'Informe o atendimento.');
  }

  const { data, error } = await adminClient
    .from('sales_mensagens_v2')
    .select('mensagem_id, created_at, origem, conteudo, anexos')
    .eq('empresa_id', empresa.empresa_id)
    .eq('atendimento_id', atendimentoId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new HttpError(500, error.message);
  }

  return { mensagens: data || [] };
};

export const sandboxConfigurarWhatsappService = async ({ env, requesterAccessToken }: SandboxServiceOptions) => {
  const { adminClient, empresa, membro } = await resolverEmpresaSandboxDoRequester(env, requesterAccessToken);

  const numeroMetaIdSimulado = `sandbox-${empresa.empresa_id.slice(0, 8)}`;
  const canalAtual = (membro.canal_whatsapp || {}) as Record<string, unknown>;

  const { error: updateError } = await adminClient
    .from('sales_membros_v2')
    .update({ canal_whatsapp: { ...canalAtual, numero_meta_id: numeroMetaIdSimulado } })
    .eq('membro_id', membro.membro_id);

  if (updateError) {
    throw new HttpError(500, updateError.message);
  }

  return { numero_meta_id: numeroMetaIdSimulado };
};

export const sandboxExcluirAtendimentoService = async ({
  env,
  requesterAccessToken,
  atendimentoId,
}: SandboxServiceOptions & { atendimentoId: string }) => {
  const { adminClient, empresa } = await resolverEmpresaSandboxDoRequester(env, requesterAccessToken);

  if (!atendimentoId) {
    throw new HttpError(400, 'Informe o atendimento.');
  }

  const { data: orcamentos } = await adminClient
    .from('sales_orcamentos_v2')
    .select('orcamento_id')
    .eq('empresa_id', empresa.empresa_id)
    .eq('atendimento_id', atendimentoId);

  const orcamentoIds = (orcamentos || []).map((item) => item.orcamento_id);

  if (orcamentoIds.length) {
    await adminClient.from('sales_orcamentos_itens_v2').delete().in('orcamento_id', orcamentoIds);
    await adminClient.from('sales_orcamentos_v2').delete().in('orcamento_id', orcamentoIds);
  }

  await adminClient.from('sales_solicitacoes_itens_v2').delete().eq('atendimento_id', atendimentoId);
  await adminClient.from('sales_mensagens_v2').delete().eq('atendimento_id', atendimentoId);

  const { error: deleteAtendimentoError } = await adminClient
    .from('sales_atendimentos_v2')
    .delete()
    .eq('empresa_id', empresa.empresa_id)
    .eq('atendimento_id', atendimentoId);

  if (deleteAtendimentoError) {
    throw new HttpError(500, deleteAtendimentoError.message);
  }

  return { excluido: true };
};
