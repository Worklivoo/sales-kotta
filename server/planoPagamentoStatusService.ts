import { HttpError } from './createMemberService.js';
import {
  resolveAdminRequester,
  registrarFatura,
  reavaliarSuspensao,
  STATUS_FATURA_PAGA,
  type PlanoServiceEnv,
} from './planoAuth.js';
import { buscarCobranca } from './asaasClient.js';

interface PlanoPagamentoStatusServiceOptions {
  env: PlanoServiceEnv;
  requesterAccessToken: string;
  paymentId: string;
}

/* Checagem sob demanda do status de uma cobranca (botao "Ja paguei" na tela
   do Pix). Serve como fallback do webhook: se o webhook ainda nao chegou -
   ou nem esta configurado - o cliente consegue confirmar na hora. Os dois
   caminhos convergem para o mesmo estado, sem conflito. */
export const planoPagamentoStatusService = async ({
  env,
  requesterAccessToken,
  paymentId,
}: PlanoPagamentoStatusServiceOptions) => {
  const { adminClient, asaasConfig, empresaId } = await resolveAdminRequester(env, requesterAccessToken);

  if (!paymentId) {
    throw new HttpError(400, 'Informe o pagamento a verificar.');
  }

  const cobranca = await buscarCobranca(asaasConfig, paymentId);
  const pago = STATUS_FATURA_PAGA.includes(cobranca.status);

  const { data: faturaExistente } = await adminClient
    .from('sales_faturas_v2')
    .select('tipo, creditos_quantidade')
    .eq('asaas_payment_id', paymentId)
    .maybeSingle();

  const tipo = (faturaExistente?.tipo as 'ASSINATURA' | 'CREDITO_EXTRA' | undefined)
    || (cobranca.subscription ? 'ASSINATURA' : 'CREDITO_EXTRA');

  await registrarFatura(
    adminClient,
    empresaId,
    tipo,
    cobranca,
    (faturaExistente?.creditos_quantidade as number | null) ?? undefined,
  );

  if (pago && tipo === 'ASSINATURA') {
    const { error: updateError } = await adminClient
      .from('sales_empresas_v2')
      .update({ plano_status: 'ATIVO' })
      .eq('empresa_id', empresaId);

    if (updateError) {
      throw new HttpError(500, updateError.message);
    }

    // So promove cliente_status para ATIVO se estava em implantacao/trial -
    // nao mexe em quem esta STANDBY/DESATIVO por decisao administrativa.
    await adminClient
      .from('sales_empresas_v2')
      .update({ cliente_status: 'ATIVO' })
      .eq('empresa_id', empresaId)
      .in('cliente_status', ['IMPLANTACAO', 'TRIAL']);
  }

  // Pagou a assinatura ou as cotacoes extras: se estava suspenso por
  // limite/trial, o atendimento volta agora.
  if (pago) {
    await reavaliarSuspensao(adminClient, empresaId);
  }

  return { pago, status: cobranca.status };
};
