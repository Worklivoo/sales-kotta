import { HttpError } from './createMemberService.js';
import { resolveAdminRequester, type PlanoServiceEnv } from './planoAuth.js';

interface PlanoTrialResgatarServiceOptions {
  env: PlanoServiceEnv;
  requesterAccessToken: string;
  payload: { codigo?: string };
}

/* Codigos de trial sao fixos e reutilizaveis (varias empresas usam o mesmo
   codigo) e cada um define uma duracao em dias, nao uma data fixa. O trial
   libera o acesso sem teto de cotacoes ate a data final. */
export const planoTrialResgatarService = async ({
  env,
  requesterAccessToken,
  payload,
}: PlanoTrialResgatarServiceOptions) => {
  const { adminClient, empresaId } = await resolveAdminRequester(env, requesterAccessToken);

  const codigo = (payload?.codigo || '').trim().toUpperCase();

  if (!codigo) {
    throw new HttpError(400, 'Informe o código de período grátis.');
  }

  /* Trial e para quem ainda nao assinou. Com assinatura ativa o resgate e
     recusado - senao o cliente pagante cairia no estado "sem limite" do
     trial, o que nao faz sentido e mascararia o consumo real. */
  const { data: empresa, error: empresaError } = await adminClient
    .from('sales_empresas_v2')
    .select('asaas_subscription_id')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (empresaError) {
    throw new HttpError(500, empresaError.message);
  }

  if (empresa?.asaas_subscription_id) {
    throw new HttpError(
      400,
      'Esta empresa já tem um plano ativo. Cancele a assinatura antes de usar um código de período grátis.',
    );
  }

  const { data: codigoRow, error: codigoError } = await adminClient
    .from('sales_codigos_v2')
    .select('duracao_dias')
    .eq('codigo', codigo)
    .eq('tipo', 'TRIAL')
    .eq('ativo', true)
    .maybeSingle();

  if (codigoError) {
    throw new HttpError(500, codigoError.message);
  }

  if (!codigoRow) {
    throw new HttpError(400, 'Código inválido ou expirado.');
  }

  const dataFinalTrial = new Date();
  dataFinalTrial.setUTCDate(dataFinalTrial.getUTCDate() + (codigoRow.duracao_dias as number));

  const { error: updateError } = await adminClient
    .from('sales_empresas_v2')
    .update({ cliente_status: 'TRIAL', data_final_trial: dataFinalTrial.toISOString() })
    .eq('empresa_id', empresaId);

  if (updateError) {
    throw new HttpError(500, updateError.message);
  }

  return {
    message: 'Período grátis ativado com sucesso.',
    dataFinalTrial: dataFinalTrial.toISOString(),
    duracaoDias: codigoRow.duracao_dias as number,
  };
};
