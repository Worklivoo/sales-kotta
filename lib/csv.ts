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
  let campoComecou = false;

  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];

    if (dentroDeAspas) {
      if (c === '"') {
        const proximo = linha[i + 1];
        if (proximo === '"') {
          atual += '"';
          i += 1;
        } else if (proximo === undefined || proximo === delimitador) {
          dentroDeAspas = false;
        } else {
          atual += '"';
        }
      } else {
        atual += c;
      }
      continue;
    }

    if (c === '"' && !campoComecou) {
      dentroDeAspas = true;
      campoComecou = true;
      continue;
    }

    if (c === delimitador) {
      campos.push(atual);
      atual = '';
      campoComecou = false;
      continue;
    }

    atual += c;
    campoComecou = true;
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
  let campoComecou = false; // ja consumimos algum caractere deste campo?

  const fecharCampo = () => {
    campos.push(atual);
    atual = '';
    campoComecou = false;
  };

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];

    if (dentroDeAspas) {
      if (c === '"') {
        const proximo = texto[i + 1];

        if (proximo === '"') {
          atual += '"';
          i += 1;
        } else if (proximo === undefined || proximo === delimitador || proximo === '\n' || proximo === '\r') {
          dentroDeAspas = false;
        } else {
          // Aspa no meio de um campo citado, sem estar escapada. Planilha
          // de cliente faz isso o tempo todo (medida em polegada). Tratar
          // como fim do campo comeria o resto da linha, entao vale como
          // caractere comum.
          atual += '"';
        }
      } else {
        atual += c;
      }
      continue;
    }

    if (c === '"' && !campoComecou) {
      dentroDeAspas = true;
      campoComecou = true;
      continue;
    }

    if (c === delimitador) {
      fecharCampo();
      continue;
    }

    if (c === '\r') {
      continue; // CRLF: o \n seguinte fecha a linha
    }

    if (c === '\n') {
      fecharCampo();
      linhas.push(campos);
      campos = [];
      continue;
    }

    /* Aspa que aparece DEPOIS do campo ter comecado nao abre citacao -
       e conteudo. Ex: Disco de Corte 7" - a aspa e polegada. Tratar como
       abertura fazia o resto da linha virar um campo so. */
    atual += c;
    campoComecou = true;
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
