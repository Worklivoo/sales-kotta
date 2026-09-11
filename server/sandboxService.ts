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

// Unica checagem de autorizacao do sandbox: exige um usuario autenticado de
// verdade, mas nao exige que ele pertenca a empresa de teste (o time do
// Worklivoo testa empresas de clientes que nao sao membros). O limite real de
// seguranca e outro: toda acao abaixo so enxerga/mexe em empresas com
// ambiente_teste=true, nunca em dados de cliente real, mesmo com token valido.
const validateRequester = async (
  publicClient: SupabaseClient,
  requesterAccessToken: string,
) => {
  if (!requesterAccessToken) {
    throw new HttpError(401, 'Nao foi possivel validar o usuario autenticado.');
  }

  const { data, error } = await publicClient.auth.getUser(requesterAccessToken);

  if (error || !data?.user?.id) {
    throw new HttpError(401, 'Nao foi possivel validar o usuario autenticado.');
  }
};

const assertEmpresaSandbox = async (
  adminClient: SupabaseClient,
  empresaId: string,
) => {
  const { data, error } = await adminClient
    .from('sales_empresas_v2')
    .select('empresa_id, razao_social, ambiente_teste')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message);
  }

  if (!data || data.ambiente_teste !== true) {
    throw new HttpError(403, 'Essa empresa nao esta marcada como ambiente de teste.');
  }

  return data;
};

export const sandboxListarEmpresasService = async ({ env, requesterAccessToken }: SandboxServiceOptions) => {
  const { publicClient, adminClient } = buildClients(env);
  await validateRequester(publicClient, requesterAccessToken);

  const { data: empresas, error: empresasError } = await adminClient
    .from('sales_empresas_v2')
    .select('empresa_id, razao_social')
    .eq('ambiente_teste', true)
    .order('razao_social', { ascending: true });

  if (empresasError) {
    throw new HttpError(500, empresasError.message);
  }

  const empresaIds = (empresas || []).map((empresa) => empresa.empresa_id);

  const { data: membros, error: membrosError } = await adminClient
    .from('sales_membros_v2')
    .select('empresa_id, membro_id, canal_whatsapp, canal_email, created_at')
    .in('empresa_id', empresaIds.length ? empresaIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: true });

  if (membrosError) {
    throw new HttpError(500, membrosError.message);
  }

  return {
    empresas: (empresas || []).map((empresa) => {
      const membro = (membros || []).find((item) => item.empresa_id === empresa.empresa_id) || null;
      const canalWhatsapp = (membro?.canal_whatsapp || null) as { numero_meta_id?: string } | null;
      const canalEmail = (membro?.canal_email || null) as { email_integracao?: string } | null;

      return {
        empresa_id: empresa.empresa_id,
        razao_social: empresa.razao_social,
        membro_id: membro?.membro_id || null,
        numero_meta_id: canalWhatsapp?.numero_meta_id || null,
        email_integracao: canalEmail?.email_integracao || null,
      };
    }),
  };
};

export const sandboxListarAtendimentosService = async ({
  env,
  requesterAccessToken,
  empresaId,
}: SandboxServiceOptions & { empresaId: string }) => {
  const { publicClient, adminClient } = buildClients(env);
  await validateRequester(publicClient, requesterAccessToken);

  if (!empresaId) {
    throw new HttpError(400, 'Informe a empresa.');
  }

  await assertEmpresaSandbox(adminClient, empresaId);

  const { data, error } = await adminClient
    .from('sales_atendimentos_v2')
    .select('atendimento_id, numero_ticket, telefone_lead, email_lead, origem, status, categoria, created_at, updated_at')
    .eq('empresa_id', empresaId)
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
  empresaId,
  atendimentoId,
}: SandboxServiceOptions & { empresaId: string; atendimentoId: string }) => {
  const { publicClient, adminClient } = buildClients(env);
  await validateRequester(publicClient, requesterAccessToken);

  if (!empresaId || !atendimentoId) {
    throw new HttpError(400, 'Informe a empresa e o atendimento.');
  }

  await assertEmpresaSandbox(adminClient, empresaId);

  const { data, error } = await adminClient
    .from('sales_mensagens_v2')
    .select('mensagem_id, created_at, origem, conteudo, anexos')
    .eq('empresa_id', empresaId)
    .eq('atendimento_id', atendimentoId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new HttpError(500, error.message);
  }

  return { mensagens: data || [] };
};

export const sandboxConfigurarWhatsappService = async ({
  env,
  requesterAccessToken,
  empresaId,
}: SandboxServiceOptions & { empresaId: string }) => {
  const { publicClient, adminClient } = buildClients(env);
  await validateRequester(publicClient, requesterAccessToken);

  if (!empresaId) {
    throw new HttpError(400, 'Informe a empresa.');
  }

  await assertEmpresaSandbox(adminClient, empresaId);

  const { data: membro, error: membroError } = await adminClient
    .from('sales_membros_v2')
    .select('membro_id, canal_whatsapp')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membroError) {
    throw new HttpError(500, membroError.message);
  }

  if (!membro) {
    throw new HttpError(400, 'Essa empresa ainda nao tem nenhum membro cadastrado.');
  }

  const numeroMetaIdSimulado = `sandbox-${empresaId.slice(0, 8)}`;
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
  empresaId,
  atendimentoId,
}: SandboxServiceOptions & { empresaId: string; atendimentoId: string }) => {
  const { publicClient, adminClient } = buildClients(env);
  await validateRequester(publicClient, requesterAccessToken);

  if (!empresaId || !atendimentoId) {
    throw new HttpError(400, 'Informe a empresa e o atendimento.');
  }

  await assertEmpresaSandbox(adminClient, empresaId);

  const { data: orcamentos } = await adminClient
    .from('sales_orcamentos_v2')
    .select('orcamento_id')
    .eq('empresa_id', empresaId)
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
    .eq('empresa_id', empresaId)
    .eq('atendimento_id', atendimentoId);

  if (deleteAtendimentoError) {
    throw new HttpError(500, deleteAtendimentoError.message);
  }

  return { excluido: true };
};
