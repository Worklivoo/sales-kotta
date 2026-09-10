import { HttpError } from './createMemberService.js';
import { resolveAdminRequester, type PlanoServiceEnv } from './planoAuth.js';
import { cancelarAssinatura } from './asaasClient.js';

interface PlanoCancelarServiceOptions {
  env: PlanoServiceEnv;
  requesterAccessToken: string;
}

export const planoCancelarService = async ({ env, requesterAccessToken }: PlanoCancelarServiceOptions) => {
  const { adminClient, asaasConfig, empresaId } = await resolveAdminRequester(env, requesterAccessToken);

  const { data: empresa, error: empresaError } = await adminClient
    .from('sales_empresas_v2')
    .select('asaas_subscription_id, assinatura_periodo_fim')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (empresaError) {
    throw new HttpError(500, empresaError.message);
  }

  if (!empresa?.asaas_subscription_id) {
    throw new HttpError(400, 'Esta empresa não tem uma assinatura ativa para cancelar.');
  }

  await cancelarAssinatura(asaasConfig, empresa.asaas_subscription_id as string);

  const { error: updateError } = await adminClient
    .from('sales_empresas_v2')
    // asaas_subscription_id volta pra null: a assinatura foi apagada no Asaas,
    // entao um novo "assinar" depois disso tem que criar uma assinatura nova
    // (com forma de pagamento de novo) em vez de tentar atualizar uma que nao
    // existe mais la. asaas_customer_id fica, o cadastro do cliente continua.
    .update({ plano_status: 'CANCELADO', asaas_subscription_id: null })
    .eq('empresa_id', empresaId);

  if (updateError) {
    throw new HttpError(500, updateError.message);
  }

  return {
    message: 'Assinatura cancelada. O acesso continua até o fim do período já pago.',
    acessoAte: empresa.assinatura_periodo_fim || null,
  };
};
