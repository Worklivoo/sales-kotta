/* Leitor de CSV feito a mao, de proposito: as armadilhas reais de
   planilha de cliente sao poucas e conhecidas, e uma dependencia nova
   custaria mais do que resolve.

   Cobre: delimitador variavel (, ; tab |), aspas com delimitador e
   quebra de linha dentro, aspas escapadas (""), BOM do Excel e CRLF. */

export interface PlanilhaLida {
  colunas: string[];
  linhas: Record<string, string>[];
  delimitador: string;
  totalLinhas: number;
}

const DELIMITADORES = [',', ';', '\t', '|'];

/* O delimitador certo e o que produz o maior numero de colunas de forma
   CONSISTENTE entre as primeiras linhas - contar so na primeira linha
   erra quando um cabecalho tem virgula dentro de aspas. */
export const detectarDelimitador = (texto: string): string => {
  const amostra = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  if (amostra.length === 0) return ',';

  let melhor = ',';
  let melhorNota = -1;

  for (const d of DELIMITADORES) {
    const contagens = amostra.map((linha) => dividirLinha(linha, d).length);
    const primeira = contagens[0];

    if (primeira < 2) continue;

    const consistentes = contagens.filter((c) => c === primeira).length;
    // consistencia pesa mais que quantidade de colunas
    const nota = consistentes * 100 + primeira;

    if (nota > melhorNota) {
      melhorNota = nota;
      melhor = d;
    }
  }

  return melhor;
};

/* Divide UMA linha ja isolada. Usado so na deteccao do delimitador -
   a leitura de verdade e feita pelo analisador completo abaixo, que
   entende quebra de linha dentro de aspas. */
const dividirLinha = (linha: string, delimitador: string): string[] => {
  const campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];

    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
      continue;
    }

    if (c === delimitador && !dentroDeAspas) {
      campos.push(atual);
      atual = '';
      continue;
    }

    atual += c;
  }

  campos.push(atual);
  return campos;
};

/* Analisador completo: percorre o texto inteiro caractere a caractere,
   porque um campo entre aspas pode conter quebra de linha e nesse caso
   dividir por "\n" antes quebraria o registro no meio. */
const analisar = (texto: string, delimitador: string): string[][] => {
  const linhas: string[][] = [];
  let campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];

    if (dentroDeAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          atual += '"';
          i += 1;
        } else {
          dentroDeAspas = false;
        }
      } else {
        atual += c;
      }
      continue;
    }

    if (c === '"') {
      dentroDeAspas = true;
      continue;
    }

    if (c === delimitador) {
      campos.push(atual);
      atual = '';
      continue;
    }

    if (c === '\r') {
      continue; // CRLF: o \n seguinte fecha a linha
    }

    if (c === '\n') {
      campos.push(atual);
      linhas.push(campos);
      campos = [];
      atual = '';
      continue;
    }

    atual += c;
  }

  // ultima linha, quando o arquivo nao termina em quebra
  if (atual !== '' || campos.length > 0) {
    campos.push(atual);
    linhas.push(campos);
  }

  return linhas;
};

export const lerCsv = (conteudo: string): PlanilhaLida => {
  // BOM do Excel vira um caractere invisivel colado no primeiro cabecalho
  const texto = conteudo.replace(/^﻿/, '');
  const delimitador = detectarDelimitador(texto);
  const bruto = analisar(texto, delimitador).filter((l) => l.some((c) => c.trim() !== ''));

  if (bruto.length === 0) {
    return { colunas: [], linhas: [], delimitador, totalLinhas: 0 };
  }

  const cabecalho = bruto[0].map((c) => c.trim());

  // Coluna sem nome atrapalha o de-para; damos um nome estavel.
  // Nome repetido tambem: viraria uma chave so no objeto da linha.
  const usados = new Map<string, number>();
  const colunas = cabecalho.map((nome, indice) => {
    const base = nome || `Coluna ${indice + 1}`;
    const vezes = usados.get(base) ?? 0;
    usados.set(base, vezes + 1);
    return vezes === 0 ? base : `${base} (${vezes + 1})`;
  });

  const linhas = bruto.slice(1).map((valores) => {
    const registro: Record<string, string> = {};
    colunas.forEach((coluna, indice) => {
      registro[coluna] = (valores[indice] ?? '').trim();
    });
    return registro;
  });

  return { colunas, linhas, delimitador, totalLinhas: linhas.length };
};
