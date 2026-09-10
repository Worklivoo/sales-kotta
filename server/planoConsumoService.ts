import { HttpError } from './createMemberService.js';
import { resolveAdminRequester, STATUS_FATURA_PAGA, type PlanoServiceEnv } from './planoAuth.js';
import { calcularCicloAtual } from './cicloConsumo.js';
import { calcularPacotes } from './creditosPacotes.js';

interface PlanoConsumoServiceOptions {
  env: PlanoServiceEnv;
  requesterAccessToken: string;
}

interface FaturaRow {
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

export const planoConsumoService = async ({ env, requesterAccessToken }: PlanoConsumoServiceOptions) => {
  const { adminClient, empresaId } = await resolveAdminRequester(env, requesterAccessToken);

  const { data: empresa, error: empresaError } = await adminClient
    .from('sales_empresas_v2')
    .select(
      'plano, plano_codigo, plano_ciclo, valor_mensal, plano_status, cliente_status, data_final_trial, assinatura_periodo_fim, limite_atendimentos_mes, nome_responsavel, cnpj, email_responsavel, telefone_responsavel, endereco_faturamento, asaas_subscription_id, data_contratacao_atual, pagamento',
    )
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (empresaError) {
    throw new HttpError(500, empresaError.message);
  }

  if (!empresa) {
    throw new HttpError(404, 'Empresa não encontrada.');
  }

  const cicloAtual = empresa.data_contratacao_atual
    ? calcularCicloAtual(new Date(empresa.data_contratacao_atual as string))
    : null;

  const inicioCicloISO = cicloAtual ? cicloAtual.inicio.toISOString() : null;
  const fimCicloISO = cicloAtual ? cicloAtual.fim.toISOString() : null;

  const [{ count: qtdCotacoesCiclo, error: consumoError }, { data: faturas, error: faturasError }] =
    await Promise.all([
      cicloAtual
        ? adminClient
            .from('sales_atendimentos_v2')
            .select('atendimento_id', { count: 'exact', head: true })
            .eq('empresa_id', empresaId)
            .eq('categoria', 'COTACAO')
            .gte('created_at', inicioCicloISO as string)
            .lt('created_at', fimCicloISO as string)
        : Promise.resolve({ count: 0, error: null }),
      adminClient
        .from('sales_faturas_v2')
        .select(
          'id, asaas_payment_id, tipo, valor, status, vencimento, invoice_url, creditos_quantidade, created_at',
        )
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

  if (consumoError) {
    throw new HttpError(500, consumoError.message);
  }

  if (faturasError) {
    throw new HttpError(500, faturasError.message);
  }

  const listaFaturas = (faturas || []) as unknown as FaturaRow[];

  /* Creditos extras do ciclo saem das proprias faturas: fatura de credito
     extra, paga, criada dentro da janela do ciclo atual. Uma tabela separada
     so pra isso era redundante.

     A comparacao e feita em timestamp, nunca em texto: o PostgREST devolve
     created_at no fuso do banco (-03:00) e o ciclo e calculado em UTC (Z),
     entao comparar as strings dava resultado errado. */
  const creditosExtras = cicloAtual
    ? listaFaturas
        .filter((fatura) => {
          if (fatura.tipo !== 'CREDITO_EXTRA' || !STATUS_FATURA_PAGA.includes(fatura.status)) {
            return false;
          }

          const criadaEm = new Date(fatura.created_at).getTime();
          return criadaEm >= cicloAtual.inicio.getTime() && criadaEm < cicloAtual.fim.getTime();
        })
        .reduce((total, fatura) => total + (fatura.creditos_quantidade || 0), 0)
    : 0;

  const pagamento = (empresa.pagamento || {}) as {
    forma?: string;
    cartao?: { bandeira?: string; final4?: string; token?: string | null };
    cupom?: { codigo?: string; desconto_pct?: number | null; desconto_valor?: number | null };
  };

  const limiteBase = empresa.limite_atendimentos_mes || 0;
  const limiteEfetivo = limiteBase + creditosExtras;
  const qtdCotacoes = qtdCotacoesCiclo || 0;

  const emTrialAtivo =
    empresa.cliente_status === 'TRIAL' &&
    Boolean(empresa.data_final_trial) &&
    new Date(empresa.data_final_trial as string).getTime() > Date.now();

  return {
    empresa: {
      planoCodigo: empresa.plano_codigo,
      planoNome: empresa.plano,
      planoCiclo: empresa.plano_ciclo,
      valorMensal: empresa.valor_mensal === null ? null : Number(empresa.valor_mensal),
      planoStatus: empresa.plano_status,
      clienteStatus: empresa.cliente_status,
      dataFinalTrial: empresa.data_final_trial,
      assinaturaPeriodoFim: empresa.assinatura_periodo_fim,
      limiteAtendimentosMes: limiteBase,
      nomeResponsavel: empresa.nome_responsavel,
      cnpj: empresa.cnpj,
      emailResponsavel: empresa.email_responsavel,
      telefoneResponsavel: empresa.telefone_responsavel,
      enderecoFaturamento: empresa.endereco_faturamento as {
        cep?: string;
        numero?: string;
        complemento?: string;
      } | null,
      temAssinaturaAtiva: Boolean(empresa.asaas_subscription_id),
      emTrialAtivo,
      formaPagamento: pagamento.forma || null,
      cartao: pagamento.cartao?.final4
        ? { bandeira: pagamento.cartao.bandeira || null, final4: pagamento.cartao.final4 }
        : null,
      /* O token em si nunca sai do servidor - o front so precisa saber se da
         para oferecer "cobrar no cartao salvo". */
      temCartaoSalvo: Boolean(pagamento.cartao?.token),
      cupom: pagamento.cupom?.codigo
        ? {
            codigo: pagamento.cupom.codigo,
            descontoPct: pagamento.cupom.desconto_pct ?? null,
            descontoValor: pagamento.cupom.desconto_valor ?? null,
          }
        : null,
    },
    consumoCiclo: {
      cicloInicio: inicioCicloISO,
      cicloFim: fimCicloISO,
      qtdCotacoes,
      creditosExtras,
      limiteEfetivo,
      limiteAtingido: limiteEfetivo > 0 && qtdCotacoes >= limiteEfetivo,
      // Durante o trial o acesso e liberado, sem teto de cotacoes.
      semLimite: emTrialAtivo,
    },
    /* Pacotes de cotacoes extras ja com o preco desta empresa. Vem do
       servidor para o front nao recalcular preco por conta propria. */
    pacotesExtras:
      empresa.valor_mensal && limiteBase
        ? calcularPacotes(Number(empresa.valor_mensal), limiteBase)
        : [],
    faturas: listaFaturas,
  };
};
