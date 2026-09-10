import { supabase } from './supabase';

export class PlanoApiError extends Error {}

const getSessionAccessToken = async () => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new PlanoApiError(sessionError.message);
  }

  if (!session?.access_token) {
    throw new PlanoApiError('Não foi possível identificar a sessão atual do usuário.');
  }

  return session.access_token;
};

const chamarApi = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const accessToken = await getSessionAccessToken();

  const resposta = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  });

  const corpo = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    throw new PlanoApiError(corpo?.error || 'Não foi possível completar a operação.');
  }

  return corpo as T;
};

export interface CatalogoOpcao {
  planoCodigo: string;
  nome: string;
  limiteAtendimentosMes: number;
  ciclo: string;
  cicloLabel: string;
  meses: number;
  descontoPct: number;
  valorMensalBase: number;
  precoCicloTotal: number;
  precoMesEquivalente: number;
}

export interface Fatura {
  id: string;
  asaas_payment_id: string;
  tipo: string;
  valor: number;
  status: string;
  vencimento: string | null;
  invoice_url: string | null;
  creditos_quantidade: number | null;
  created_at: string;
}

export interface PacoteExtra {
  codigo: string;
  cotacoes: number;
  valorTotal: number;
  precoPorCotacao: number;
}

export interface ConsumoResposta {
  empresa: {
    planoCodigo: string | null;
    planoNome: string | null;
    planoCiclo: string | null;
    valorMensal: number | null;
    planoStatus: string | null;
    clienteStatus: string | null;
    dataFinalTrial: string | null;
    assinaturaPeriodoFim: string | null;
    limiteAtendimentosMes: number;
    nomeResponsavel: string | null;
    cnpj: string | null;
    emailResponsavel: string | null;
    telefoneResponsavel: string | null;
    enderecoFaturamento: { cep?: string; numero?: string; complemento?: string } | null;
    temAssinaturaAtiva: boolean;
    emTrialAtivo: boolean;
    formaPagamento: string | null;
    cartao: { bandeira: string | null; final4: string } | null;
    temCartaoSalvo: boolean;
    cupom: { codigo: string; descontoPct: number | null; descontoValor: number | null } | null;
  };
  consumoCiclo: {
    cicloInicio: string | null;
    cicloFim: string | null;
    qtdCotacoes: number;
    creditosExtras: number;
    limiteEfetivo: number;
    limiteAtingido: boolean;
    semLimite: boolean;
  };
  pacotesExtras: PacoteExtra[];
  faturas: Fatura[];
}

export interface CupomValidado {
  codigo: string;
  descricao: string | null;
  descontoPct: number | null;
  descontoValor: number | null;
  precoCheio: number;
  precoFinal: number;
  precoMesEquivalente: number;
  descontoAplicado: number;
}

export interface DadosCobranca {
  nome: string;
  cnpj: string;
  email: string;
  celular: string;
}

export interface DadosCartao {
  numero: string;
  nomeImpresso: string;
  validadeMes: string;
  validadeAno: string;
  cvv: string;
  cep: string;
  numeroEndereco: string;
  complemento?: string;
}

export type FormaPagamento = 'PIX' | 'CREDIT_CARD';

export interface AssinarPlanoResultado {
  tipo: 'ATUALIZADO' | 'PIX' | 'CARTAO';
  precoCheio: number;
  precoFinal: number;
  precoMesEquivalente: number;
  descontoAplicado: number;
  paymentId?: string | null;
  pix?: { qrCodeBase64: string; copiaCola: string; expiracao: string } | null;
  aprovado?: boolean;
  cartao?: { bandeira: string; final4: string } | null;
}

export const fetchCatalogoPlanos = () => chamarApi<{ planos: CatalogoOpcao[] }>('/api/plano-catalogo');

export const fetchConsumoPlano = () => chamarApi<ConsumoResposta>('/api/plano-consumo');

export const validarCupom = (codigo: string, planoCodigo: string, ciclo: string) =>
  chamarApi<CupomValidado>(
    `/api/plano-cupom?codigo=${encodeURIComponent(codigo)}&planoCodigo=${encodeURIComponent(planoCodigo)}&ciclo=${encodeURIComponent(ciclo)}`,
  );

export const assinarPlano = (input: {
  planoCodigo: string;
  ciclo: string;
  dadosCobranca: DadosCobranca;
  cupom?: string;
  pagamento?: { forma: FormaPagamento; cartao?: DadosCartao };
}) =>
  chamarApi<AssinarPlanoResultado>('/api/plano-assinar', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const cancelarPlano = () =>
  chamarApi<{ message: string; acessoAte: string | null }>('/api/plano-cancelar', { method: 'POST' });

export interface CreditosExtraResultado {
  tipo: 'PIX' | 'CARTAO';
  cotacoes: number;
  valorTotal: number;
  paymentId: string;
  pix?: { qrCodeBase64: string; copiaCola: string; expiracao: string } | null;
  aprovado?: boolean;
  cartao?: { bandeira: string | null; final4: string } | null;
}

export const comprarCreditosExtra = (input: { pacoteCodigo: string; forma: FormaPagamento }) =>
  chamarApi<CreditosExtraResultado>('/api/plano-creditos-extra', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const verificarStatusPagamento = (paymentId: string) =>
  chamarApi<{ pago: boolean; status: string }>(
    `/api/plano-pagamento-status?paymentId=${encodeURIComponent(paymentId)}`,
  );

export const resgatarTrial = (codigo: string) =>
  chamarApi<{ message: string; dataFinalTrial: string; duracaoDias: number }>('/api/plano-trial-resgatar', {
    method: 'POST',
    body: JSON.stringify({ codigo }),
  });
