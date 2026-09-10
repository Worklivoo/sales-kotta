/* O ciclo de consumo (limite de cotacoes/mes) nao segue o mes calendario -
   segue a data em que o plano foi contratado ou trocado pela ultima vez
   (sales_empresas_v2.data_contratacao_atual). Ex: contratou dia 12, o ciclo
   vai sempre do dia 12 de um mes ate o dia 12 do mes seguinte. */

const ultimoDiaDoMes = (ano: number, mesIndiceZero: number) =>
  new Date(Date.UTC(ano, mesIndiceZero + 1, 0)).getUTCDate();

// Soma meses preservando o dia (clampado ao ultimo dia do mes de destino,
// ex: 31/01 + 1 mes = 28 ou 29/02) e o horario original.
export const somarMeses = (data: Date, meses: number): Date => {
  const dia = data.getUTCDate();
  const anoDestino = data.getUTCFullYear();
  const mesDestino = data.getUTCMonth() + meses;

  const resultado = new Date(Date.UTC(anoDestino, mesDestino, 1));
  const diaClampado = Math.min(dia, ultimoDiaDoMes(resultado.getUTCFullYear(), resultado.getUTCMonth()));

  resultado.setUTCDate(diaClampado);
  resultado.setUTCHours(
    data.getUTCHours(),
    data.getUTCMinutes(),
    data.getUTCSeconds(),
    data.getUTCMilliseconds(),
  );

  return resultado;
};

export interface CicloConsumo {
  inicio: Date;
  fim: Date;
}

export const calcularCicloAtual = (dataContratacao: Date, agora: Date = new Date()): CicloConsumo => {
  let n = 0;

  while (somarMeses(dataContratacao, n + 1).getTime() <= agora.getTime()) {
    n += 1;
  }

  return { inicio: somarMeses(dataContratacao, n), fim: somarMeses(dataContratacao, n + 1) };
};
