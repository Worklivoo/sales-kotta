import { HttpError } from './createMemberService.js';

const ASAAS_BASE_URL_SANDBOX = 'https://api-sandbox.asaas.com/v3';
const ASAAS_BASE_URL_PRODUCTION = 'https://api.asaas.com/v3';

export type AsaasCycle = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export interface AsaasClientConfig {
  asaasEnv: string;
  asaasApiKey: string;
  asaasApiKeySandbox: string;
}

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
  email?: string | null;
  mobilePhone?: string | null;
}

export interface AsaasSubscription {
  id: string;
  customer: string;
  value: number;
  cycle: AsaasCycle;
  status: string;
  nextDueDate: string;
  creditCard?: {
    creditCardNumber: string;
    creditCardBrand: string;
    /* Token do cartao para cobrancas futuras (cotacoes extras). Nao e o
       numero do cartao - e uma referencia opaca guardada pelo provedor. */
    creditCardToken?: string | null;
  } | null;
}

export interface CartaoDados {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

export interface TitularCartaoDados {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone: string;
  addressComplement?: string;
}

export interface AsaasPixQrCode {
  encodedImage: string;
  payload: string;
  expirationDate: string;
}

export interface AsaasPayment {
  id: string;
  customer: string;
  subscription?: string | null;
  value: number;
  netValue?: number;
  status: string;
  dueDate: string;
  paymentDate?: string | null;
  invoiceUrl: string;
  billingType: string;
}

const resolveBaseUrlAndKey = (config: AsaasClientConfig) => {
  const isProduction = config.asaasEnv === 'production';
  const apiKey = isProduction ? config.asaasApiKey : config.asaasApiKeySandbox;

  if (!apiKey) {
    /* Detalhe tecnico fica so no log do servidor - a mensagem que sobe para
       o usuario final (via HttpError) nunca cita o provedor de pagamentos. */
    console.error(
      `[asaasClient] Chave da API nao configurada para o ambiente "${config.asaasEnv || 'sandbox'}". Defina ASAAS_API_KEY${isProduction ? '' : '_SANDBOX'} no ambiente do servidor ou no arquivo .env.local.`,
    );
    throw new HttpError(500, 'O sistema de pagamentos não está configurado corretamente. Entre em contato com o suporte.');
  }

  return {
    baseUrl: isProduction ? ASAAS_BASE_URL_PRODUCTION : ASAAS_BASE_URL_SANDBOX,
    apiKey,
  };
};

async function chamarAsaas<T>(
  config: AsaasClientConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { baseUrl, apiKey } = resolveBaseUrlAndKey(config);

  const resposta = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: apiKey,
      ...(init?.headers || {}),
    },
  });

  const corpo = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    /* corpo?.errors[0]?.description e a mensagem de validacao do provedor
       (ex: "O celular informado e invalido") - ja vem em portugues claro,
       sem citar o provedor, entao repassamos direto para o usuario final. */
    const mensagem =
      corpo?.errors?.[0]?.description ||
      corpo?.message ||
      'Não foi possível processar o pagamento agora. Tente novamente em instantes.';
    throw new HttpError(resposta.status >= 400 && resposta.status < 500 ? 400 : 502, mensagem);
  }

  return corpo as T;
}

export const buscarClientePorCpfCnpj = async (
  config: AsaasClientConfig,
  cpfCnpj: string,
): Promise<AsaasCustomer | null> => {
  const resultado = await chamarAsaas<{ data: AsaasCustomer[] }>(
    config,
    `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}`,
  );

  return resultado.data?.[0] || null;
};

export const criarCliente = async (
  config: AsaasClientConfig,
  dados: { name: string; cpfCnpj: string; email?: string; mobilePhone?: string },
): Promise<AsaasCustomer> =>
  chamarAsaas<AsaasCustomer>(config, '/customers', {
    method: 'POST',
    body: JSON.stringify(dados),
  });

export const atualizarCliente = async (
  config: AsaasClientConfig,
  customerId: string,
  dados: { name?: string; email?: string; mobilePhone?: string },
): Promise<AsaasCustomer> =>
  chamarAsaas<AsaasCustomer>(config, `/customers/${encodeURIComponent(customerId)}`, {
    method: 'POST',
    body: JSON.stringify(dados),
  });

export const criarAssinatura = async (
  config: AsaasClientConfig,
  dados: {
    customer: string;
    value: number;
    cycle: AsaasCycle;
    nextDueDate: string;
    description: string;
    billingType?: 'UNDEFINED' | 'BOLETO' | 'PIX' | 'CREDIT_CARD';
  },
): Promise<AsaasSubscription> =>
  chamarAsaas<AsaasSubscription>(config, '/subscriptions', {
    method: 'POST',
    body: JSON.stringify({ billingType: 'UNDEFINED', ...dados }),
  });

export const criarAssinaturaComCartao = async (
  config: AsaasClientConfig,
  dados: {
    customer: string;
    value: number;
    cycle: AsaasCycle;
    nextDueDate: string;
    description: string;
    remoteIp: string;
    creditCard: CartaoDados;
    creditCardHolderInfo: TitularCartaoDados;
  },
): Promise<AsaasSubscription> =>
  chamarAsaas<AsaasSubscription>(config, '/subscriptions', {
    method: 'POST',
    body: JSON.stringify({ billingType: 'CREDIT_CARD', ...dados }),
  });

export const obterQrCodePix = async (
  config: AsaasClientConfig,
  paymentId: string,
): Promise<AsaasPixQrCode> =>
  chamarAsaas<AsaasPixQrCode>(config, `/payments/${encodeURIComponent(paymentId)}/pixQrCode`);

export const atualizarAssinatura = async (
  config: AsaasClientConfig,
  subscriptionId: string,
  dados: { value?: number; cycle?: AsaasCycle; description?: string },
): Promise<AsaasSubscription> =>
  chamarAsaas<AsaasSubscription>(config, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'PUT',
    body: JSON.stringify(dados),
  });

export const cancelarAssinatura = async (
  config: AsaasClientConfig,
  subscriptionId: string,
): Promise<void> => {
  await chamarAsaas(config, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'DELETE',
  });
};

export const listarCobrancasDaAssinatura = async (
  config: AsaasClientConfig,
  subscriptionId: string,
): Promise<AsaasPayment[]> => {
  const resultado = await chamarAsaas<{ data: AsaasPayment[] }>(
    config,
    `/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=1`,
  );

  return resultado.data || [];
};

export const criarCobrancaPix = async (
  config: AsaasClientConfig,
  dados: { customer: string; value: number; dueDate: string; description: string },
): Promise<AsaasPayment> =>
  chamarAsaas<AsaasPayment>(config, '/payments', {
    method: 'POST',
    body: JSON.stringify({ billingType: 'PIX', ...dados }),
  });

/* Cobranca avulsa no cartao ja tokenizado na assinatura - o cliente nao
   digita o cartao de novo. O provedor responde com a cobranca ja processada
   (aprovada) ou com erro de recusa. */
export const criarCobrancaComCartaoSalvo = async (
  config: AsaasClientConfig,
  dados: {
    customer: string;
    value: number;
    dueDate: string;
    description: string;
    creditCardToken: string;
    remoteIp: string;
  },
): Promise<AsaasPayment> =>
  chamarAsaas<AsaasPayment>(config, '/payments', {
    method: 'POST',
    body: JSON.stringify({ billingType: 'CREDIT_CARD', ...dados }),
  });

export const buscarCobranca = async (
  config: AsaasClientConfig,
  paymentId: string,
): Promise<AsaasPayment> =>
  chamarAsaas<AsaasPayment>(config, `/payments/${encodeURIComponent(paymentId)}`);
