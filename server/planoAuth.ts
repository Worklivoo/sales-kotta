import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './createMemberService.js';
import type { AsaasClientConfig, AsaasPayment } from './asaasClient.js';

export interface PlanoServiceEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  asaasEnv: string;
  asaasApiKey: string;
  asaasApiKeySandbox: string;
}

export interface AdminRequesterContext {
  adminClient: SupabaseClient;
  asaasConfig: AsaasClientConfig;
  userId: string;
  empresaId: string;
}

/* Toda mutacao de plano/pagamento exige que quem chamou esteja logado
   (Supabase auth) e seja ADMIN da propria empresa - mesma checagem que
   createMemberService.ts ja faz para adicionar membros. */
export const resolveAdminRequester = async (
  env: PlanoServiceEnv,
  requesterAccessToken: string,
): Promise<AdminRequesterContext> => {
  if (!env.supabaseUrl || !env.supabaseAnonKey || !env.supabaseServiceRoleKey) {
    throw new HttpError(
      500,
      'As credenciais do servidor para o modulo de plano nao estao configuradas. Defina SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor ou no arquivo .env.local.',
    );
  }

  if (!requesterAccessToken) {
    throw new HttpError(401, 'Não foi possível validar o usuário autenticado.');
  }

  const publicClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user: requesterUser },
    error: requesterUserError,
  } = await publicClient.auth.getUser(requesterAccessToken);

  if (requesterUserError || !requesterUser?.id) {
    throw new HttpError(401, 'Não foi possível validar o usuário autenticado.');
  }

  const { data: requesterMember, error: requesterMemberError } = await adminClient
    .from('sales_membros_v2')
    .select('empresa_id, cargo')
    .eq('user_id', requesterUser.id)
    .maybeSingle();

  if (requesterMemberError) {
    throw new HttpError(500, requesterMemberError.message);
  }

  if (!requesterMember?.empresa_id) {
    throw new HttpError(400, 'Não foi possível identificar a empresa do usuário atual.');
  }

  if (requesterMember.cargo !== 'ADMIN') {
    throw new HttpError(403, 'Somente administradores podem gerenciar o plano e o pagamento da empresa.');
  }

  return {
    adminClient,
    asaasConfig: {
      asaasEnv: env.asaasEnv,
      asaasApiKey: env.asaasApiKey,
      asaasApiKeySandbox: env.asaasApiKeySandbox,
    },
    userId: requesterUser.id,
    empresaId: requesterMember.empresa_id as string,
  };
};

/* Status que o Asaas usa para cobranca efetivamente paga. CONFIRMED = pago,
   aguardando repasse; RECEIVED = dinheiro na conta; RECEIVED_IN_CASH =
   baixa manual feita no painel do Asaas. */
export const STATUS_FATURA_PAGA = ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'];

/* Grava/atualiza a fatura assim que a gente ja sabe o resultado (cartao
   aprovado na hora, Pix criado) - nao depende do webhook estar configurado
   para aparecer no historico. Quando o webhook processa o mesmo pagamento
   depois, ele faz upsert na mesma linha (chave: asaas_payment_id), entao
   nunca duplica nem precisa de tabela de idempotencia. */
export const registrarFatura = async (
  adminClient: SupabaseClient,
  empresaId: string,
  tipo: 'ASSINATURA' | 'CREDITO_EXTRA',
  pagamento: AsaasPayment,
  creditosQuantidade?: number,
) => {
  await adminClient.from('sales_faturas_v2').upsert(
    {
      empresa_id: empresaId,
      asaas_payment_id: pagamento.id,
      tipo,
      valor: pagamento.value,
      status: pagamento.status,
      vencimento: pagamento.dueDate,
      invoice_url: pagamento.invoiceUrl,
      creditos_quantidade: creditosQuantidade ?? null,
    },
    { onConflict: 'asaas_payment_id' },
  );
};

/* Cliente suspenso automaticamente (limite do ciclo esgotado ou periodo
   gratis vencido) volta a ser atendido no instante em que resolve a
   pendencia - sem esperar o agendamento do n8n. A regra de quando reativar
   vive no banco (sales_v2_reavaliar_suspensao), porque a automacao usa
   exatamente a mesma. */
export const reavaliarSuspensao = async (adminClient: SupabaseClient, empresaId: string) => {
  const { error } = await adminClient.rpc('sales_v2_reavaliar_suspensao', {
    p_empresa_id: empresaId,
  });

  if (error) {
    // Nao derruba a operacao de pagamento por causa disso: o agendamento
    // reavalia de novo em minutos.
    console.error('Erro ao reavaliar suspensao da empresa:', error.message);
  }
};
