import { createClient } from '@supabase/supabase-js';
import { HttpError } from './createMemberService.js';

/* ------------------------------------------------------------------ *
 * Campos da tabela sales_produtos_v2 que a planilha pode preencher.
 * codigo_sku e nome sao NOT NULL no banco - sem eles nao ha importacao.
 * ------------------------------------------------------------------ */
export const CAMPOS_PRODUTO = [
  { campo: 'codigo_sku', rotulo: 'Codigo / SKU', obrigatorio: true, tipo: 'texto', varias: false },
  { campo: 'nome', rotulo: 'Nome do produto', obrigatorio: true, tipo: 'texto', varias: true },
  { campo: 'descricao', rotulo: 'Descricao', obrigatorio: false, tipo: 'texto', varias: true },
  { campo: 'preco_venda', rotulo: 'Preco de venda', obrigatorio: false, tipo: 'numero', varias: false },
  { campo: 'moeda', rotulo: 'Moeda', obrigatorio: false, tipo: 'texto', varias: false },
  { campo: 'unidade_medida', rotulo: 'Unidade de medida', obrigatorio: false, tipo: 'texto', varias: false },
  { campo: 'estoque', rotulo: 'Quantidade em estoque', obrigatorio: false, tipo: 'numero', varias: false },
  { campo: 'categoria', rotulo: 'Categoria', obrigatorio: false, tipo: 'texto', varias: true },
  // Nao e coluna da tabela: cai no jsonb metadata, uma chave por coluna.
  // A busca de produtos devolve metadata junto, entao o agente de cotacao
  // enxerga o que for guardado aqui.
  { campo: 'metadata', rotulo: 'Informacoes extras', obrigatorio: false, tipo: 'texto', varias: true },
] as const;

type CampoProduto = (typeof CAMPOS_PRODUTO)[number]['campo'];

const CAMPOS_VALIDOS = new Set<string>(CAMPOS_PRODUTO.map((c) => c.campo));
const CAMPOS_NUMERICOS = new Set<string>(
  CAMPOS_PRODUTO.filter((c) => c.tipo === 'numero').map((c) => c.campo),
);
const CAMPOS_VARIAS_COLUNAS = new Set<string>(
  CAMPOS_PRODUTO.filter((c) => c.varias).map((c) => c.campo),
);

export type FormatoNumero = 'BR' | 'US';

export interface MapeamentoColuna {
  coluna: string;
  campo: CampoProduto | null;
  confianca: 'alta' | 'media' | 'baixa';
  motivo: string;
}

export interface AnaliseResultado {
  mapeamento: MapeamentoColuna[];
  formato_numero: FormatoNumero;
  avisos: string[];
  camposFaltando: string[];
}

/* ------------------------------------------------------------------ *
 * Numeros: planilha brasileira usa "1.234,56"; a americana "1,234.56".
 * A convencao vem da analise da IA (que ve varias linhas), com uma
 * deteccao local como rede de seguranca por valor.
 * ------------------------------------------------------------------ */
export const converterNumero = (bruto: unknown, formato: FormatoNumero): number | null => {
  if (bruto === null || bruto === undefined) return null;

  const texto = String(bruto).trim();
  if (!texto) return null;

  // tira moeda, espaco fino, qualquer coisa que nao seja digito/separador/sinal
  let limpo = texto.replace(/[^\d.,-]/g, '');
  if (!limpo || !/\d/.test(limpo)) return null;

  const negativo = limpo.startsWith('-');
  limpo = limpo.replace(/-/g, '');

  const temPonto = limpo.includes('.');
  const temVirgula = limpo.includes(',');

  let normalizado: string;

  if (temPonto && temVirgula) {
    // o separador decimal e o que aparece por ultimo
    const decimal = limpo.lastIndexOf(',') > limpo.lastIndexOf('.') ? ',' : '.';
    const milhar = decimal === ',' ? '.' : ',';
    normalizado = limpo.split(milhar).join('').replace(decimal, '.');
  } else if (temVirgula) {
    normalizado = separadorUnico(limpo, ',', formato === 'BR');
  } else if (temPonto) {
    normalizado = separadorUnico(limpo, '.', formato === 'US');
  } else {
    normalizado = limpo;
  }

  const valor = Number(normalizado);
  if (!Number.isFinite(valor)) return null;

  return negativo ? -valor : valor;
};

/* Com um separador so, "1.234" pode ser mil ou 1,234. Se o bloco final
   tem exatamente 3 digitos E o separador nao e o decimal daquele idioma,
   tratamos como milhar. */
const separadorUnico = (texto: string, sep: string, ehDecimalDoIdioma: boolean) => {
  const partes = texto.split(sep);

  if (partes.length > 2) {
    // "1.234.567" - so pode ser milhar
    return partes.join('');
  }

  const finalTemTresDigitos = partes[1]?.length === 3;

  if (!ehDecimalDoIdioma && finalTemTresDigitos) {
    return partes.join('');
  }

  return partes.join('.');
};

export const limparTexto = (bruto: unknown): string | null => {
  if (bruto === null || bruto === undefined) return null;
  const texto = String(bruto).trim();
  return texto ? texto : null;
};

/* ------------------------------------------------------------------ *
 * Quem esta chamando: precisa ser ADMIN, e a empresa vem SEMPRE do
 * cadastro dele - nunca do corpo da requisicao, senao daria para
 * escrever no catalogo de outra empresa.
 * ------------------------------------------------------------------ */
const validarChamador = async ({
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
  requesterAccessToken,
}: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  requesterAccessToken: string;
}) => {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new HttpError(
      500,
      'As credenciais do servidor nao estao configuradas. Defina SUPABASE_SERVICE_ROLE_KEY no ambiente.',
    );
  }

  if (!requesterAccessToken) {
    throw new HttpError(401, 'Nao foi possivel validar o usuario autenticado.');
  }

  const publicClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await publicClient.auth.getUser(requesterAccessToken);

  if (userError || !user?.id) {
    throw new HttpError(401, 'Nao foi possivel validar o usuario autenticado.');
  }

  const { data: membro, error: membroError } = await adminClient
    .from('sales_membros_v2')
    .select('membro_id, empresa_id, cargo, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (membroError) {
    throw new HttpError(500, membroError.message);
  }

  if (!membro?.empresa_id) {
    throw new HttpError(400, 'Nao foi possivel identificar a empresa do usuario atual.');
  }

  if (membro.status !== 'ATIVO') {
    throw new HttpError(403, 'Seu acesso esta inativo no momento.');
  }

  if (membro.cargo !== 'ADMIN') {
    throw new HttpError(403, 'Somente administradores podem importar o catalogo de produtos.');
  }

  return { adminClient, empresaId: membro.empresa_id as string };
};

/* ------------------------------------------------------------------ *
 * Reserva sem IA: casa pelo nome da coluna. Serve quando a chave da
 * Anthropic nao esta configurada ou a chamada falha - a importacao
 * nunca pode depender exclusivamente da IA.
 * ------------------------------------------------------------------ */
const SINONIMOS: Record<CampoProduto, string[]> = {
  codigo_sku: ['sku', 'codigo', 'cod', 'code', 'referencia', 'ref', 'interno'],
  nome: ['nome', 'produto', 'item', 'name', 'title', 'titulo', 'mercadoria', 'material'],
  descricao: ['descricao', 'description', 'detalhe', 'detalhamento', 'observacao', 'obs', 'especificacao', 'tecnico'],
  preco_venda: ['preco', 'valor', 'vlr', 'price', 'venda'],
  moeda: ['moeda', 'currency'],
  unidade_medida: ['unidade', 'un', 'um', 'medida', 'unit', 'embalagem'],
  estoque: ['estoque', 'quantidade', 'qtd', 'qtde', 'saldo', 'stock', 'disponivel', 'disp'],
  categoria: ['categoria', 'grupo', 'familia', 'linha', 'category', 'segmento', 'departamento'],
  // De proposito vazio: mandar coluna para "informacoes extras" e uma
  // escolha da pessoa, nao um palpite automatico.
  metadata: [],
};

/* Palavras que aparecem em quase todo cabecalho e nao ajudam a decidir. */
const RUIDO = new Set(['do', 'da', 'de', 'dos', 'das', 'e', 'o', 'a', 'no', 'na', 'por', 'p']);

const normalizarNome = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/* Quebra o cabecalho em palavras. "Vlr. Unit. Venda" -> [vlr, unit, venda].
   Comparar palavra a palavra evita o erro de substring: com o texto colado,
   "vlrunitvenda" contem "unit" e o campo virava unidade de medida. */
const emPalavras = (valor: string) =>
  normalizarNome(valor)
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !RUIDO.has(t));

const pontuar = (palavras: string[], termos: string[]) => {
  let total = 0;

  for (const palavra of palavras) {
    for (const termo of termos) {
      if (palavra === termo) {
        total += 3;
      } else if (palavra.startsWith(termo) && termo.length >= 3) {
        total += 2;
      } else if (termo.startsWith(palavra) && palavra.length >= 3) {
        total += 1;
      }
    }
  }

  return total;
};

export const mapearPorHeuristica = (colunas: string[]): MapeamentoColuna[] => {
  const palavrasPorColuna = colunas.map((c) => emPalavras(c));

  /* Pontua TODOS os pares coluna x campo antes de decidir. Atribuir na
     ordem das colunas deixava a primeira coluna "roubar" um campo que
     combinava muito mais com outra. */
  const candidatos: Array<{ indice: number; campo: CampoProduto; nota: number }> = [];

  colunas.forEach((_, indice) => {
    for (const [campo, termos] of Object.entries(SINONIMOS) as [CampoProduto, string[]][]) {
      const nota = pontuar(palavrasPorColuna[indice], termos);
      if (nota > 0) candidatos.push({ indice, campo, nota });
    }
  });

  // maior nota primeiro; empate resolve pela ordem da planilha
  candidatos.sort((a, b) => b.nota - a.nota || a.indice - b.indice);

  const campoDaColuna = new Map<number, { campo: CampoProduto; nota: number }>();
  const colunasUsadas = new Set<number>();
  const camposUsados = new Set<CampoProduto>();

  for (const c of candidatos) {
    if (colunasUsadas.has(c.indice) || camposUsados.has(c.campo)) continue;
    colunasUsadas.add(c.indice);
    camposUsados.add(c.campo);
    campoDaColuna.set(c.indice, { campo: c.campo, nota: c.nota });
  }

  /* Sem nome nao ha importacao. Se nenhuma coluna virou nome, a coluna de
     texto que ficou com "descricao" e a candidata mais provavel - planilha
     costuma chamar o nome do produto de "descricao do item". */
  if (!camposUsados.has('nome')) {
    const daDescricao = [...campoDaColuna.entries()].find(([, v]) => v.campo === 'descricao');
    if (daDescricao) {
      campoDaColuna.set(daDescricao[0], { campo: 'nome', nota: 1 });
    }
  }

  return colunas.map((coluna, indice) => {
    const escolha = campoDaColuna.get(indice);

    if (!escolha) {
      return { coluna, campo: null, confianca: 'baixa' as const, motivo: 'Nenhum campo correspondente.' };
    }

    return {
      coluna,
      campo: escolha.campo,
      confianca: escolha.nota >= 3 ? ('alta' as const) : escolha.nota === 2 ? ('media' as const) : ('baixa' as const),
      motivo: 'Correspondencia pelo nome da coluna.',
    };
  });
};

/* Deteccao da convencao numerica olhando as amostras: se algum valor tem
   virgula com 1 ou 2 casas no fim, e brasileiro. */
export const detectarFormatoNumero = (amostras: string[][]): FormatoNumero => {
  let br = 0;
  let us = 0;

  for (const linha of amostras) {
    for (const celula of linha) {
      const t = String(celula ?? '');
      if (/\d,\d{1,2}(?!\d)/.test(t)) br += 1;
      if (/\d\.\d{1,2}(?!\d)/.test(t)) us += 1;
    }
  }

  return br >= us ? 'BR' : 'US';
};

/* ------------------------------------------------------------------ *
 * Analise por IA: NAO falamos com a Anthropic daqui. Quem fala e o
 * fluxo do n8n "Analisar Planilha de Produtos (painel) - Kotta", que
 * usa a credencial "Anthropic - Sales Kotta" ja comprovada em producao.
 *
 * Motivo: a ANTHROPIC_API_KEY deste projeto na Vercel respondia 401, e
 * a convencao do produto e que a orquestracao de IA mora no n8n.
 *
 * Continua valendo o mesmo cuidado: sobem SO os cabecalhos e ate 5
 * linhas de amostra - a planilha inteira nunca sai do navegador aqui.
 * ------------------------------------------------------------------ */
const URL_ANALISE_N8N =
  'https://primary-production-b86f1.up.railway.app/webhook/analisar-planilha-produtos';

interface RetornoIa {
  mapeamento: MapeamentoColuna[];
  formato_numero: FormatoNumero;
  avisos: string[];
}

/* Guarda por que a analise nao respondeu, para a tela poder dizer o
   motivo em vez de um generico "nao estava disponivel" - foi exatamente
   isso que escondeu a causa (401) no primeiro teste real. */
export let ultimoMotivoFalhaIa = '';

const analisarComIa = async (
  tokenN8n: string,
  colunas: string[],
  amostras: string[][],
): Promise<RetornoIa | null> => {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 60000);

  let resposta: Response;

  try {
    resposta = await fetch(URL_ANALISE_N8N, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kotta-token': tokenN8n },
      body: JSON.stringify({ colunas, amostras }),
      signal: controle.signal,
    });
  } finally {
    clearTimeout(limite);
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    ultimoMotivoFalhaIa = `A automacao respondeu ${resposta.status}`;
    console.error('[import-produtos] webhook de analise falhou:', resposta.status, detalhe.slice(0, 300));
    return null;
  }

  const bruto = (await resposta.json().catch(() => null)) as
    | { ok?: boolean; motivo?: string; mapeamento?: unknown; formato_numero?: string; avisos?: unknown[] }
    | null;

  if (!bruto || bruto.ok !== true || !Array.isArray(bruto.mapeamento)) {
    ultimoMotivoFalhaIa = typeof bruto?.motivo === 'string' && bruto.motivo ? bruto.motivo : 'A automacao nao devolveu o mapeamento.';
    console.error('[import-produtos] resposta inesperada da analise:', JSON.stringify(bruto).slice(0, 300));
    return null;
  }

  /* O n8n ja garante campo unico e coluna existente, mas conferimos de
     novo: quem valida o que entra e quem usa o dado. */
  const porColuna = new Map(
    (bruto.mapeamento as Array<{ coluna?: string; campo?: string | null; confianca?: string; motivo?: string }>).map(
      (m) => [String(m.coluna ?? ''), m],
    ),
  );
  const jaUsados = new Set<string>();

  const mapeamento: MapeamentoColuna[] = colunas.map((coluna) => {
    const m = porColuna.get(coluna);
    const campo = m?.campo && CAMPOS_VALIDOS.has(m.campo) && !jaUsados.has(m.campo) ? m.campo : null;
    if (campo) jaUsados.add(campo);

    const confianca = m?.confianca === 'alta' || m?.confianca === 'media' ? m.confianca : 'baixa';

    return {
      coluna,
      campo: campo as CampoProduto | null,
      confianca,
      motivo: typeof m?.motivo === 'string' ? m.motivo.slice(0, 160) : '',
    };
  });

  return {
    mapeamento,
    formato_numero: bruto.formato_numero === 'US' ? 'US' : 'BR',
    avisos: Array.isArray(bruto.avisos) ? bruto.avisos.map((a) => String(a).slice(0, 240)).slice(0, 8) : [],
  };
};

/* ------------------------------------------------------------------ *
 * Servico principal. Duas acoes:
 *   analisar  -> propoe o de-para (IA, com heuristica de reserva)
 *   importar  -> aplica pela MESMA RPC usada pelas fontes API/HTML/XML
 * ------------------------------------------------------------------ */
export type ModoImportacao = 'mesclar' | 'substituir';

interface ServiceOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  n8nToken?: string;
  requesterAccessToken: string;
  payload: {
    acao?: 'analisar' | 'importar';
    colunas?: string[];
    amostras?: string[][];
    mapeamento?: Array<{ coluna: string; campo: string | null }>;
    linhas?: Record<string, string>[];
    formato_numero?: FormatoNumero;
    modo?: ModoImportacao;
    nome_arquivo?: string;
  };
}

const LIMITE_LINHAS = 20000;

export async function importProductsCsvService(options: ServiceOptions) {
  const { payload } = options;
  const acao = payload?.acao;

  if (acao !== 'analisar' && acao !== 'importar') {
    throw new HttpError(400, 'Acao invalida. Use "analisar" ou "importar".');
  }

  const { adminClient, empresaId } = await validarChamador(options);

  /* ---------------------------- ANALISAR ---------------------------- */
  if (acao === 'analisar') {
    const colunas = (payload.colunas ?? []).map((c) => String(c ?? '').trim()).filter(Boolean);

    if (colunas.length === 0) {
      throw new HttpError(400, 'Nao foi possivel ler os cabecalhos da planilha.');
    }

    const amostras = (payload.amostras ?? []).slice(0, 5).map((l) => (l ?? []).map((c) => String(c ?? '')));

    let resultado: AnaliseResultado;

    ultimoMotivoFalhaIa = '';

    const daIa = options.n8nToken
      ? await analisarComIa(options.n8nToken, colunas, amostras).catch((e) => {
          ultimoMotivoFalhaIa =
            e instanceof Error && e.name === 'AbortError'
              ? 'A automacao demorou mais de 60s para responder.'
              : e instanceof Error
                ? e.message
                : 'Falha de rede ao chamar a automacao.';
          console.error('[import-produtos] excecao na analise:', e);
          return null;
        })
      : null;

    if (!options.n8nToken) {
      ultimoMotivoFalhaIa = 'A variavel N8N_KOTTA_TOKEN nao chegou ao servidor.';
    }

    if (daIa) {
      resultado = { ...daIa, camposFaltando: [] };
    } else {
      resultado = {
        mapeamento: mapearPorHeuristica(colunas),
        formato_numero: detectarFormatoNumero(amostras),
        avisos: [
          `A leitura automatica das colunas nao respondeu${ultimoMotivoFalhaIa ? ' (' + ultimoMotivoFalhaIa + ')' : ''}. O de-para abaixo saiu apenas do nome das colunas - confira com atencao antes de importar.`,
        ],
        camposFaltando: [],
      };
    }

    const preenchidos = new Set(resultado.mapeamento.map((m) => m.campo).filter(Boolean) as string[]);
    resultado.camposFaltando = CAMPOS_PRODUTO.filter((c) => c.obrigatorio && !preenchidos.has(c.campo)).map(
      (c) => c.rotulo,
    );

    return resultado;
  }

  /* ---------------------------- IMPORTAR ---------------------------- */
  const mapeamento = (payload.mapeamento ?? []).filter(
    (m) => m && typeof m.coluna === 'string' && m.campo && CAMPOS_VALIDOS.has(m.campo),
  ) as Array<{ coluna: string; campo: CampoProduto }>;

  /* Um campo pode receber MAIS DE UMA coluna quando faz sentido juntar
     (nome, descricao, categoria e informacoes extras). Preco, estoque,
     SKU, moeda e unidade aceitam uma so - juntar dois precos nao quer
     dizer nada. */
  const porCampo = new Map<CampoProduto, string[]>();
  for (const m of mapeamento) {
    const jaTem = porCampo.get(m.campo) ?? [];
    if (jaTem.length > 0 && !CAMPOS_VARIAS_COLUNAS.has(m.campo)) continue;
    porCampo.set(m.campo, [...jaTem, m.coluna]);
  }

  for (const obrigatorio of CAMPOS_PRODUTO.filter((c) => c.obrigatorio)) {
    if (!porCampo.has(obrigatorio.campo)) {
      throw new HttpError(400, `O campo "${obrigatorio.rotulo}" precisa estar associado a uma coluna da planilha.`);
    }
  }

  const linhas = payload.linhas ?? [];

  if (linhas.length === 0) {
    throw new HttpError(400, 'A planilha nao tem nenhuma linha de produto.');
  }

  if (linhas.length > LIMITE_LINHAS) {
    throw new HttpError(400, `A planilha tem ${linhas.length} linhas. O limite por importacao e ${LIMITE_LINHAS}.`);
  }

  const formato: FormatoNumero = payload.formato_numero === 'US' ? 'US' : 'BR';
  const modo: ModoImportacao = payload.modo === 'substituir' ? 'substituir' : 'mesclar';

  const vistos = new Set<string>();
  const metadataPorSku = new Map<string, Record<string, string>>();
  const produtos: Array<Record<string, unknown>> = [];
  const ignoradas: Array<{ linha: number; motivo: string }> = [];
  let duplicadas = 0;

  linhas.forEach((linha, indice) => {
    const numeroLinha = indice + 2; // +1 do cabecalho, +1 para virar 1-based

    /* Primeira coluna entra crua; as seguintes vao rotuladas com o nome
       do cabecalho, senao um codigo de barras solto no meio da descricao
       nao diria nada a ninguem (nem a IA). */
    const valorDe = (campo: CampoProduto) => {
      const colunas = porCampo.get(campo);
      if (!colunas || colunas.length === 0) return undefined;
      if (colunas.length === 1) return linha[colunas[0]];

      const partes = colunas
        .map((coluna, indice) => {
          const valor = limparTexto(linha[coluna]);
          if (!valor) return null;
          return indice === 0 ? valor : `${coluna}: ${valor}`;
        })
        .filter(Boolean);

      return partes.length > 0 ? partes.join(' · ') : undefined;
    };

    /* Cada coluna mandada para "Informacoes extras" vira uma chave do
       jsonb metadata. O padrao ja existe na base: os produtos vindos da
       sincronizacao guardam idaux, observacoes e ncm assim. */
    const metadataDaLinha = (() => {
      const colunas = porCampo.get('metadata') ?? [];
      const objeto: Record<string, string> = {};

      for (const coluna of colunas) {
        const valor = limparTexto(linha[coluna]);
        if (valor) objeto[coluna] = valor;
      }

      return Object.keys(objeto).length > 0 ? objeto : null;
    })();

    const sku = limparTexto(valorDe('codigo_sku'));
    const nome = limparTexto(valorDe('nome'));

    if (!sku) {
      ignoradas.push({ linha: numeroLinha, motivo: 'Sem codigo/SKU.' });
      return;
    }

    if (!nome) {
      ignoradas.push({ linha: numeroLinha, motivo: 'Sem nome do produto.' });
      return;
    }

    // O banco tem unicidade em (empresa_id, codigo_sku): a ultima linha vence,
    // mas registramos para a pessoa saber que a planilha repetia SKU.
    if (vistos.has(sku)) {
      duplicadas += 1;
    }
    vistos.add(sku);

    const descricao = limparTexto(valorDe('descricao'));
    const categoria = limparTexto(valorDe('categoria'));

    const produto = {
      codigo_sku: sku,
      nome,
      descricao,
      preco_venda: CAMPOS_NUMERICOS.has('preco_venda') ? converterNumero(valorDe('preco_venda'), formato) : null,
      moeda: limparTexto(valorDe('moeda')) ?? 'BRL',
      unidade_medida: limparTexto(valorDe('unidade_medida')),
      estoque: converterNumero(valorDe('estoque'), formato),
      categoria,
      texto_busca: [nome, descricao, categoria].filter(Boolean).join(' '),
    };

    // guardado fora do objeto que vai para a RPC - ela nao tem esse campo
    if (metadataDaLinha) metadataPorSku.set(sku, metadataDaLinha);

    const jaExiste = produtos.findIndex((p) => p.codigo_sku === sku);
    if (jaExiste >= 0) {
      produtos[jaExiste] = produto;
    } else {
      produtos.push(produto);
    }
  });

  if (produtos.length === 0) {
    throw new HttpError(
      400,
      'Nenhuma linha da planilha tinha codigo/SKU e nome preenchidos. Confira o de-para das colunas.',
    );
  }

  /* Produtos que a empresa ja tem, para separar criar de atualizar.
     Paginado: o PostgREST corta em 1000 linhas por resposta. */
  const atuais: Array<{ produto_id: string; codigo_sku: string; [k: string]: unknown }> = [];
  const passo = 1000;

  for (let inicio = 0; ; inicio += passo) {
    const { data, error } = await adminClient
      .from('sales_produtos_v2')
      .select('produto_id, codigo_sku, nome, descricao, preco_venda, moeda, unidade_medida, estoque, categoria, ativo, metadata')
      .eq('empresa_id', empresaId)
      .order('produto_id', { ascending: true })
      .range(inicio, inicio + passo - 1);

    if (error) {
      throw new HttpError(500, `Nao foi possivel ler o catalogo atual: ${error.message}`);
    }

    const lote = data ?? [];
    atuais.push(...(lote as typeof atuais));

    if (lote.length < passo) break;
  }

  const atuaisPorSku = new Map(atuais.map((p) => [p.codigo_sku, p]));

  const criar: Array<Record<string, unknown>> = [];
  const atualizar: Array<Record<string, unknown>> = [];

  for (const novo of produtos) {
    const atual = atuaisPorSku.get(novo.codigo_sku as string);

    if (!atual) {
      criar.push(novo);
      continue;
    }

    const mudou =
      atual.nome !== novo.nome ||
      (atual.descricao ?? null) !== novo.descricao ||
      Number(atual.preco_venda ?? NaN) !== Number(novo.preco_venda ?? NaN) ||
      (atual.moeda ?? null) !== novo.moeda ||
      (atual.unidade_medida ?? null) !== novo.unidade_medida ||
      Number(atual.estoque ?? NaN) !== Number(novo.estoque ?? NaN) ||
      (atual.categoria ?? null) !== novo.categoria ||
      atual.ativo === false;

    if (mudou) {
      const { codigo_sku: _ignorado, ...camposAtualizaveis } = novo;
      atualizar.push({ produto_id: atual.produto_id, ...camposAtualizaveis });
    }
  }

  // Desativar so no modo "substituir". No "mesclar", produto fora da
  // planilha fica intocado - e o comportamento seguro para planilha parcial.
  const desativar =
    modo === 'substituir'
      ? atuais.filter((p) => !vistos.has(p.codigo_sku) && p.ativo !== false).map((p) => p.produto_id)
      : [];

  const { data: resultadoRpc, error: erroRpc } = await adminClient.rpc('sales_v2_sync_aplicar', {
    p_payload: { empresa_id: empresaId, criar, atualizar, desativar },
  });

  if (erroRpc) {
    throw new HttpError(500, `Nao foi possivel gravar os produtos: ${erroRpc.message}`);
  }

  const contagem = Array.isArray(resultadoRpc) ? resultadoRpc[0] : resultadoRpc;

  // Registra a origem do catalogo, para a tela de Fonte de Dados refletir.
  await adminClient
    .from('sales_empresas_v2')
    .update({
      integracao_produtos: {
        tipo: 'PLANILHA',
        origem: 'csv',
        nome_arquivo: limparTexto(payload.nome_arquivo) ?? null,
        modo,
        linhas_arquivo: linhas.length,
        importado_em: new Date().toISOString(),
      },
    })
    .eq('empresa_id', empresaId);

  /* A RPC compartilhada nao tem o campo metadata (e ela atende todas as
     empresas, entao nao vou altera-la por causa desta tela). Gravamos
     numa segunda passada, em lotes, so nos produtos que tem algo. */
  let comInformacoesExtras = 0;

  if (metadataPorSku.size > 0) {
    const lote = 500;

    /* Comparacao canonica: o jsonb do Postgres devolve as chaves em outra
       ordem, entao comparar JSON.stringify cru acusaria diferenca sempre.
       Sem isso, TODO produto com informacoes extras era reescrito a cada
       importacao - e um gatilho set_updated_at na tabela carimba a data em
       qualquer escrita, entao o desperdicio nem aparecia como erro. */
    const canonico = (o: unknown) => {
      if (!o || typeof o !== 'object') return '{}';
      const obj = o as Record<string, unknown>;
      return JSON.stringify(
        Object.keys(obj)
          .sort()
          .map((k) => [k, String(obj[k] ?? '')]),
      );
    };

    const linhasMeta = produtos
      .filter((p) => {
        const sku = p.codigo_sku as string;
        if (!metadataPorSku.has(sku)) return false;

        const atual = atuaisPorSku.get(sku);
        if (!atual) return true; // produto novo: sempre grava

        return canonico(atual.metadata) !== canonico(metadataPorSku.get(sku));
      })
      .map((p) => ({
        empresa_id: empresaId,
        codigo_sku: p.codigo_sku as string,
        nome: p.nome as string,
        metadata: metadataPorSku.get(p.codigo_sku as string) as Record<string, string>,
      }));

    for (let i = 0; i < linhasMeta.length; i += lote) {
      const { error } = await adminClient
        .from('sales_produtos_v2')
        .upsert(linhasMeta.slice(i, i + lote), { onConflict: 'empresa_id,codigo_sku' });

      if (error) {
        throw new HttpError(500, `Os produtos entraram, mas as informacoes extras falharam: ${error.message}`);
      }
    }

    comInformacoesExtras = linhasMeta.length; // quantos precisaram ser gravados
  }

  /* Avisa a automacao para recalcular a busca inteligente agora, em vez
     de esperar a varredura de seguranca que roda a cada 3h. Se falhar,
     a importacao NAO pode falhar junto - por isso o catch vazio. */
  try {
    await fetch('https://primary-production-b86f1.up.railway.app/webhook/gerar-embeddings-v2', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ motivo: 'importacao_planilha_produtos' }),
    });
  } catch {
    // a varredura de 3h cobre este caso
  }

  return {
    criados: Number(contagem?.criados ?? 0),
    atualizados: Number(contagem?.atualizados ?? 0),
    desativados: Number(contagem?.desativados ?? 0),
    lidas: linhas.length,
    validas: produtos.length,
    ignoradas: ignoradas.slice(0, 50),
    total_ignoradas: ignoradas.length,
    duplicadas,
    com_informacoes_extras: comInformacoesExtras,
    modo,
  };
}
