import { HttpError } from './createMemberService.js';
import type { AsaasCycle } from './asaasClient.js';

/* Ciclos de cobranca oferecidos e o desconto de cada um. Isso e regra
   estrutural de precificacao (nao muda no dia a dia), por isso vive no
   codigo em vez de uma tabela - o que muda com mais frequencia e o PRECO
   dos planos, e esse sim fica em sales_planos_v2, editavel sem deploy. */

export type CicloCodigo = 'MENSAL' | 'TRIMESTRAL' | 'ANUAL';

export interface Ciclo {
  codigo: CicloCodigo;
  label: string;
  meses: number;
  descontoPct: number;
  asaasCycle: AsaasCycle;
}

export const CICLOS: Ciclo[] = [
  { codigo: 'MENSAL', label: 'Mensal', meses: 1, descontoPct: 0, asaasCycle: 'MONTHLY' },
  { codigo: 'TRIMESTRAL', label: 'Trimestral', meses: 3, descontoPct: 10, asaasCycle: 'QUARTERLY' },
  { codigo: 'ANUAL', label: 'Anual', meses: 12, descontoPct: 20, asaasCycle: 'YEARLY' },
];

export const arredondar = (valor: number) => Math.round(valor * 100) / 100;

export const buscarCiclo = (codigo: string): Ciclo => {
  const ciclo = CICLOS.find((item) => item.codigo === codigo);

  if (!ciclo) {
    throw new HttpError(400, 'Ciclo de cobrança inválido ou indisponível.');
  }

  return ciclo;
};

export interface DescontoCupom {
  codigo: string;
  descontoPct: number | null;
  descontoValor: number | null;
}

export interface PrecoCalculado {
  precoCheio: number;
  precoFinal: number;
  precoMesEquivalente: number;
  descontoAplicado: number;
}

/* Preco do ciclo = mensalidade x meses, com o desconto do ciclo, e depois o
   cupom (se houver) por cima. Cupom percentual e sobre o valor do ciclo ja
   com desconto de ciclo; cupom de valor fixo abate reais do total do ciclo.
   O piso e R$1,00 porque o Asaas nao aceita cobranca de valor zero. */
export const calcularPreco = (
  valorMensalBase: number,
  ciclo: Ciclo,
  cupom?: DescontoCupom | null,
): PrecoCalculado => {
  const precoCheio = arredondar(valorMensalBase * ciclo.meses * (1 - ciclo.descontoPct / 100));

  let precoFinal = precoCheio;

  if (cupom?.descontoPct) {
    precoFinal = arredondar(precoCheio * (1 - cupom.descontoPct / 100));
  } else if (cupom?.descontoValor) {
    precoFinal = arredondar(precoCheio - cupom.descontoValor);
  }

  if (precoFinal < 1) {
    precoFinal = 1;
  }

  return {
    precoCheio,
    precoFinal,
    precoMesEquivalente: arredondar(precoFinal / ciclo.meses),
    descontoAplicado: arredondar(precoCheio - precoFinal),
  };
};
