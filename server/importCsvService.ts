import { createClient } from '@supabase/supabase-js';
import { HttpError } from './createMemberService.js';
import {
  catalogoParaIa,
  pegarCatalogo,
  type Catalogo,
  type CampoCatalogo,
  type TipoImportacao,
} from './catalogosImportacao.js';

export type FormatoNumero = 'BR' | 'US';

export interface MapeamentoColuna {
  coluna: string;
  campo: string | null;
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
 * Reserva sem IA: casa pelo nome da coluna. Serve quando a analise nao
 * responde - a importacao nunca pode depender exclusivamente dela.
 * ------------------------------------------------------------------ */
const RUIDO = new Set(['do', 'da', 'de', 'dos', 'das', 'e', 'o', 'a', 'no', 'na', 'por', 'p']);

const normalizarNome = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

export const mapearPorHeuristica = (colunas: string[], catalogo: Catalogo): MapeamentoColuna[] => {
  const palavrasPorColuna = colunas.map((c) => emPalavras(c));

  /* Pontua TODOS os pares coluna x campo antes de decidir. Atribuir na
     ordem das colunas deixava a primeira coluna "roubar" um campo que
     combinava muito mais com outra. */
  const candidatos: Array<{ indice: number; campo: string; nota: number }> = [];

  colunas.forEach((_, indice) => {
    for (const campo of catalogo.campos) {
      if (campo.sinonimos.length === 0) continue; // metadata: so escolha manual
      const nota = pontuar(palavrasPorColuna[indice], campo.sinonimos);
      if (nota > 0) candidatos.push({ indice, campo: campo.campo, nota });
    }
  });

  candidatos.sort((a, b) => b.nota - a.nota || a.indice - b.indice);

  const campoDaColuna = new Map<number, { campo: string; nota: number }>();
  const colunasUsadas = new Set<number>();
  const camposUsados = new Set<string>();

  for (const c of candidatos) {
    if (colunasUsadas.has(c.indice) || camposUsados.has(c.campo)) continue;
    colunasUsadas.add(c.indice);
    camposUsados.add(c.campo);
    campoDaColuna.set(c.indice, { campo: c.campo, nota: c.nota });
  }

  /* Sem nome nao ha importacao. Se nenhuma coluna virou nome, a que ficou
     com "descricao" e a candidata mais provavel - planilha costuma chamar
     o nome do produto de "descricao do item". */
  if (!camposUsados.has('nome')) {
    const daDescricao = [...campoDaColuna.entries()].find(([, v]) => v.campo === 'descricao');
    if (daDescricao) campoDaColuna.set(daDescricao[0], { campo: 'nome', nota: 1 });
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
  catalogo: Catalogo,
): Promise<RetornoIa | null> => {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 60000);

  let resposta: Response;

  try {
    resposta = await fetch(URL_ANALISE_N8N, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kotta-token': tokenN8n },
      body: JSON.stringify({ colunas, amostras, assunto: catalogo.assunto, campos: catalogoParaIa(catalogo) }),
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
    const valido = new Set(catalogo.campos.map((c) => c.campo));
    const campo = m?.campo && valido.has(m.campo) && !jaUsados.has(m.campo) ? m.campo : null;
    if (campo) jaUsados.add(campo);

    const confianca = m?.confianca === 'alta' || m?.confianca === 'media' ? m.confianca : 'baixa';

    return {
      coluna,
      campo,
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
 *   importar  -> grava, pela mesma RPC que a sincronizacao automatica usa
 * Serve produtos e clientes: o que muda e o catalogo e o caminho de
 * escrita, nao o fluxo.
 * ------------------------------------------------------------------ */
export type ModoImportacao = 'mesclar' | 'substituir';

interface ServiceOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  n8nToken?: string;
  requesterAccessToken: string;
  payload: {
    tipo?: TipoImportacao;
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

export async function importCsvService(options: ServiceOptions) {
  const { payload } = options;
  const acao = payload?.acao;

  if (acao !== 'analisar' && acao !== 'importar') {
    throw new HttpError(400, 'Acao invalida. Use "analisar" ou "importar".');
  }

  const catalogo = pegarCatalogo(payload?.tipo);
  const camposValidos = new Set(catalogo.campos.map((c) => c.campo));
  const camposVarias = new Set(catalogo.campos.filter((c) => c.varias).map((c) => c.campo));
  const camposNumericos = new Set(catalogo.campos.filter((c) => c.tipo === 'numero').map((c) => c.campo));

  const { adminClient, empresaId } = await validarChamador(options);

  /* ---------------------------- ANALISAR ---------------------------- */
  if (acao === 'analisar') {
    const colunas = (payload.colunas ?? []).map((c) => String(c ?? '').trim()).filter(Boolean);

    if (colunas.length === 0) {
      throw new HttpError(400, 'Nao foi possivel ler os cabecalhos da planilha.');
    }

    const amostras = (payload.amostras ?? []).slice(0, 5).map((l) => (l ?? []).map((c) => String(c ?? '')));

    ultimoMotivoFalhaIa = '';

    const daIa = options.n8nToken
      ? await analisarComIa(options.n8nToken, colunas, amostras, catalogo).catch((e) => {
          ultimoMotivoFalhaIa =
            e instanceof Error && e.name === 'AbortError'
              ? 'A automacao demorou mais de 60s para responder.'
              : e instanceof Error
                ? e.message
                : 'Falha de rede ao chamar a automacao.';
          console.error('[import-csv] excecao na analise:', e);
          return null;
        })
      : null;

    if (!options.n8nToken) {
      ultimoMotivoFalhaIa = 'A variavel N8N_KOTTA_TOKEN nao chegou ao servidor.';
    }

    let resultado: AnaliseResultado;

    if (daIa) {
      resultado = { ...daIa, camposFaltando: [] };
    } else {
      resultado = {
        mapeamento: mapearPorHeuristica(colunas, catalogo),
        formato_numero: detectarFormatoNumero(amostras),
        avisos: [
          `A leitura automatica das colunas nao respondeu${ultimoMotivoFalhaIa ? ' (' + ultimoMotivoFalhaIa + ')' : ''}. O de-para abaixo saiu apenas do nome das colunas - confira com atencao antes de importar.`,
        ],
        camposFaltando: [],
      };
    }

    resultado.camposFaltando = faltando(resultado.mapeamento, catalogo);

    return resultado;
  }

  /* ---------------------------- IMPORTAR ---------------------------- */
  const mapeamento = (payload.mapeamento ?? []).filter(
    (m) => m && typeof m.coluna === 'string' && m.campo && camposValidos.has(m.campo),
  ) as Array<{ coluna: string; campo: string }>;

  const porCampo = new Map<string, string[]>();
  for (const m of mapeamento) {
    const jaTem = porCampo.get(m.campo) ?? [];
    if (jaTem.length > 0 && !camposVarias.has(m.campo)) continue;
    porCampo.set(m.campo, [...jaTem, m.coluna]);
  }

  const pendentes = faltando(
    mapeamento.map((m) => ({ coluna: m.coluna, campo: m.campo, confianca: 'alta' as const, motivo: '' })),
    catalogo,
  );

  if (pendentes.length > 0) {
    throw new HttpError(400, `Falta indicar qual coluna corresponde a: ${pendentes.join(', ')}.`);
  }

  const linhas = payload.linhas ?? [];

  if (linhas.length === 0) {
    throw new HttpError(400, 'A planilha nao tem nenhuma linha para importar.');
  }

  if (linhas.length > LIMITE_LINHAS) {
    throw new HttpError(400, `A planilha tem ${linhas.length} linhas. O limite por importacao e ${LIMITE_LINHAS}.`);
  }

  const formato: FormatoNumero = payload.formato_numero === 'US' ? 'US' : 'BR';
  const modo: ModoImportacao = payload.modo === 'substituir' ? 'substituir' : 'mesclar';

  const vistos = new Set<string>();
  const extrasPorChave = new Map<string, Record<string, string>>();
  const registros: Array<Record<string, unknown>> = [];
  const ignoradas: Array<{ linha: number; motivo: string }> = [];
  let duplicadas = 0;

  linhas.forEach((linha, indice) => {
    const numeroLinha = indice + 2; // +1 do cabecalho, +1 para virar 1-based

    /* Primeira coluna entra crua; as seguintes vao rotuladas com o nome
       do cabecalho, senao um codigo de barras solto no meio da descricao
       nao diria nada a ninguem (nem a IA). */
    const valorDe = (campo: string) => {
      const colunas = porCampo.get(campo);
      if (!colunas || colunas.length === 0) return undefined;
      if (colunas.length === 1) return linha[colunas[0]];

      const partes = colunas
        .map((coluna, i) => {
          const valor = limparTexto(linha[coluna]);
          if (!valor) return null;
          return i === 0 ? valor : `${coluna}: ${valor}`;
        })
        .filter(Boolean);

      return partes.length > 0 ? partes.join(' · ') : undefined;
    };

    const registro: Record<string, unknown> = {};

    for (const campo of catalogo.campos) {
      if (campo.campo === 'metadata') continue;

      if (camposNumericos.has(campo.campo)) {
        registro[campo.campo] = converterNumero(valorDe(campo.campo), formato);
        continue;
      }

      const texto = limparTexto(valorDe(campo.campo));

      /* Campo chave guardado em formato diferente do resto da base faz a
         mesma empresa virar dois cadastros - a unicidade compara o texto
         literal. Ver o comentario em catalogosImportacao. */
      registro[campo.campo] =
        campo.normalizar === 'digitos' && texto ? texto.replace(/\D/g, '') || null : texto;
    }

    // nome e obrigatorio nos dois catalogos
    if (!registro.nome) {
      ignoradas.push({ linha: numeroLinha, motivo: 'Sem nome preenchido.' });
      return;
    }

    /* A identidade e o que permite decidir criar x atualizar. Produtos tem
       uma chave so; clientes tem duas e basta uma delas. */
    const chave = catalogo.chaves.map((k) => registro[k]).find((v) => v) as string | undefined;

    if (!chave) {
      ignoradas.push({ linha: numeroLinha, motivo: `Sem ${catalogo.chaveTexto}.` });
      return;
    }

    if (vistos.has(chave)) duplicadas += 1;
    vistos.add(chave);

    if (catalogo.tipo === 'produtos') {
      registro.moeda = registro.moeda ?? 'BRL';
      registro.texto_busca = [registro.nome, registro.descricao, registro.categoria].filter(Boolean).join(' ');
    }

    const extras = (() => {
      const colunas = porCampo.get('metadata') ?? [];
      const objeto: Record<string, string> = {};
      for (const coluna of colunas) {
        const valor = limparTexto(linha[coluna]);
        if (valor) objeto[coluna] = valor;
      }
      return Object.keys(objeto).length > 0 ? objeto : null;
    })();

    if (extras) extrasPorChave.set(chave, extras);

    const jaExiste = registros.findIndex((r) => catalogo.chaves.some((k) => r[k] && r[k] === registro[k]));
    if (jaExiste >= 0) {
      registros[jaExiste] = registro;
    } else {
      registros.push(registro);
    }
  });

  if (registros.length === 0) {
    throw new HttpError(
      400,
      `Nenhuma linha tinha ${catalogo.chaveTexto} e nome preenchidos. Confira o de-para das colunas.`,
    );
  }

  const resultado =
    catalogo.tipo === 'produtos'
      ? await gravarProdutos({ adminClient, empresaId, registros, extrasPorChave, vistos, modo })
      : await gravarClientes({ adminClient, empresaId, registros, extrasPorChave, vistos, modo });

  /* Registra a origem do cadastro, para a tela de Fonte de Dados refletir. */
  const coluna = catalogo.tipo === 'produtos' ? 'integracao_produtos' : 'integracao_clientes';

  await adminClient
    .from('sales_empresas_v2')
    .update({
      [coluna]: {
        tipo: 'PLANILHA',
        origem: 'csv',
        nome_arquivo: limparTexto(payload.nome_arquivo) ?? null,
        modo,
        linhas_arquivo: linhas.length,
        importado_em: new Date().toISOString(),
      },
    })
    .eq('empresa_id', empresaId);

  return {
    ...resultado,
    lidas: linhas.length,
    validas: registros.length,
    ignoradas: ignoradas.slice(0, 50),
    total_ignoradas: ignoradas.length,
    duplicadas,
    modo,
  };
}

/* Campos obrigatorios que ficaram sem coluna. Para clientes, as duas
   chaves contam como UMA exigencia: basta uma delas. */
const faltando = (mapeamento: MapeamentoColuna[], catalogo: Catalogo) => {
  const usados = new Set(mapeamento.map((m) => m.campo).filter(Boolean) as string[]);
  const pendentes: string[] = [];

  for (const campo of catalogo.campos) {
    if (campo.obrigatorio && !usados.has(campo.campo)) pendentes.push(campo.rotulo);
  }

  if (!catalogo.chaves.some((k) => usados.has(k))) {
    pendentes.push(catalogo.chaveTexto);
  }

  return pendentes;
};

/* ------------------------------------------------------------------ *
 * Caminhos de escrita. Cada um usa a MESMA RPC que a sincronizacao
 * automatica daquele cadastro ja usa, em vez de abrir um segundo
 * caminho de escrita.
 * ------------------------------------------------------------------ */
/* O tipo vem de quem realmente cria o cliente, e nao de createClient
   direto: assim acompanha o generico que o supabase-js infere ali. */
type ClienteAdmin = Awaited<ReturnType<typeof validarChamador>>['adminClient'];

interface ArgsGravar {
  adminClient: ClienteAdmin;
  empresaId: string;
  registros: Array<Record<string, unknown>>;
  extrasPorChave: Map<string, Record<string, string>>;
  vistos: Set<string>;
  modo: ModoImportacao;
}

/* Comparacao canonica: o jsonb do Postgres devolve as chaves em outra
   ordem, entao comparar JSON.stringify cru acusaria diferenca sempre e
   todo registro seria reescrito a cada importacao. */
const canonico = (o: unknown) => {
  if (!o || typeof o !== 'object') return '[]';
  const obj = o as Record<string, unknown>;
  /* Vazio precisa dar o MESMO texto vindo de null ou de {}: antes null
     virava "{}" e {} virava "[]", entao registro sem informacoes extras
     era reescrito a cada importacao, para sempre. */
  return JSON.stringify(
    Object.keys(obj)
      .sort()
      .map((k) => [k, String(obj[k] ?? '')]),
  );
};

const lerTudo = async (
  adminClient: ClienteAdmin,
  tabela: string,
  colunas: string,
  empresaId: string,
  ordem: string,
) => {
  const linhas: Array<Record<string, unknown>> = [];
  const passo = 1000;

  for (let inicio = 0; ; inicio += passo) {
    const { data, error } = await adminClient
      .from(tabela)
      .select(colunas)
      .eq('empresa_id', empresaId)
      .order(ordem, { ascending: true })
      .range(inicio, inicio + passo - 1);

    if (error) throw new HttpError(500, `Nao foi possivel ler o cadastro atual: ${error.message}`);

    const lote = (data ?? []) as unknown as Array<Record<string, unknown>>;
    linhas.push(...lote);
    if (lote.length < passo) break;
  }

  return linhas;
};

const gravarProdutos = async ({ adminClient, empresaId, registros, extrasPorChave, vistos, modo }: ArgsGravar) => {
  const atuais = await lerTudo(
    adminClient,
    'sales_produtos_v2',
    'produto_id, codigo_sku, nome, descricao, preco_venda, moeda, unidade_medida, estoque, categoria, ativo, metadata, link_referencia',
    empresaId,
    'produto_id',
  );

  const porSku = new Map(atuais.map((p) => [p.codigo_sku as string, p]));

  const criar: Array<Record<string, unknown>> = [];
  const atualizar: Array<Record<string, unknown>> = [];

  for (const novo of registros) {
    const atual = porSku.get(novo.codigo_sku as string);

    if (!atual) {
      criar.push(semCampos(novo, ['link_referencia']));
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
      const { codigo_sku: _ignorado, ...campos } = semCampos(novo, ['link_referencia']);
      atualizar.push({ produto_id: atual.produto_id, ...campos });
    }
  }

  const desativar =
    modo === 'substituir'
      ? atuais.filter((p) => !vistos.has(p.codigo_sku as string) && p.ativo !== false).map((p) => p.produto_id)
      : [];

  const { data, error } = await adminClient.rpc('sales_v2_sync_aplicar', {
    p_payload: { empresa_id: empresaId, criar, atualizar, desativar },
  });

  if (error) throw new HttpError(500, `Nao foi possivel gravar os produtos: ${error.message}`);

  /* A RPC compartilhada nao conhece metadata nem link_referencia, e ela
     atende todas as empresas - nao vou altera-la por causa desta tela.
     Segunda passada, so em quem realmente mudou. */
  const extras = registros
    .filter((r) => {
      const sku = r.codigo_sku as string;
      const atual = porSku.get(sku);
      const metaNovo = extrasPorChave.get(sku) ?? null;
      const linkNovo = (r.link_referencia ?? null) as string | null;

      if (!atual) return Boolean(metaNovo || linkNovo);

      return (
        canonico(atual.metadata) !== canonico(metaNovo) ||
        ((atual.link_referencia ?? null) as string | null) !== linkNovo
      );
    })
    .map((r) => ({
      empresa_id: empresaId,
      codigo_sku: r.codigo_sku as string,
      nome: r.nome as string,
      metadata: extrasPorChave.get(r.codigo_sku as string) ?? {},
      link_referencia: (r.link_referencia ?? null) as string | null,
    }));

  await gravarExtras(adminClient, 'sales_produtos_v2', 'empresa_id,codigo_sku', extras);

  const c = (Array.isArray(data) ? data[0] : data) as { criados?: number; atualizados?: number; desativados?: number } | null;

  /* Produto que so ganhou link ou informacao extra tambem foi ATUALIZADO -
     a RPC nao conta isso porque essas duas colunas sao gravadas na segunda
     passada. Sem somar aqui, a tela dizia "1 atualizado" tendo escrito 7. */
  const jaContados = new Set(atualizar.map((a) => a.produto_id));
  const soNaSegundaPassada = extras.filter((e) => {
    const atual = porSku.get(e.codigo_sku);
    return atual && !jaContados.has(atual.produto_id);
  }).length;

  return {
    criados: Number(c?.criados ?? 0),
    atualizados: Number(c?.atualizados ?? 0) + soNaSegundaPassada,
    desativados: Number(c?.desativados ?? 0),
  };
};

const gravarClientes = async ({ adminClient, empresaId, registros, extrasPorChave, vistos, modo }: ArgsGravar) => {
  const atuais = await lerTudo(
    adminClient,
    'sales_clientes_v2',
    'cliente_id, codigo_erp, cnpj, nome, razao_social, email, telefone, whatsapp, ativo, metadata',
    empresaId,
    'cliente_id',
  );

  /* Cliente e identificado por codigo_erp OU cnpj (dois indices unicos
     parciais no banco). Indexamos pelos dois para achar o existente. */
  const porChave = new Map<string, Record<string, unknown>>();
  for (const c of atuais) {
    if (c.codigo_erp) porChave.set(String(c.codigo_erp), c);
    if (c.cnpj) porChave.set(String(c.cnpj), c);
  }

  const achar = (r: Record<string, unknown>) => {
    for (const k of ['codigo_erp', 'cnpj']) {
      const v = r[k];
      if (v && porChave.has(String(v))) return porChave.get(String(v));
    }
    return undefined;
  };

  const criar: Array<Record<string, unknown>> = [];
  const atualizar: Array<Record<string, unknown>> = [];
  const encontrados = new Set<string>();

  for (const novo of registros) {
    const atual = achar(novo);

    if (!atual) {
      criar.push(novo);
      continue;
    }

    encontrados.add(String(atual.cliente_id));

    const mudou =
      atual.nome !== novo.nome ||
      (atual.razao_social ?? null) !== novo.razao_social ||
      (atual.email ?? null) !== novo.email ||
      (atual.telefone ?? null) !== novo.telefone ||
      (atual.whatsapp ?? null) !== novo.whatsapp ||
      (atual.codigo_erp ?? null) !== (novo.codigo_erp ?? null) ||
      (atual.cnpj ?? null) !== (novo.cnpj ?? null) ||
      atual.ativo === false;

    if (mudou) atualizar.push({ cliente_id: atual.cliente_id, ...novo });
  }

  const { data, error } = await adminClient.rpc('sales_v2_sync_clientes_aplicar', {
    p_payload: {
      empresa_id: empresaId,
      criar,
      atualizar,
      /* A RPC desativa por "ausente em 3 ciclos", desenho feito para a
         sincronizacao paginada por API. Numa planilha isso exigiria 3
         importacoes para sumir um cliente - errado aqui. Passamos false
         e desativamos direto logo abaixo. */
      desativar_ausentes: false,
    },
  });

  if (error) throw new HttpError(500, `Nao foi possivel gravar os clientes: ${error.message}`);

  let desativados = 0;

  if (modo === 'substituir') {
    const fora = atuais
      .filter((c) => c.ativo !== false && !encontrados.has(String(c.cliente_id)))
      .map((c) => c.cliente_id as string);

    for (let i = 0; i < fora.length; i += 500) {
      const { error: erroOff } = await adminClient
        .from('sales_clientes_v2')
        .update({ ativo: false })
        .in('cliente_id', fora.slice(i, i + 500));

      if (erroOff) throw new HttpError(500, `Nao foi possivel desativar os ausentes: ${erroOff.message}`);
    }

    desativados = fora.length;
  }

  /* Releitura obrigatoria: o mapa acima foi montado ANTES da RPC, entao
     cliente recem-criado nao tem id nele. Sem isso, o registro novo era
     descartado em silencio e as informacoes extras so entravam na
     importacao SEGUINTE - foi exatamente o que aconteceu no teste.
     O caminho de produtos nao sofre disso porque grava por upsert na
     chave natural, que existe antes da linha. */
  const depois = await lerTudo(
    adminClient,
    'sales_clientes_v2',
    'cliente_id, codigo_erp, cnpj, metadata',
    empresaId,
    'cliente_id',
  );

  const porChaveDepois = new Map<string, Record<string, unknown>>();
  for (const c of depois) {
    if (c.codigo_erp) porChaveDepois.set(String(c.codigo_erp), c);
    if (c.cnpj) porChaveDepois.set(String(c.cnpj), c);
  }

  const acharDepois = (r: Record<string, unknown>) => {
    for (const k of ['codigo_erp', 'cnpj']) {
      const v = r[k];
      if (v && porChaveDepois.has(String(v))) return porChaveDepois.get(String(v));
    }
    return undefined;
  };

  const extras = registros
    .map((r) => {
      const chave = (r.codigo_erp || r.cnpj) as string;
      return { chave, atual: acharDepois(r), metadata: extrasPorChave.get(chave) ?? null };
    })
    .filter((e) => e.atual && canonico(e.atual.metadata) !== canonico(e.metadata))
    .map((e) => ({
      cliente_id: e.atual!.cliente_id as string,
      chave: e.chave,
      metadata: e.metadata ?? {},
    }));

  for (const e of extras) {
    await adminClient.from('sales_clientes_v2').update({ metadata: e.metadata }).eq('cliente_id', e.cliente_id);
  }

  const c = (Array.isArray(data) ? data[0] : data) as { criados?: number; atualizados?: number; desativados?: number } | null;

  // mesma correcao dos produtos: informacao extra tambem e atualizacao
  const jaContados = new Set(atualizar.map((a) => a.cliente_id));
  const soNaSegundaPassada = extras.filter((e) => !jaContados.has(e.cliente_id)).length;

  return {
    criados: Number(c?.criados ?? 0),
    atualizados: Number(c?.atualizados ?? 0) + soNaSegundaPassada,
    desativados,
  };
};

const semCampos = (o: Record<string, unknown>, remover: string[]) => {
  const copia = { ...o };
  for (const k of remover) delete copia[k];
  return copia;
};

const gravarExtras = async (
  adminClient: ClienteAdmin,
  tabela: string,
  conflito: string,
  linhas: Array<Record<string, unknown>>,
) => {
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await adminClient.from(tabela).upsert(linhas.slice(i, i + 500), { onConflict: conflito });
    if (error) throw new HttpError(500, `Os registros entraram, mas as informacoes extras falharam: ${error.message}`);
  }
};
