// Renderer unico da proposta comercial (PDF do orcamento).
//
// Funcao PURA: sem React, sem DOM, sem fetch, sem banco, sem Date.now(). Roda igual
// no servidor (api/proposta/[acao].ts, que alimenta o PDF) e no navegador (previa
// ao vivo do editor e da aba "Modelo de proposta"). Tudo que muda de um orcamento
// para o outro (emissao, validade, previsao de entrega, condicoes) chega pronto em
// `DadosProposta`. Como o PDF e gerado a partir do HTML salvo e o n8n compara um
// hash desse HTML, o mesmo `dados` + `modelo` tem que dar sempre o mesmo HTML.
//
// Especificacao visual: ATUALIZAR PDF PROPOSTA/modelo-proposta-referencia.html
//
// NUNCA executar codigo vindo do banco aqui (era o `new Function(code_regra_prazo)`
// do n8n). A previsao de entrega chega em `ItemProposta.previsaoEntrega`, como texto.

/* ------------------------------------------------------------------ tipos */

export type EstadoColuna = 'sempre' | 'nunca' | 'auto';

/** Titulos aceitos para o documento. */
export const TITULOS_PROPOSTA = ['Proposta Comercial', 'Orçamento', 'Cotação'] as const;

export interface ColunasModelo {
  /** "SKU x" na linha de detalhes do item. `sempre` imprime "SKU —" nos itens sem SKU. */
  sku: EstadoColuna;
  /** "NCM x" na linha de detalhes do item. Mesma regra do SKU. */
  ncm: EstadoColuna;
  /** Coluna "Prev. entrega". `auto` = so aparece se algum item tiver previsao. */
  previsao: EstadoColuna;
  /** Sufixo da unidade na coluna Qtd. ("30 PC"). `auto` = se algum item tiver unidade. */
  unidade: EstadoColuna;
  /** Linha "Pedido como: ..." com as palavras do proprio cliente. */
  solicitado: EstadoColuna;
}

/** Configuracao da empresa (`sales_empresas_v2.modelo_proposta`). Tudo tem padrao. */
export interface ModeloProposta {
  /** Nao fica no jsonb: vem de `sales_empresas_v2.logo_url`. Sem logo, o bloco nao e renderizado. */
  logoUrl: string | null;
  /** Cor de destaque (#rrggbb): faixa do topo, titulo, cabecalho da tabela e total. */
  corDestaque: string;
  /** "Proposta Comercial", "Orçamento" ou "Cotação". */
  titulo: string;
  /** Dias de validade a partir da emissao. 0 = nao mostrar o selo "Valida ate". */
  validadeDias: number;
  colunas: ColunasModelo;
  /**
   * Chaves de `sales_produtos_v2.metadata` que aparecem na linha de detalhes do item.
   * Chave que nao esta aqui NAO aparece (o catalogo tem chaves internas como `idaux`).
   * Mesmas regras do SKU: `auto` so onde ha valor, `sempre` em todos, `nunca` esconde.
   */
  metadata: Record<string, EstadoColuna>;
  /** `codigo_padrao` das perguntas da base de conhecimento que viram "Condicoes comerciais". */
  condicoesCodigos: string[];
  /** Texto livre no fim do documento (na falta dele, cai em `texto_rodape_pdf`). */
  observacoes: string;
  /** Linha do responsavel na caixa Atendimento. */
  mostrarVendedor: boolean;
  /** "gerado por Kotta", com link para worklivoo.com/kotta. */
  rodapeKotta: boolean;
}

export interface EmitenteProposta {
  nome: string;
  cnpj?: string;
  email?: string;
  telefone?: string;
  /** Ja formatado em uma linha. */
  endereco?: string;
}

export interface ClienteProposta {
  razaoSocial?: string;
  /** CNPJ ou CPF; o rotulo muda conforme a quantidade de digitos. */
  documento?: string;
  /** Nome da pessoa de contato. */
  contato?: string;
  telefone?: string;
  email?: string;
  /** Campos livres que o vendedor adiciona no editor. So imprime se tiver rotulo E valor. */
  extras?: { rotulo: string; valor: string }[];
}

export interface ItemProposta {
  nome: string;
  descricao?: string;
  sku?: string;
  ncm?: string;
  /** "UN", "PC", "CX"... */
  unidade?: string;
  quantidade: number;
  /** Texto pronto ("7 dias uteis"). Nunca codigo. */
  previsaoEntrega?: string;
  /** null/ausente = "Sob consulta": o item continua na proposta, sem entrar no total. */
  precoUnitario?: number | null;
  /** ISO 4217. Padrao BRL. */
  moeda?: string;
  /** Chaves de metadata do produto, ja convertidas em texto. */
  extras?: Record<string, string>;
  /** As palavras do cliente ("um bau de 6 metros"). */
  pedidoComo?: string;
  /**
   * Ligacoes com o banco (sales_orcamentos_itens_v2 / sales_produtos_v2). O renderer ignora: servem
   * ao editor para manter a tabela de itens em dia sem perder o vinculo de cada linha.
   */
  itemId?: string;
  produtoId?: string;
}

export interface TotaisProposta {
  subtotal?: number;
  /** Valor positivo; o renderer imprime com sinal de menos. */
  desconto?: number;
  /** Numero (valor cobrado) ou texto ("Incluso"). */
  frete?: number | string;
  /** Se ausente, e a soma dos itens com preco. */
  total?: number;
}

export interface CondicaoProposta {
  titulo: string;
  texto: string;
}

/** Fotografia dos dados de UM orcamento (`sales_orcamentos_v2.dados_proposta`). */
export interface DadosProposta {
  /** Referencia interna do suporte. Pode nao existir ainda na hora de montar; sem ele a linha some. */
  orcamentoId?: string;
  /** Numero do atendimento (ticket). */
  numero?: string;
  /** ISO 8601. */
  emitidaEm: string;
  /** ISO ou YYYY-MM-DD. Se ausente, e emitidaEm + modelo.validadeDias. */
  validaAte?: string;
  emitente: EmitenteProposta;
  cliente?: ClienteProposta;
  atendimento?: {
    vendedor?: string;
    origem?: 'EMAIL' | 'WHATSAPP' | string;
  };
  itens: ItemProposta[];
  totais?: TotaisProposta;
  /** Ja resolvidas a partir da base de conhecimento. Vazio = o bloco some. */
  condicoes?: CondicaoProposta[];
  /** Observacao avulsa do vendedor; vem depois do texto fixo do modelo. */
  observacoes?: string;
}

export interface ResultadoProposta {
  html: string;
  valorTotal: number;
  resumo: string;
}

/* --------------------------------------------------------------- padroes */

export const MODELO_PROPOSTA_PADRAO: ModeloProposta = {
  logoUrl: null,
  corDestaque: '#0f5132',
  titulo: 'Proposta Comercial',
  validadeDias: 15,
  colunas: { sku: 'auto', ncm: 'auto', previsao: 'auto', unidade: 'auto', solicitado: 'auto' },
  metadata: {},
  condicoesCodigos: [],
  observacoes: '',
  mostrarVendedor: true,
  rodapeKotta: true,
};

/**
 * Titulo curto de cada bloco de condicao (a pergunta padrao encurtada), por `codigo_padrao`
 * de lib/perguntasPadrao.ts. So as perguntas que fazem sentido numa proposta.
 */
export const TITULOS_CONDICOES: Record<string, string> = {
  formas_pagamento: 'Formas de pagamento',
  parcelamento: 'Parcelamento',
  frete: 'Frete',
  prazo_entrega: 'Prazo de entrega',
  area_entrega: 'Área de entrega',
  retirada: 'Retirada',
  nota_fiscal: 'Nota fiscal',
  pessoa_fisica: 'Pessoa física',
  validade_orcamento: 'Validade da proposta',
  pedido_minimo: 'Pedido mínimo',
  desconto_quantidade: 'Desconto por quantidade',
  troca_garantia: 'Troca e garantia',
  horario_atendimento: 'Horário de atendimento',
  endereco: 'Endereço',
  visita: 'Visita',
};

const RESUMO_PADRAO = 'Segue a proposta comercial em anexo.\n\nQualquer dúvida, estamos à disposição!';
const LINK_KOTTA = 'https://worklivoo.com/kotta';
const LIMITE_ITENS = 500;
const LIMITE_TEXTO = 4000;

/* --------------------------------------------------- normalizacao (entrada) */

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const texto = (v: unknown, limite = LIMITE_TEXTO): string =>
  typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, limite) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';

const numero = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const estado = (v: unknown, padrao: EstadoColuna): EstadoColuna =>
  v === 'sempre' || v === 'nunca' || v === 'auto' ? v : padrao;

const opcional = (v: unknown, limite?: number): string | undefined => texto(v, limite) || undefined;

const uuidOuUndefined = (v: unknown): string | undefined =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim())
    ? v.trim().toLowerCase()
    : undefined;

/** Aceita so #rrggbb: a cor vai para dentro de um <style>, entao nada alem disso passa. */
const corValida = (v: unknown): string | null =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toLowerCase() : null;

/** So http(s): evita `javascript:` e `data:` no src da logo. */
const urlValida = (v: unknown): string | null => {
  const url = texto(v, 2000);
  return /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : null;
};

/** Completa o que faltar com os padroes e descarta o que nao for valido. Aceita jsonb cru do banco. */
export const normalizarModelo = (entrada: unknown): ModeloProposta => {
  const bruto = ehObjeto(entrada) ? entrada : {};
  const colunas = ehObjeto(bruto.colunas) ? bruto.colunas : {};
  const padrao = MODELO_PROPOSTA_PADRAO;

  const metadata: Record<string, EstadoColuna> = {};
  if (ehObjeto(bruto.metadata)) {
    for (const [chave, valor] of Object.entries(bruto.metadata).slice(0, 50)) {
      const nome = texto(chave, 80);
      if (nome) metadata[nome] = estado(valor, 'auto');
    }
  }

  const dias = numero(bruto.validadeDias);

  return {
    logoUrl: urlValida(bruto.logoUrl),
    corDestaque: corValida(bruto.corDestaque) || padrao.corDestaque,
    titulo: texto(bruto.titulo, 40) || padrao.titulo,
    validadeDias: dias === null ? padrao.validadeDias : Math.min(365, Math.max(0, Math.round(dias))),
    colunas: {
      sku: estado(colunas.sku, padrao.colunas.sku),
      ncm: estado(colunas.ncm, padrao.colunas.ncm),
      previsao: estado(colunas.previsao, padrao.colunas.previsao),
      unidade: estado(colunas.unidade, padrao.colunas.unidade),
      solicitado: estado(colunas.solicitado, padrao.colunas.solicitado),
    },
    metadata,
    condicoesCodigos: Array.isArray(bruto.condicoesCodigos)
      ? bruto.condicoesCodigos.map((c) => texto(c, 80)).filter(Boolean).slice(0, 30)
      : [],
    observacoes: texto(bruto.observacoes),
    mostrarVendedor: typeof bruto.mostrarVendedor === 'boolean' ? bruto.mostrarVendedor : padrao.mostrarVendedor,
    rodapeKotta: typeof bruto.rodapeKotta === 'boolean' ? bruto.rodapeKotta : padrao.rodapeKotta,
  };
};

/** Valida o formato de `dados` vindo de fora (body da API, jsonb do banco). Lanca Error com mensagem legivel. */
export const normalizarDados = (entrada: unknown): DadosProposta => {
  if (!ehObjeto(entrada)) throw new Error('Dados da proposta invalidos.');

  const emitidaEm = texto(entrada.emitidaEm, 40);
  if (!emitidaEm || Number.isNaN(new Date(emitidaEm).getTime())) {
    throw new Error('Informe a data de emissao (emitidaEm) em formato ISO.');
  }

  if (!Array.isArray(entrada.itens)) throw new Error('Informe os itens da proposta.');
  if (entrada.itens.length > LIMITE_ITENS) throw new Error('Itens demais na proposta.');

  const emitenteBruto = ehObjeto(entrada.emitente) ? entrada.emitente : {};
  const emitente: EmitenteProposta = {
    nome: texto(emitenteBruto.nome, 200),
    cnpj: opcional(emitenteBruto.cnpj, 40),
    email: opcional(emitenteBruto.email, 200),
    telefone: opcional(emitenteBruto.telefone, 60),
    endereco: opcional(emitenteBruto.endereco, 300),
  };

  let cliente: ClienteProposta | undefined;
  if (ehObjeto(entrada.cliente)) {
    const c = entrada.cliente;
    cliente = {
      razaoSocial: opcional(c.razaoSocial, 200),
      documento: opcional(c.documento, 40),
      contato: opcional(c.contato, 200),
      telefone: opcional(c.telefone, 60),
      email: opcional(c.email, 200),
      extras: Array.isArray(c.extras)
        ? c.extras
            .filter(ehObjeto)
            .map((e) => ({ rotulo: texto(e.rotulo, 80), valor: texto(e.valor, 300) }))
            .filter((e) => e.rotulo && e.valor)
            .slice(0, 20)
        : undefined,
    };
  }

  const atendimentoBruto = ehObjeto(entrada.atendimento) ? entrada.atendimento : null;

  const itens: ItemProposta[] = entrada.itens.filter(ehObjeto).map((i) => {
    const extras: Record<string, string> = {};
    if (ehObjeto(i.extras)) {
      for (const [chave, valor] of Object.entries(i.extras).slice(0, 50)) {
        const nome = texto(chave, 80);
        const conteudo = texto(valor, 300);
        if (nome && conteudo) extras[nome] = conteudo;
      }
    }
    const preco = numero(i.precoUnitario);
    return {
      nome: texto(i.nome, 300),
      descricao: opcional(i.descricao, 1000),
      sku: opcional(i.sku, 80),
      ncm: opcional(i.ncm, 40),
      unidade: opcional(i.unidade, 20),
      quantidade: numero(i.quantidade) ?? 0,
      previsaoEntrega: opcional(i.previsaoEntrega, 300),
      precoUnitario: preco,
      moeda: (texto(i.moeda, 3) || 'BRL').toUpperCase(),
      extras: Object.keys(extras).length ? extras : undefined,
      pedidoComo: opcional(i.pedidoComo, 500),
      itemId: uuidOuUndefined(i.itemId),
      produtoId: uuidOuUndefined(i.produtoId),
    };
  });

  let totais: TotaisProposta | undefined;
  if (ehObjeto(entrada.totais)) {
    const t = entrada.totais;
    const frete = typeof t.frete === 'string' ? opcional(t.frete, 60) : numero(t.frete) ?? undefined;
    totais = {
      subtotal: numero(t.subtotal) ?? undefined,
      desconto: numero(t.desconto) ?? undefined,
      frete,
      total: numero(t.total) ?? undefined,
    };
  }

  let condicoes: CondicaoProposta[] | undefined;
  if (Array.isArray(entrada.condicoes)) {
    condicoes = entrada.condicoes
      .filter(ehObjeto)
      .map((c) => ({ titulo: texto(c.titulo, 120), texto: texto(c.texto, 1500) }))
      .filter((c) => c.titulo && c.texto)
      .slice(0, 30);
  }

  return {
    orcamentoId: opcional(entrada.orcamentoId, 64),
    numero: opcional(entrada.numero, 40),
    emitidaEm,
    validaAte: opcional(entrada.validaAte, 40),
    emitente,
    cliente,
    atendimento: atendimentoBruto
      ? { vendedor: opcional(atendimentoBruto.vendedor, 200), origem: opcional(atendimentoBruto.origem, 20) }
      : undefined,
    itens,
    totais,
    condicoes,
    observacoes: opcional(entrada.observacoes),
  };
};

/* ------------------------------------------------------------- formatacao */

const FUSO = 'America/Sao_Paulo';

export const escaparHtml = (valor: string): string =>
  valor.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Escapa e converte quebras de linha em <br>. */
const multilinha = (valor: string): string => escaparHtml(valor.trim()).replace(/\r?\n/g, '<br>');

interface PartesData {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
}

const partesData = (iso: string): PartesData | null => {
  const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (soData) return { ano: +soData[1], mes: +soData[2], dia: +soData[3], hora: 0, minuto: 0 };

  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;

  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(data);
  const pega = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  return { ano: pega('year'), mes: pega('month'), dia: pega('day'), hora: pega('hour'), minuto: pega('minute') };
};

const dois = (n: number) => String(n).padStart(2, '0');

export const formatarData = (iso: string): string => {
  const p = partesData(iso);
  return p ? `${dois(p.dia)}/${dois(p.mes)}/${p.ano}` : '';
};

export const formatarDataHora = (iso: string): string => {
  const p = partesData(iso);
  return p ? `${dois(p.dia)}/${dois(p.mes)}/${p.ano}, ${dois(p.hora)}:${dois(p.minuto)}` : '';
};

/** Data (YYYY-MM-DD, no fuso de Sao Paulo) `dias` depois da emissao. */
export const calcularValidaAte = (emitidaEm: string, dias: number): string | null => {
  const p = partesData(emitidaEm);
  if (!p) return null;
  return new Date(Date.UTC(p.ano, p.mes - 1, p.dia + dias)).toISOString().slice(0, 10);
};

const formatarMoeda = (valor: number, moeda = 'BRL'): string => {
  const codigo = moeda.toUpperCase();
  const locale = codigo === 'USD' ? 'en-US' : codigo === 'EUR' ? 'de-DE' : 'pt-BR';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: codigo }).format(valor);
  } catch {
    return `${codigo} ${valor.toFixed(2)}`;
  }
};

const formatarQuantidade = (valor: number): string =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(valor);

const arredondar = (valor: number) => Math.round(valor * 100) / 100;

const temPreco = (item: ItemProposta): item is ItemProposta & { precoUnitario: number } =>
  typeof item.precoUnitario === 'number' && Number.isFinite(item.precoUnitario);

/* ----------------------------------------------------------------- totais */

interface TotaisCalculados {
  /** Moeda unica da proposta; null quando os itens misturam moedas. */
  moeda: string | null;
  soma: number;
  total: number | null;
}

const calcularTotais = (dados: DadosProposta): TotaisCalculados => {
  const comPreco = dados.itens.filter(temPreco);
  const moedas = new Set(comPreco.map((i) => (i.moeda || 'BRL').toUpperCase()));
  const moeda = moedas.size === 1 ? [...moedas][0] : moedas.size === 0 ? 'BRL' : null;
  const soma = arredondar(comPreco.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0));
  const informado = dados.totais?.total;
  return { moeda, soma, total: moeda === null ? null : typeof informado === 'number' ? informado : soma };
};

/* ------------------------------------------------------------------ cores */

/** Mistura a cor com branco: `--marca-clara` da referencia e a marca a ~8% de opacidade. */
const clarear = (hex: string, forca = 0.08): string => {
  const canal = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mix = (c: number) => Math.round(c * forca + 255 * (1 - forca));
  return `#${[0, 1, 2].map((i) => mix(canal(i)).toString(16).padStart(2, '0')).join('')}`;
};

/* -------------------------------------------------------------------- css */

const css = (cor: string) => `
  :root { --marca: ${cor}; --marca-clara: ${clarear(cor)}; --texto: #1e293b; --suave: #64748b; --linha: #e2e8f0; color-scheme: light; }
  html { background: #ffffff; }
  @page { size: A4; margin: 14mm 14mm 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: var(--texto); margin: 0; font-size: 10.5px; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .faixa { height: 4px; background: var(--marca); margin-bottom: 14px; }
  .topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .marca-bloco { display: flex; gap: 12px; align-items: flex-start; }
  .logo { width: 96px; height: 56px; display: flex; align-items: center; justify-content: flex-start; }
  .logo img { max-width: 96px; max-height: 56px; object-fit: contain; }
  .emitente strong { display: block; font-size: 13.5px; color: #0f172a; margin-bottom: 2px; }
  .emitente { font-size: 10px; color: var(--suave); }
  .doc { text-align: right; }
  .doc h1 { margin: 0; font-size: 19px; letter-spacing: .5px; color: var(--marca); }
  .doc .num { font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 2px; }
  .doc .meta { font-size: 10px; color: var(--suave); margin-top: 4px; }
  .doc .validade { display: inline-block; margin-top: 6px; padding: 3px 8px; border-radius: 3px; background: var(--marca-clara); color: var(--marca); font-weight: 600; font-size: 9.5px; }
  .duplo { display: flex; gap: 14px; margin: 16px 0 14px; }
  .caixa { flex: 1; border: 1px solid var(--linha); border-radius: 5px; padding: 9px 11px; }
  .caixa h3 { margin: 0 0 6px; font-size: 8.5px; text-transform: uppercase; letter-spacing: .8px; color: var(--marca); font-weight: 700; }
  .caixa .linha { font-size: 10px; margin: 2px 0; }
  .caixa .linha b { color: var(--suave); font-weight: 600; }
  h2.secao { font-size: 9px; text-transform: uppercase; letter-spacing: .8px; color: var(--suave); margin: 0 0 6px; padding-bottom: 4px; border-bottom: 1px solid var(--linha); }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead th { background: var(--marca); color: #fff; font-size: 8px; text-transform: uppercase; letter-spacing: .3px; text-align: left; padding: 6px 7px; font-weight: 600; }
  thead th:first-child { border-radius: 4px 0 0 0; }
  thead th:last-child { border-radius: 0 4px 0 0; }
  tbody td { padding: 7px; font-size: 9.5px; border-bottom: 1px solid #f1f5f9; vertical-align: top; word-wrap: break-word; }
  tbody tr:nth-child(even) td { background: #fafbfc; }
  tr { page-break-inside: avoid; }
  .item-nome { font-weight: 600; color: #0f172a; }
  .item-desc { color: var(--suave); font-size: 8.8px; margin-top: 1px; }
  .item-sku { color: var(--suave); font-size: 8.5px; margin-top: 2px; }
  .num-cel { text-align: right; white-space: nowrap; }
  .centro { text-align: center; white-space: nowrap; }
  .pedido { color: var(--suave); font-size: 8.5px; font-style: italic; margin-top: 3px; }
  .indisponivel { display: inline-block; padding: 1px 5px; border-radius: 3px; background: #fef2f2; color: #b91c1c; font-size: 8px; font-weight: 600; }
  .fecho { display: flex; justify-content: space-between; gap: 16px; margin-top: 12px; page-break-inside: avoid; }
  .totais { width: 240px; margin-left: auto; font-size: 10px; }
  .totais .l { display: flex; justify-content: space-between; padding: 3px 0; color: var(--suave); }
  .totais .l.total { border-top: 2px solid var(--marca); margin-top: 4px; padding-top: 6px; font-size: 13px; font-weight: 700; color: #0f172a; }
  .totais .l.total span:last-child { color: var(--marca); }
  .condicoes { margin-top: 16px; border: 1px solid var(--linha); border-radius: 5px; overflow: hidden; page-break-inside: avoid; }
  .condicoes h3 { margin: 0; padding: 6px 11px; background: #f8fafc; font-size: 8.5px; text-transform: uppercase; letter-spacing: .8px; color: var(--marca); border-bottom: 1px solid var(--linha); }
  .cond-grade { display: flex; flex-wrap: wrap; padding: 4px 11px 9px; }
  .cond { width: 50%; padding: 5px 10px 0 0; font-size: 9.5px; }
  .cond b { display: block; color: var(--suave); font-size: 8.5px; text-transform: uppercase; letter-spacing: .4px; font-weight: 700; margin-bottom: 1px; }
  .obs { margin-top: 12px; font-size: 9.5px; color: #475569; }
  .obs h3 { margin: 0 0 4px; font-size: 8.5px; text-transform: uppercase; letter-spacing: .8px; color: var(--suave); }
  .rodape { position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; gap: 12px; font-size: 8px; color: #94a3b8; border-top: 1px solid var(--linha); padding-top: 5px; }
  .rodape .ref { font-size: 7px; color: #cbd5e1; letter-spacing: .2px; }
  .rodape a { color: #94a3b8; text-decoration: none; font-weight: 600; }
`;

/* -------------------------------------------------------------- renderer */

const linha = (rotulo: string, valor: string | undefined): string =>
  valor ? `<div class="linha"><b>${escaparHtml(rotulo)}</b> ${escaparHtml(valor)}</div>` : '';

const rotuloDocumento = (documento: string): string =>
  documento.replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ';

const textoOrigem = (origem: string | undefined): string | undefined => {
  if (origem === 'WHATSAPP') return 'Cotação recebida por WhatsApp';
  if (origem === 'EMAIL') return 'Cotação recebida por e-mail';
  return undefined;
};

/** Larguras das colunas ativas, recalculadas para somar exatamente 100%. */
const larguras = (previsao: boolean): { item: number; qtd: number; previsao: number; unit: number; total: number } => {
  const pesos = { item: 44, qtd: 9, previsao: previsao ? 16 : 0, unit: 15, total: 16 };
  const soma = pesos.item + pesos.qtd + pesos.previsao + pesos.unit + pesos.total;
  const pct = (peso: number) => Math.round((peso / soma) * 100);
  const qtd = pct(pesos.qtd);
  const prev = pct(pesos.previsao);
  const unit = pct(pesos.unit);
  const total = pct(pesos.total);
  return { item: 100 - qtd - prev - unit - total, qtd, previsao: prev, unit, total };
};

const cabecalhoEmitente = (emitente: EmitenteProposta): string => {
  const contato = [emitente.email, emitente.telefone].filter(Boolean).map((v) => escaparHtml(v as string)).join(' &nbsp;·&nbsp; ');
  const linhas = [
    emitente.cnpj ? `CNPJ: ${escaparHtml(emitente.cnpj)}` : '',
    contato,
    emitente.endereco ? escaparHtml(emitente.endereco) : '',
  ].filter(Boolean);
  return `<div class="emitente"><strong>${escaparHtml(emitente.nome)}</strong>${linhas.join('<br>')}</div>`;
};

/**
 * Um campo dentro da celula do item. `auto` so imprime onde o item tem valor; `sempre` imprime em
 * todos os itens ("SKU —" quando falta); `nunca` nao imprime. Sem valor e sem `sempre`, nada sai.
 */
const campoDoItem = (rotulo: string, valor: string | undefined, estadoCampo: EstadoColuna): string => {
  if (estadoCampo === 'nunca') return '';
  if (valor) return `${escaparHtml(rotulo)} ${escaparHtml(valor)}`;
  return estadoCampo === 'sempre' ? `${escaparHtml(rotulo)} —` : '';
};

const celulaItem = (item: ItemProposta, modelo: ModeloProposta): string => {
  const partes = [
    campoDoItem('SKU', item.sku, modelo.colunas.sku),
    campoDoItem('NCM', item.ncm, modelo.colunas.ncm),
    ...Object.entries(modelo.metadata).map(([chave, config]) =>
      campoDoItem(`${chave}:`, item.extras?.[chave], config),
    ),
  ].filter(Boolean);

  const pedidoComo =
    modelo.colunas.solicitado === 'nunca'
      ? ''
      : item.pedidoComo
        ? `Pedido como: “${escaparHtml(item.pedidoComo)}”`
        : modelo.colunas.solicitado === 'sempre'
          ? 'Pedido como: —'
          : '';

  const sobConsulta = !temPreco(item);

  return [
    `<div class="item-nome">${escaparHtml(item.nome)}</div>`,
    item.descricao ? `<div class="item-desc">${escaparHtml(item.descricao)}</div>` : '',
    sobConsulta
      ? '<div class="item-desc"><span class="indisponivel">Sob consulta</span> nosso time entra em contato com prazo e preço</div>'
      : '',
    partes.length ? `<div class="item-sku">${partes.join(' · ')}</div>` : '',
    pedidoComo ? `<div class="pedido">${pedidoComo}</div>` : '',
  ].join('');
};

const renderLinhaItem = (item: ItemProposta, modelo: ModeloProposta, mostrarPrevisao: boolean, mostrarUnidade: boolean): string => {
  const moeda = item.moeda || 'BRL';
  const preco = temPreco(item) ? item.precoUnitario : null;
  const quantidade = formatarQuantidade(item.quantidade) + (mostrarUnidade && item.unidade ? ` ${escaparHtml(item.unidade)}` : '');

  return (
    '<tr>' +
    `<td>${celulaItem(item, modelo)}</td>` +
    `<td class="centro">${quantidade}</td>` +
    (mostrarPrevisao ? `<td>${item.previsaoEntrega ? multilinha(item.previsaoEntrega) : '—'}</td>` : '') +
    `<td class="num-cel">${preco === null ? '—' : formatarMoeda(preco, moeda)}</td>` +
    `<td class="num-cel">${preco === null ? '—' : `<b>${formatarMoeda(arredondar(preco * item.quantidade), moeda)}</b>`}</td>` +
    '</tr>'
  );
};

const renderTotais = (dados: DadosProposta, calculo: TotaisCalculados): string => {
  const moeda = calculo.moeda;
  const fmt = (v: number) => (moeda ? formatarMoeda(v, moeda) : String(v));
  const t = dados.totais || {};
  const linhas: string[] = [];

  if (typeof t.subtotal === 'number') linhas.push(`<div class="l"><span>Subtotal</span><span>${fmt(t.subtotal)}</span></div>`);
  if (typeof t.desconto === 'number' && t.desconto !== 0)
    linhas.push(`<div class="l"><span>Desconto comercial</span><span>− ${fmt(Math.abs(t.desconto))}</span></div>`);
  if (typeof t.frete === 'number') linhas.push(`<div class="l"><span>Frete</span><span>${fmt(t.frete)}</span></div>`);
  else if (typeof t.frete === 'string' && t.frete) linhas.push(`<div class="l"><span>Frete</span><span>${escaparHtml(t.frete)}</span></div>`);

  const totalTexto = calculo.total === null || moeda === null ? '—' : fmt(calculo.total);
  linhas.push(`<div class="l total"><span>Total</span><span>${totalTexto}</span></div>`);

  return `<div class="fecho"><div class="totais">${linhas.join('')}</div></div>`;
};

/**
 * Condicoes comerciais a partir das respostas da base de conhecimento, na ordem que a empresa
 * escolheu no modelo. Codigo sem resposta ativa fica de fora.
 */
export const montarCondicoes = (
  codigos: string[],
  respostas: { codigo_padrao: string | null; resposta: string | null }[],
): CondicaoProposta[] => {
  const porCodigo = new Map<string, string>();
  for (const linha of respostas) {
    const resposta = (linha.resposta || '').trim();
    if (linha.codigo_padrao && resposta) porCodigo.set(linha.codigo_padrao, resposta);
  }

  return codigos
    .filter((codigo) => porCodigo.has(codigo))
    .map((codigo) => ({ titulo: TITULOS_CONDICOES[codigo] || codigo, texto: porCodigo.get(codigo) as string }));
};

/**
 * Totais depois que o vendedor mexeu nos itens. Desconto e frete (numero) sao mantidos; subtotal e
 * total sao refeitos. Sem desconto nem frete devolve undefined e o renderer usa a soma dos itens.
 */
export const recalcularTotais = (itens: ItemProposta[], atual?: TotaisProposta): TotaisProposta | undefined => {
  const desconto = typeof atual?.desconto === 'number' && atual.desconto !== 0 ? atual.desconto : undefined;
  const frete = atual?.frete !== undefined && atual.frete !== '' ? atual.frete : undefined;
  if (desconto === undefined && frete === undefined) return undefined;

  const soma = arredondar(itens.filter(temPreco).reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0));
  const total = arredondar(soma - (desconto ?? 0) + (typeof frete === 'number' ? frete : 0));
  return { subtotal: soma, desconto, frete, total };
};

/** Gera o HTML da proposta, exatamente o do arquivo de referencia. */
export const renderPropostaHtml = (dados: DadosProposta, modeloEntrada: ModeloProposta): string => {
  const modelo = normalizarModelo(modeloEntrada);
  const calculo = calcularTotais(dados);

  const algumTem = (campo: 'previsaoEntrega' | 'unidade') => dados.itens.some((i) => Boolean(i[campo]));
  const mostrarPrevisao = modelo.colunas.previsao === 'sempre' || (modelo.colunas.previsao === 'auto' && algumTem('previsaoEntrega'));
  const mostrarUnidade = modelo.colunas.unidade === 'sempre' || (modelo.colunas.unidade === 'auto' && algumTem('unidade'));
  const w = larguras(mostrarPrevisao);

  const validaAteIso = modelo.validadeDias > 0 ? dados.validaAte || calcularValidaAte(dados.emitidaEm, modelo.validadeDias) : null;
  const validaAte = validaAteIso ? formatarData(validaAteIso) : '';

  const cliente = dados.cliente || {};
  const contato = [cliente.contato, cliente.telefone].filter(Boolean).join(' · ');
  const linhasCliente = [
    linha('Razão social', cliente.razaoSocial),
    cliente.documento ? linha(rotuloDocumento(cliente.documento), cliente.documento) : '',
    linha('Contato', contato),
    linha('E-mail', cliente.email),
    ...(cliente.extras || []).map((e) => linha(e.rotulo, e.valor)),
  ].join('');

  const atendimento = dados.atendimento || {};
  const linhasAtendimento = [
    modelo.mostrarVendedor ? linha('Vendedor', atendimento.vendedor) : '',
    linha('Origem', textoOrigem(atendimento.origem)),
    dados.numero ? linha('Atendimento', `nº ${dados.numero}`) : '',
  ].join('');

  const caixas = [
    linhasCliente ? `<div class="caixa"><h3>Cliente</h3>${linhasCliente}</div>` : '',
    linhasAtendimento ? `<div class="caixa"><h3>Atendimento</h3>${linhasAtendimento}</div>` : '',
  ].join('');

  const condicoes = (dados.condicoes || []).filter((c) => c.titulo && c.texto);
  const observacoes = [modelo.observacoes, dados.observacoes].map((v) => (v || '').trim()).filter(Boolean).join('\n\n');

  const emitente = dados.emitente;
  const contatoRodape = [emitente.email, emitente.telefone].filter(Boolean).map((v) => escaparHtml(v as string)).join(' · ');

  const cabecalhoTabela =
    `<th style="width:${w.item}%">Item</th>` +
    `<th style="width:${w.qtd}%" class="centro">Qtd.</th>` +
    (mostrarPrevisao ? `<th style="width:${w.previsao}%">Prev. entrega</th>` : '') +
    `<th style="width:${w.unit}%" class="num-cel">Valor unit.</th>` +
    `<th style="width:${w.total}%" class="num-cel">Total</th>`;

  return (
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
    `<title>${escaparHtml(modelo.titulo)}${dados.numero ? ` ${escaparHtml(dados.numero)}` : ''}</title>` +
    `<style>${css(modelo.corDestaque)}</style></head><body>` +
    '<div class="faixa"></div>' +
    '<div class="topo"><div class="marca-bloco">' +
    (modelo.logoUrl ? `<div class="logo"><img src="${escaparHtml(modelo.logoUrl)}" alt=""></div>` : '') +
    cabecalhoEmitente(emitente) +
    '</div><div class="doc">' +
    `<h1>${escaparHtml(modelo.titulo.toUpperCase())}</h1>` +
    (dados.numero ? `<div class="num">Nº ${escaparHtml(dados.numero)}</div>` : '') +
    `<div class="meta">Emitida em ${formatarDataHora(dados.emitidaEm)}</div>` +
    (validaAte ? `<div class="validade">Válida até ${validaAte}</div>` : '') +
    '</div></div>' +
    (caixas ? `<div class="duplo">${caixas}</div>` : '') +
    '<h2 class="secao">Itens da proposta</h2>' +
    `<table><thead><tr>${cabecalhoTabela}</tr></thead><tbody>` +
    dados.itens.map((item) => renderLinhaItem(item, modelo, mostrarPrevisao, mostrarUnidade)).join('') +
    '</tbody></table>' +
    renderTotais(dados, calculo) +
    (condicoes.length
      ? '<div class="condicoes"><h3>Condições comerciais</h3><div class="cond-grade">' +
        condicoes.map((c) => `<div class="cond"><b>${escaparHtml(c.titulo)}</b>${multilinha(c.texto)}</div>`).join('') +
        '</div></div>'
      : '') +
    (observacoes ? `<div class="obs"><h3>Observações</h3>${multilinha(observacoes)}</div>` : '') +
    '<div class="rodape">' +
    `<span><b>${escaparHtml(emitente.nome)}</b>${contatoRodape ? ` · ${contatoRodape}` : ''}</span>` +
    `<span class="ref">${dados.orcamentoId ? `Ref. ${escaparHtml(dados.orcamentoId)}` : ''}</span>` +
    `<span>${modelo.rodapeKotta ? `<a href="${LINK_KOTTA}">gerado por Kotta</a>` : ''}</span>` +
    '</div></body></html>'
  );
};

/** Renderiza e devolve tambem o valor total e o texto de resumo (corpo da mensagem que acompanha o PDF). */
export const gerarProposta = (dados: DadosProposta, modelo: ModeloProposta): ResultadoProposta => {
  const calculo = calcularTotais(dados);
  return {
    html: renderPropostaHtml(dados, modelo),
    valorTotal: calculo.total ?? calculo.soma,
    resumo: RESUMO_PADRAO,
  };
};
