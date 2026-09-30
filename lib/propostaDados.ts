// Carrega os dados de um orcamento para o editor do portal (navegador).
//
// Ordem de preferencia:
//  1. `dados_proposta` gravado no orcamento (fotografia do dia da emissao) - e a verdade.
//  2. Orcamento antigo, que so tem `html_orcamento`: remonta a partir do que o banco guarda
//     (itens do orcamento + catalogo + cliente). So vale para orcamento ainda pendente; os ja
//     enviados ficam congelados com o HTML e o PDF que existem.
//  3. Sem orcamento (a IA nao achou nenhum item): proposta em branco, para o vendedor montar.
//
// O renderer (lib/modeloProposta.ts) e puro e nao le nada do banco; tudo que ele precisa e montado aqui.

import { supabase } from './supabase';
import {
  montarCondicoes,
  normalizarDados,
  normalizarModelo,
  type ClienteProposta,
  type DadosProposta,
  type ItemProposta,
  type ModeloProposta,
} from './modeloProposta';

export interface EmpresaParaProposta {
  razao_social: string | null;
  cnpj: string | null;
  logo_url: string | null;
  email_responsavel: string | null;
  telefone_responsavel: string | null;
  endereco_faturamento: unknown;
  modelo_proposta: unknown;
  texto_rodape_pdf: string | null;
}

export interface OrcamentoParaProposta {
  orcamento_id: string;
  data_emissao: string | null;
  validade: string | null;
  html_orcamento: string | null;
  dados_proposta: unknown;
}

export interface ContextoProposta {
  empresaId: string;
  orcamento: OrcamentoParaProposta | null;
  empresa: EmpresaParaProposta | null;
  numeroTicket: number | null;
  origem: 'EMAIL' | 'WHATSAPP' | null;
  vendedor: string | null;
  cliente: {
    razaoSocial: string | null;
    cnpjCpf: string | null;
    contato: string | null;
    email: string | null;
    telefone: string | null;
  };
}

export interface PropostaCarregada {
  dados: DadosProposta;
  modelo: ModeloProposta;
  /** De onde vieram os dados; `catalogo` = orcamento antigo remontado (o editor avisa o vendedor). */
  fonte: 'snapshot' | 'catalogo' | 'vazio';
}

const texto = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  return s || undefined;
};

/** "Rua X, 123 — Bairro, Cidade/UF". Devolve undefined se o cadastro nao tem nada util. */
export const formatarEndereco = (bruto: unknown): string | undefined => {
  if (typeof bruto !== 'object' || bruto === null) return undefined;
  const e = bruto as Record<string, unknown>;
  const rua = [texto(e.rua) || texto(e.endereco), texto(e.numero)].filter(Boolean).join(', ');
  const cidade = texto(e.cidade);
  const estado = texto(e.estado);
  const local = [texto(e.bairro), cidade && estado ? `${cidade}/${estado}` : cidade || estado].filter(Boolean).join(', ');
  return [rua, local].filter(Boolean).join(' — ') || undefined;
};

export const modeloDaEmpresa = (empresa: EmpresaParaProposta | null): ModeloProposta => {
  const base = normalizarModelo(empresa?.modelo_proposta);
  return {
    ...base,
    // A logo mora em sales_empresas_v2.logo_url, nao dentro do jsonb.
    logoUrl: normalizarModelo({ logoUrl: empresa?.logo_url }).logoUrl,
    // Enquanto a empresa nao configurar observacoes, vale o texto antigo do rodape do PDF.
    observacoes: base.observacoes || (empresa?.texto_rodape_pdf || '').trim(),
  };
};

const carregarCondicoes = async (empresaId: string, codigos: string[]) => {
  if (codigos.length === 0) return [];

  const { data, error } = await supabase
    .from('sales_base_conhecimento_v2')
    .select('codigo_padrao, resposta')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .in('codigo_padrao', codigos);

  if (error) throw error;
  return montarCondicoes(codigos, data || []);
};

const clienteProposta = (cliente: ContextoProposta['cliente']): ClienteProposta => ({
  razaoSocial: texto(cliente.razaoSocial),
  documento: texto(cliente.cnpjCpf),
  contato: texto(cliente.contato),
  email: texto(cliente.email),
  telefone: texto(cliente.telefone),
});

/* ------------------------------------------------- orcamento antigo (so HTML) */

/**
 * SO PARA ORCAMENTO ANTIGO. A previsao de entrega nao esta em nenhuma tabela: o n8n a calculava
 * e ela existe apenas dentro do HTML salvo. Aqui ela e recuperada pelo NOME das colunas (SKU e
 * "Prev. entrega"), nao pela posicao, e o HTML nunca e escrito de volta. Quando nao houver mais
 * orcamento pendente sem `dados_proposta`, esta funcao pode ser apagada.
 */
const lerHtmlAntigo = (html: string | null) => {
  const previsoes = new Map<string, string>();
  let observacao = '';

  if (!html || typeof DOMParser === 'undefined') return { previsoes, observacao };

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const cabecalhos = Array.from(doc.querySelectorAll('table.itens-pedido thead th')).map((th) =>
    (th.textContent || '').trim().toLowerCase(),
  );
  const colSku = cabecalhos.findIndex((t) => t === 'sku');
  const colPrev = cabecalhos.findIndex((t) => t.startsWith('prev'));

  if (colSku >= 0 && colPrev >= 0) {
    doc.querySelectorAll('table.itens-pedido tbody tr').forEach((linha) => {
      const celulas = linha.querySelectorAll('td');
      const sku = (celulas[colSku]?.textContent || '').trim();
      const tmp = doc.createElement('div');
      tmp.innerHTML = (celulas[colPrev]?.innerHTML || '').replace(/<br\s*\/?>/gi, '\n');
      const previsao = (tmp.textContent || '').replace(/ /g, ' ').trim();
      if (sku && sku !== '—' && previsao && previsao !== '—') previsoes.set(sku, previsao);
    });
  }

  observacao = (doc.querySelector('.observacoes p')?.textContent || '').trim();
  return { previsoes, observacao };
};

const CHAVES_INTERNAS_METADATA = new Set(['ncm', 'idaux', 'metadata']);

const montarItensDoCatalogo = async (
  empresaId: string,
  orcamentoId: string,
  previsoes: Map<string, string>,
): Promise<ItemProposta[]> => {
  const { data: linhas, error } = await supabase
    .from('sales_orcamentos_itens_v2')
    .select('item_id, produto_id, solicitacao_id, quantidade, preco_unitario')
    .eq('empresa_id', empresaId)
    .eq('orcamento_id', orcamentoId);

  if (error) throw error;
  if (!linhas || linhas.length === 0) return [];

  const produtoIds = [...new Set(linhas.map((l) => l.produto_id).filter(Boolean))] as string[];
  const solicitacaoIds = [...new Set(linhas.map((l) => l.solicitacao_id).filter(Boolean))] as string[];

  const [produtos, solicitacoes] = await Promise.all([
    produtoIds.length
      ? supabase
          .from('sales_produtos_v2')
          .select('produto_id, nome, descricao, codigo_sku, unidade_medida, metadata')
          .eq('empresa_id', empresaId)
          .in('produto_id', produtoIds)
      : Promise.resolve({ data: [], error: null }),
    solicitacaoIds.length
      ? supabase
          .from('sales_solicitacoes_itens_v2')
          .select('solicitacao_id, produto_nome, created_at')
          .eq('empresa_id', empresaId)
          .in('solicitacao_id', solicitacaoIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (produtos.error) throw produtos.error;
  if (solicitacoes.error) throw solicitacoes.error;

  const produtoPorId = new Map((produtos.data || []).map((p: any) => [p.produto_id, p]));
  const solicitacaoPorId = new Map((solicitacoes.data || []).map((s: any) => [s.solicitacao_id, s]));

  return [...linhas]
    // Na ordem em que o cliente pediu.
    .sort((a, b) =>
      String(solicitacaoPorId.get(a.solicitacao_id)?.created_at || '').localeCompare(
        String(solicitacaoPorId.get(b.solicitacao_id)?.created_at || ''),
      ),
    )
    .map((linha) => {
      const produto: any = produtoPorId.get(linha.produto_id) || {};
      const solicitacao: any = solicitacaoPorId.get(linha.solicitacao_id) || {};
      const metadata = typeof produto.metadata === 'object' && produto.metadata !== null ? produto.metadata : {};

      const extras: Record<string, string> = {};
      for (const [chave, valor] of Object.entries(metadata)) {
        if (CHAVES_INTERNAS_METADATA.has(chave)) continue;
        const conteudo = texto(valor);
        if (conteudo) extras[chave] = conteudo;
      }

      const preco = Number(linha.preco_unitario);
      const sku = texto(produto.codigo_sku);

      return {
        nome: texto(produto.nome) || texto(solicitacao.produto_nome) || 'Item',
        descricao: texto(produto.descricao),
        sku,
        ncm: texto((metadata as Record<string, unknown>).ncm),
        unidade: texto(produto.unidade_medida),
        quantidade: Number(linha.quantidade) || 0,
        previsaoEntrega: sku ? previsoes.get(sku) : undefined,
        // Sem preco cadastrado o n8n gravava 0: na proposta isso e "Sob consulta", nao "R$ 0,00".
        precoUnitario: Number.isFinite(preco) && preco > 0 ? preco : null,
        moeda: 'BRL',
        extras: Object.keys(extras).length ? extras : undefined,
        pedidoComo: texto(solicitacao.produto_nome),
        itemId: texto(linha.item_id),
        produtoId: texto(linha.produto_id),
      } satisfies ItemProposta;
    });
};

/* ------------------------------------------------------------------ carregar */

export const carregarProposta = async (ctx: ContextoProposta): Promise<PropostaCarregada> => {
  const modelo = modeloDaEmpresa(ctx.empresa);
  const condicoes = await carregarCondicoes(ctx.empresaId, modelo.condicoesCodigos);
  const orcamento = ctx.orcamento;

  // 1. Fotografia gravada.
  if (orcamento?.dados_proposta) {
    try {
      const dados = normalizarDados(orcamento.dados_proposta);
      return {
        // Condicoes: sempre as atuais da empresa. O editor so abre orcamento ainda pendente (os ja
        // enviados ficam congelados no HTML/PDF), e quem configurou condicoes depois espera te-las.
        dados: { ...dados, orcamentoId: dados.orcamentoId || orcamento.orcamento_id, condicoes },
        modelo,
        fonte: 'snapshot',
      };
    } catch {
      // Snapshot ilegivel: cai para a remontagem abaixo em vez de travar o editor.
    }
  }

  const emitente = {
    nome: texto(ctx.empresa?.razao_social) || '',
    cnpj: texto(ctx.empresa?.cnpj),
    email: texto(ctx.empresa?.email_responsavel),
    telefone: texto(ctx.empresa?.telefone_responsavel),
    endereco: formatarEndereco(ctx.empresa?.endereco_faturamento),
  };

  const comum = {
    numero: ctx.numeroTicket != null ? String(ctx.numeroTicket) : undefined,
    emitente,
    cliente: clienteProposta(ctx.cliente),
    atendimento: { vendedor: ctx.vendedor || undefined, origem: ctx.origem || undefined },
    condicoes,
  };

  // 2. Orcamento antigo, remontado a partir do catalogo.
  if (orcamento) {
    const legado = lerHtmlAntigo(orcamento.html_orcamento);
    const itens = await montarItensDoCatalogo(ctx.empresaId, orcamento.orcamento_id, legado.previsoes);

    if (itens.length > 0) {
      return {
        dados: {
          ...comum,
          orcamentoId: orcamento.orcamento_id,
          emitidaEm: orcamento.data_emissao || new Date().toISOString(),
          validaAte: orcamento.validade || undefined,
          itens,
          observacoes: legado.observacao && legado.observacao !== modelo.observacoes ? legado.observacao : undefined,
        },
        modelo,
        fonte: 'catalogo',
      };
    }
  }

  // 3. Em branco. `emitidaEm` e fixado aqui (fora do renderer) e nao muda a cada render.
  return {
    dados: {
      ...comum,
      orcamentoId: orcamento?.orcamento_id,
      emitidaEm: orcamento?.data_emissao || new Date().toISOString(),
      validaAte: orcamento?.validade || undefined,
      itens: [],
    },
    modelo,
    fonte: 'vazio',
  };
};
