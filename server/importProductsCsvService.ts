import { createClient } from '@supabase/supabase-js';
import { HttpError } from './createMemberService.js';

/* ------------------------------------------------------------------ *
 * Campos da tabela sales_produtos_v2 que a planilha pode preencher.
 * codigo_sku e nome sao NOT NULL no banco - sem eles nao ha importacao.
 * ------------------------------------------------------------------ */
export const CAMPOS_PRODUTO = [
  { campo: 'codigo_sku', rotulo: 'Codigo / SKU', obrigatorio: true, tipo: 'texto' },
  { campo: 'nome', rotulo: 'Nome do produto', obrigatorio: true, tipo: 'texto' },
  { campo: 'descricao', rotulo: 'Descricao', obrigatorio: false, tipo: 'texto' },
  { campo: 'preco_venda', rotulo: 'Preco de venda', obrigatorio: false, tipo: 'numero' },
  { campo: 'moeda', rotulo: 'Moeda', obrigatorio: false, tipo: 'texto' },
  { campo: 'unidade_medida', rotulo: 'Unidade de medida', obrigatorio: false, tipo: 'texto' },
  { campo: 'estoque', rotulo: 'Estoque', obrigatorio: false, tipo: 'numero' },
  { campo: 'categoria', rotulo: 'Categoria', obrigatorio: false, tipo: 'texto' },
] as const;

type CampoProduto = (typeof CAMPOS_PRODUTO)[number]['campo'];

const CAMPOS_VALIDOS = new Set<string>(CAMPOS_PRODUTO.map((c) => c.campo));
const CAMPOS_NUMERICOS = new Set<string>(
  CAMPOS_PRODUTO.filter((c) => c.tipo === 'numero').map((c) => c.campo),
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
  codigo_sku: ['sku', 'codigo', 'cod', 'code', 'referencia', 'ref', 'codproduto', 'codigoproduto', 'item'],
  nome: ['nome', 'produto', 'descricaoproduto', 'name', 'title', 'titulo', 'nomeproduto', 'mercadoria'],
  descricao: ['descricao', 'description', 'detalhe', 'detalhes', 'observacao', 'obs', 'especificacao'],
  preco_venda: ['preco', 'precovenda', 'valor', 'valorvenda', 'price', 'precounitario', 'valorunitario', 'vlrvenda'],
  moeda: ['moeda', 'currency'],
  unidade_medida: ['unidade', 'unidademedida', 'un', 'um', 'medida', 'unit', 'embalagem'],
  estoque: ['estoque', 'quantidade', 'qtd', 'qtde', 'saldo', 'stock', 'disponivel', 'saldoestoque'],
  categoria: ['categoria', 'grupo', 'familia', 'linha', 'category', 'segmento', 'departamento'],
};

const normalizarNome = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export const mapearPorHeuristica = (colunas: string[]): MapeamentoColuna[] => {
  const usados = new Set<string>();

  return colunas.map((coluna) => {
    const alvo = normalizarNome(coluna);
    let melhor: { campo: CampoProduto; peso: number } | null = null;

    for (const [campo, termos] of Object.entries(SINONIMOS) as [CampoProduto, string[]][]) {
      if (usados.has(campo)) continue;

      for (const termo of termos) {
        // igual vale mais que "contem", para "codigo" nao roubar "codigobarras"
        const peso = alvo === termo ? 3 : alvo.startsWith(termo) ? 2 : alvo.includes(termo) ? 1 : 0;
        if (peso > (melhor?.peso ?? 0)) {
          melhor = { campo, peso };
        }
      }
    }

    if (!melhor) {
      return { coluna, campo: null, confianca: 'baixa' as const, motivo: 'Nenhum campo correspondente.' };
    }

    usados.add(melhor.campo);

    return {
      coluna,
      campo: melhor.campo,
      confianca: melhor.peso === 3 ? ('alta' as const) : melhor.peso === 2 ? ('media' as const) : ('baixa' as const),
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
 * Analise por IA: recebe SO os cabecalhos e poucas linhas de amostra -
 * o arquivo inteiro nunca sai do navegador para a Anthropic.
 * ------------------------------------------------------------------ */
const analisarComIa = async (
  anthropicApiKey: string,
  colunas: string[],
  amostras: string[][],
): Promise<{ mapeamento: MapeamentoColuna[]; formato_numero: FormatoNumero; avisos: string[] } | null> => {
  const catalogo = CAMPOS_PRODUTO.map(
    (c) => `- ${c.campo} (${c.rotulo})${c.obrigatorio ? ' [OBRIGATORIO]' : ''} - tipo ${c.tipo}`,
  ).join('\n');

  const tabela = [colunas, ...amostras]
    .map((linha) => linha.map((c) => String(c ?? '').slice(0, 60)).join(' | '))
    .join('\n');

  const prompt = `Voce recebe as colunas de uma planilha de produtos enviada por uma empresa e precisa dizer qual coluna corresponde a qual campo do nosso catalogo.

CAMPOS DO NOSSO CATALOGO:
${catalogo}

PLANILHA (primeira linha = cabecalho, demais = amostra real):
${tabela}

REGRAS:
1. Cada campo do catalogo pode ser usado no maximo UMA vez.
2. Coluna que nao corresponde a nenhum campo recebe campo: null. E normal sobrar coluna.
3. Olhe o CONTEUDO das amostras, nao so o nome da coluna. Um cabecalho generico como "Codigo" pode ser SKU ou codigo de barras - o conteudo decide.
4. codigo_sku e o identificador unico do produto. Se houver varios candidatos, prefira o que parece codigo interno, nao codigo de barras (EAN/GTIN tem 8, 12, 13 ou 14 digitos).
5. nome e o texto que identifica o produto para uma pessoa.
6. formato_numero: "BR" se os numeros usam virgula como decimal (1.234,56), "US" se usam ponto (1,234.56).
7. confianca: "alta" se nome e conteudo concordam, "media" se so um deles, "baixa" se e chute.
8. Em avisos, escreva em portugues qualquer coisa que a pessoa precise conferir (ex: dois candidatos a SKU, coluna de preco parecendo custo em vez de venda, campo obrigatorio ausente).

Responda SOMENTE com JSON valido, sem texto antes ou depois:
{"mapeamento":[{"coluna":"<nome exato da coluna>","campo":"<campo ou null>","confianca":"alta|media|baixa","motivo":"<curto, em portugues>"}],"formato_numero":"BR|US","avisos":["..."]}`;

  const resposta = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resposta.ok) {
    return null;
  }

  const corpo = (await resposta.json()) as { content?: Array<{ type: string; text?: string }> };
  // modelos recentes podem devolver um bloco de raciocinio antes do texto
  const bloco = corpo.content?.find((c) => c.type === 'text' && typeof c.text === 'string');
  if (!bloco?.text) return null;

  const texto = bloco.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return null;
  }

  const dados = bruto as {
    mapeamento?: Array<{ coluna?: string; campo?: string | null; confianca?: string; motivo?: string }>;
    formato_numero?: string;
    avisos?: unknown[];
  };

  if (!Array.isArray(dados.mapeamento)) return null;

  const porColuna = new Map(dados.mapeamento.map((m) => [String(m.coluna ?? ''), m]));
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
    formato_numero: dados.formato_numero === 'US' ? 'US' : 'BR',
    avisos: Array.isArray(dados.avisos) ? dados.avisos.map((a) => String(a).slice(0, 240)).slice(0, 8) : [],
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
  anthropicApiKey?: string;
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

    const daIa = options.anthropicApiKey
      ? await analisarComIa(options.anthropicApiKey, colunas, amostras).catch(() => null)
      : null;

    if (daIa) {
      resultado = { ...daIa, camposFaltando: [] };
    } else {
      resultado = {
        mapeamento: mapearPorHeuristica(colunas),
        formato_numero: detectarFormatoNumero(amostras),
        avisos: [
          'A leitura automatica por IA nao estava disponivel, entao o de-para abaixo foi montado apenas pelo nome das colunas. Confira com atencao antes de importar.',
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

  const porCampo = new Map<CampoProduto, string>();
  for (const m of mapeamento) {
    if (!porCampo.has(m.campo)) porCampo.set(m.campo, m.coluna);
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
  const produtos: Array<Record<string, unknown>> = [];
  const ignoradas: Array<{ linha: number; motivo: string }> = [];
  let duplicadas = 0;

  linhas.forEach((linha, indice) => {
    const numeroLinha = indice + 2; // +1 do cabecalho, +1 para virar 1-based

    const valorDe = (campo: CampoProduto) => {
      const coluna = porCampo.get(campo);
      return coluna ? linha[coluna] : undefined;
    };

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
      .select('produto_id, codigo_sku, nome, descricao, preco_venda, moeda, unidade_medida, estoque, categoria, ativo')
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
    modo,
  };
}
