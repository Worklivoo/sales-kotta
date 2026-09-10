import { HttpError } from './createMemberService.js';
import { arredondar } from './planosCiclos.js';

/* Pacotes de cotacoes extras. Tamanhos fixos, preco proporcional ao que a
   empresa ja paga por cotacao no plano dela - o extra nao e mais caro nem
   mais barato que o plano, so avulso. Igual aos ciclos, isso e regra
   estrutural e vive no codigo; o que muda sem deploy e o preco do plano. */

export type PacoteCodigo = 'PACOTE_25' | 'PACOTE_50' | 'PACOTE_100';

export interface Pacote {
  codigo: PacoteCodigo;
  cotacoes: number;
}

export const PACOTES: Pacote[] = [
  { codigo: 'PACOTE_25', cotacoes: 25 },
  { codigo: 'PACOTE_50', cotacoes: 50 },
  { codigo: 'PACOTE_100', cotacoes: 100 },
];

export const buscarPacote = (codigo: string): Pacote => {
  const pacote = PACOTES.find((item) => item.codigo === codigo);

  if (!pacote) {
    throw new HttpError(400, 'Pacote de cotações inválido ou indisponível.');
  }

  return pacote;
};

export interface PacoteCalculado extends Pacote {
  valorTotal: number;
  precoPorCotacao: number;
}

/* Preco por cotacao extra = mensalidade efetiva do plano (ja com cupom, se
   houver) dividida pelo limite mensal dele. */
export const calcularPacote = (
  pacote: Pacote,
  valorMensal: number,
  limiteMensal: number,
): PacoteCalculado => {
  const precoPorCotacao = valorMensal / limiteMensal;

  return {
    ...pacote,
    valorTotal: arredondar(precoPorCotacao * pacote.cotacoes),
    precoPorCotacao: arredondar(precoPorCotacao),
  };
};

export const calcularPacotes = (valorMensal: number, limiteMensal: number): PacoteCalculado[] =>
  PACOTES.map((pacote) => calcularPacote(pacote, valorMensal, limiteMensal));
