import { HttpError } from './createMemberService.js';
import {
  resolveAdminRequester,
  registrarFatura,
  reavaliarSuspensao,
  STATUS_FATURA_PAGA,
  type PlanoServiceEnv,
} from './planoAuth.js';
import { criarCobrancaPix, criarCobrancaComCartaoSalvo, obterQrCodePix } from './asaasClient.js';
import { buscarPacote, calcularPacote } from './creditosPacotes.js';

interface PlanoCreditosExtraServiceOptions {
  env: PlanoServiceEnv;
  requesterAccessToken: string;
  remoteIp: string;
  payload: { pacoteCodigo?: string; forma?: 'PIX' | 'CREDIT_CARD' };
}

const hojeMaisDias = (dias: number) => {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
};

/* Compra de cotacoes extras dentro da nossa propria tela: Pix devolve o QR
   Code na resposta, e cartao cobra no cartao ja tokenizado na assinatura.
   Em nenhum dos dois casos o cliente sai do sistema. */
export const planoCreditosExtraService = async ({
  env,
  requesterAccessToken,
  remoteIp,
  payload,
}: PlanoCreditosExtraServiceOptions) => {
  const { adminClient, asaasConfig, empresaId } = await resolveAdminRequester(env, requesterAccessToken);

  const pacote = buscarPacote((payload?.pacoteCodigo || '').trim());
  const forma = payload?.forma === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX';

  const { data: empresa, error: empresaError } = await adminClient
    .from('sales_empresas_v2')
    .select('asaas_customer_id, valor_mensal, limite_atendimentos_mes, pagamento')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (empresaError) {
    throw new HttpError(500, empresaError.message);
  }

  if (!empresa?.asaas_customer_id || !empresa.limite_atendimentos_mes || !empresa.valor_mensal) {
    throw new HttpError(400, 'Contrate um plano antes de comprar cotações extras.');
  }

  const calculado = calcularPacote(
    pacote,
    Number(empresa.valor_mensal),
    Number(empresa.limite_atendimentos_mes),
  );

  const pagamento = (empresa.pagamento || {}) as {
    cartao?: { bandeira?: string; final4?: string; token?: string | null };
  };

  const descricao = `Sales Kotta - ${calculado.cotacoes} cotacoes extras`;
  const dadosCobranca = {
    customer: empresa.asaas_customer_id as string,
    value: calculado.valorTotal,
    description: descricao,
  };

  if (forma === 'CREDIT_CARD') {
    const token = pagamento.cartao?.token;

    if (!token) {
      throw new HttpError(
        400,
        'Nenhum cartão salvo nesta conta. Pague com Pix ou assine o plano no cartão para poder cobrar as cotações extras nele.',
      );
    }

    const cobranca = await criarCobrancaComCartaoSalvo(asaasConfig, {
      ...dadosCobranca,
      dueDate: hojeMaisDias(0),
      creditCardToken: token,
      remoteIp,
    });

    await registrarFatura(adminClient, empresaId, 'CREDITO_EXTRA', cobranca, calculado.cotacoes);

    // Aprovado no cartao, as cotacoes valem na hora: se o cliente estava
    // suspenso por limite, o atendimento volta imediatamente.
    if (STATUS_FATURA_PAGA.includes(cobranca.status)) {
      await reavaliarSuspensao(adminClient, empresaId);
    }

    return {
      tipo: 'CARTAO' as const,
      cotacoes: calculado.cotacoes,
      valorTotal: calculado.valorTotal,
      paymentId: cobranca.id,
      aprovado: STATUS_FATURA_PAGA.includes(cobranca.status),
      cartao: pagamento.cartao?.final4
        ? { bandeira: pagamento.cartao.bandeira || null, final4: pagamento.cartao.final4 }
        : null,
    };
  }

  const cobranca = await criarCobrancaPix(asaasConfig, {
    ...dadosCobranca,
    dueDate: hojeMaisDias(1),
  });

  const qrCode = await obterQrCodePix(asaasConfig, cobranca.id);

  await registrarFatura(adminClient, empresaId, 'CREDITO_EXTRA', cobranca, calculado.cotacoes);

  return {
    tipo: 'PIX' as const,
    cotacoes: calculado.cotacoes,
    valorTotal: calculado.valorTotal,
    paymentId: cobranca.id,
    pix: qrCode
      ? { qrCodeBase64: qrCode.encodedImage, copiaCola: qrCode.payload, expiracao: qrCode.expirationDate }
      : null,
  };
};
