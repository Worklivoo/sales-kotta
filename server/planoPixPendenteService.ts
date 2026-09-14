import { HttpError } from './createMemberService.js';
import { resolveAdminRequester, STATUS_FATURA_PAGA, type PlanoServiceEnv } from './planoAuth.js';
import { buscarCobranca, obterQrCodePix } from './asaasClient.js';
import { planoPagamentoStatusService } from './planoPagamentoStatusService.js';

interface PlanoPixPendenteServiceOptions {
  env: PlanoServiceEnv;
  requesterAccessToken: string;
}

/* Quem assinou por Pix e fechou o QR Code sem pagar ja tem assinatura no
   Asaas, entao a tela de plano apareceria como se o cliente estivesse
   contratado. Enquanto a PRIMEIRA cobranca nao e paga, a pagina reabre o Pix
   com o QR Code desta cobranca.

   "Primeira cobranca" = plano_status ainda nulo: a assinatura Pix nasce com
   plano_status nulo e so vira ATIVO quando o pagamento e confirmado. Depois
   disso, uma fatura em aberto e renovacao normal e nao reabre nada. */
export const planoPixPendenteService = async ({ env, requesterAccessToken }: PlanoPixPendenteServiceOptions) => {
  const { adminClient, asaasConfig, empresaId } = await resolveAdminRequester(env, requesterAccessToken);

  const { data: empresa, error: empresaError } = await adminClient
    .from('sales_empresas_v2')
    .select('asaas_subscription_id, plano_status, pagamento, plano, plano_ciclo')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (empresaError) throw new HttpError(500, empresaError.message);

  const forma = (empresa?.pagamento as { forma?: string } | null)?.forma;

  if (!empresa?.asaas_subscription_id || empresa.plano_status || forma !== 'PIX') {
    return { pendente: false };
  }

  const { data: fatura, error: faturaError } = await adminClient
    .from('sales_faturas_v2')
    .select('asaas_payment_id, valor, status')
    .eq('empresa_id', empresaId)
    .eq('tipo', 'ASSINATURA')
    .not('status', 'in', `(${STATUS_FATURA_PAGA.join(',')},REFUNDED)`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (faturaError) throw new HttpError(500, faturaError.message);
  if (!fatura?.asaas_payment_id) return { pendente: false };

  /* Confere no Asaas antes de mostrar o QR Code: se o pagamento ja caiu e o
     aviso automatico nao chegou, reconcilia aqui e nao reabre o popup. */
  const cobranca = await buscarCobranca(asaasConfig, fatura.asaas_payment_id as string);

  if (STATUS_FATURA_PAGA.includes(cobranca.status)) {
    await planoPagamentoStatusService({
      env,
      requesterAccessToken,
      paymentId: fatura.asaas_payment_id as string,
    });
    return { pendente: false, pagoAgora: true };
  }

  const qrCode = await obterQrCodePix(asaasConfig, fatura.asaas_payment_id as string);

  return {
    pendente: true,
    paymentId: fatura.asaas_payment_id as string,
    valor: Number(cobranca.value ?? fatura.valor),
    planoNome: empresa.plano as string | null,
    planoCiclo: empresa.plano_ciclo as string | null,
    pix: {
      qrCodeBase64: qrCode.encodedImage,
      copiaCola: qrCode.payload,
      expiracao: qrCode.expirationDate,
    },
  };
};
