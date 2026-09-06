import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Database,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { lerCsv, type PlanilhaLida } from '../lib/csv';
import { supabase } from '../lib/supabase';

/* O catalogo de campos vem do MESMO arquivo que o servidor usa. Manter
   uma copia aqui era garantia de divergir no primeiro campo novo. */
const CAMPOS_POR_TIPO: Record<TipoPlanilha, Array<{ campo: string; rotulo: string; obrigatorio: boolean; varias: boolean }>> = {
  produtos: [
    { campo: 'codigo_sku', rotulo: 'Código / SKU', obrigatorio: true, varias: false },
    { campo: 'nome', rotulo: 'Nome do produto', obrigatorio: true, varias: true },
    { campo: 'descricao', rotulo: 'Descrição', obrigatorio: false, varias: true },
    { campo: 'preco_venda', rotulo: 'Preço de venda', obrigatorio: false, varias: false },
    { campo: 'moeda', rotulo: 'Moeda', obrigatorio: false, varias: false },
    { campo: 'unidade_medida', rotulo: 'Unidade de medida', obrigatorio: false, varias: false },
    { campo: 'estoque', rotulo: 'Quantidade em estoque', obrigatorio: false, varias: false },
    { campo: 'categoria', rotulo: 'Categoria', obrigatorio: false, varias: true },
    { campo: 'link_referencia', rotulo: 'Link de referência (site ou PDF)', obrigatorio: false, varias: false },
    { campo: 'metadata', rotulo: 'Informações extras', obrigatorio: false, varias: true },
  ],
  clientes: [
    { campo: 'codigo_erp', rotulo: 'Código no seu sistema', obrigatorio: false, varias: false },
    { campo: 'cnpj', rotulo: 'CNPJ', obrigatorio: false, varias: false },
    { campo: 'nome', rotulo: 'Nome / Nome fantasia', obrigatorio: true, varias: true },
    { campo: 'razao_social', rotulo: 'Razão social', obrigatorio: false, varias: false },
    { campo: 'email', rotulo: 'E-mail', obrigatorio: false, varias: false },
    { campo: 'telefone', rotulo: 'Telefone', obrigatorio: false, varias: false },
    { campo: 'whatsapp', rotulo: 'WhatsApp', obrigatorio: false, varias: false },
    { campo: 'metadata', rotulo: 'Informações extras', obrigatorio: false, varias: true },
  ],
};

/* Cliente pode ser identificado por codigo do ERP OU por CNPJ - basta um
   dos dois. Produto tem chave unica. */
const CHAVES_POR_TIPO: Record<TipoPlanilha, { chaves: string[]; texto: string }> = {
  produtos: { chaves: ['codigo_sku'], texto: 'Código / SKU' },
  clientes: { chaves: ['codigo_erp', 'cnpj'], texto: 'Código no seu sistema ou CNPJ' },
};

const TEXTOS: Record<TipoPlanilha, { titulo: string; assunto: string; oQueSao: string }> = {
  produtos: {
    titulo: 'Fonte de Dados - Produtos',
    assunto: 'produtos',
    oQueSao: 'De onde o KOTTA IA busca os produtos que entram nas cotações.',
  },
  clientes: {
    titulo: 'Fonte de Dados - Clientes',
    assunto: 'clientes',
    oQueSao: 'De onde o KOTTA IA reconhece quem está pedindo a cotação.',
  },
};

export type TipoPlanilha = 'produtos' | 'clientes';

const FONTES = [
  {
    tipo: 'PLANILHA',
    rotulo: 'Planilha (CSV)',
    descricao: 'Você envia o arquivo do jeito que ele já está. O sistema lê as colunas e monta o de-para.',
    disponivel: true,
  },
  {
    tipo: 'API',
    rotulo: 'API',
    descricao: 'Buscamos os dados direto do seu sistema, sozinhos, de tempos em tempos.',
    disponivel: false,
  },
  {
    tipo: 'XML',
    rotulo: 'XML',
    descricao: 'Lemos um endereço que devolve seu cadastro em XML.',
    disponivel: false,
  },
  {
    tipo: 'HTML',
    rotulo: 'Site (HTML)',
    descricao: 'Extraímos os dados das páginas do seu site.',
    disponivel: false,
  },
] as const;

type Etapa = 'fonte' | 'arquivo' | 'depara' | 'resultado';
type Confianca = 'alta' | 'media' | 'baixa';

interface ItemMapeamento {
  coluna: string;
  campo: string | null;
  confianca: Confianca;
  motivo: string;
}

interface Resultado {
  criados: number;
  atualizados: number;
  desativados: number;
  lidas: number;
  validas: number;
  ignoradas: Array<{ linha: number; motivo: string }>;
  total_ignoradas: number;
  duplicadas: number;
  com_informacoes_extras: number;
  modo: string;
}

interface Props {
  tipo: TipoPlanilha;
  aberto: boolean;
  aoFechar: () => void;
  aoConcluir: () => void;
}

/* O selo carrega o sinal pelo icone e pela cor, nao so pela palavra.
   A aplicacao e de tema claro unico, entao cor semantica direta e
   segura aqui - o lima da marca e acento, nao estado. */
const SELO_CONFIANCA: Record<Confianca, { rotulo: string; classe: string; Icone: typeof CircleCheck }> = {
  alta: { rotulo: 'certo', classe: 'text-emerald-600', Icone: CircleCheck },
  media: { rotulo: 'provável', classe: 'text-muted-soft', Icone: CircleDashed },
  baixa: { rotulo: 'confira', classe: 'text-amber-600', Icone: CircleAlert },
};

const ImportarPlanilhaModal: React.FC<Props> = ({ tipo, aberto, aoFechar, aoConcluir }) => {
  const CAMPOS = CAMPOS_POR_TIPO[tipo];
  const ACEITA_VARIAS = new Set<string>(CAMPOS.filter((c) => c.varias).map((c) => c.campo));
  const textos = TEXTOS[tipo];
  const [etapa, setEtapa] = useState<Etapa>('fonte');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [planilha, setPlanilha] = useState<PlanilhaLida | null>(null);
  const [mapeamento, setMapeamento] = useState<ItemMapeamento[]>([]);
  const [formatoNumero, setFormatoNumero] = useState<'BR' | 'US'>('BR');
  const [avisos, setAvisos] = useState<string[]>([]);
  const [modo, setModo] = useState<'mesclar' | 'substituir'>('mesclar');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const reiniciar = useCallback(() => {
    setEtapa('fonte');
    setArquivo(null);
    setPlanilha(null);
    setMapeamento([]);
    setAvisos([]);
    setModo('mesclar');
    setErro('');
    setResultado(null);
    setFormatoNumero('BR');
  }, []);

  const fechar = useCallback(() => {
    reiniciar();
    aoFechar();
  }, [aoFechar, reiniciar]);

  const chamarApi = useCallback(async (corpo: Record<string, unknown>) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      throw new Error('Sua sessão expirou. Entre novamente para continuar.');
    }

    const resposta = await fetch('/api/import-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(corpo),
    });

    const json = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      throw new Error(json?.error || 'Não foi possível concluir a operação.');
    }

    return json;
  }, []);

  const processarArquivo = useCallback(
    async (file: File) => {
      setErro('');
      setCarregando(true);

      try {
        const conteudo = await file.text();
        const lida = lerCsv(conteudo);

        if (lida.colunas.length === 0) {
          throw new Error('Não consegui ler nenhuma coluna nesse arquivo. Ele está no formato CSV?');
        }

        if (lida.linhas.length === 0) {
          throw new Error('O arquivo tem cabeçalho, mas nenhuma linha de produto.');
        }

        setArquivo(file);
        setPlanilha(lida);

        // Só o cabeçalho e 5 linhas vão para a análise - o arquivo
        // inteiro nunca sai do navegador nessa etapa.
        const amostras = lida.linhas.slice(0, 5).map((l) => lida.colunas.map((c) => l[c] ?? ''));

        const analise = await chamarApi({ tipo, acao: 'analisar', colunas: lida.colunas, amostras });

        setMapeamento(analise.mapeamento ?? []);
        setFormatoNumero(analise.formato_numero === 'US' ? 'US' : 'BR');
        setAvisos(Array.isArray(analise.avisos) ? analise.avisos : []);
        setEtapa('depara');
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.');
      } finally {
        setCarregando(false);
      }
    },
    [chamarApi],
  );

  const trocarCampo = useCallback((coluna: string, campo: string) => {
    setMapeamento((atual) =>
      atual.map((item) => {
        if (item.coluna === coluna) {
          return { ...item, campo: campo || null, confianca: 'alta', motivo: 'Definido por você.' };
        }
        /* Campos como descrição e informações extras aceitam várias
           colunas somadas. Os demais (preço, estoque, SKU) só podem vir
           de uma - escolher outra coluna libera a anterior. */
        if (campo && item.campo === campo && !ACEITA_VARIAS.has(campo)) {
          return { ...item, campo: null, motivo: 'Substituído por outra coluna.' };
        }
        return item;
      }),
    );
  }, []);

  const camposFaltando = useMemo(() => {
    const usados = new Set(mapeamento.map((m) => m.campo).filter(Boolean));
    const pendentes = CAMPOS.filter((c) => c.obrigatorio && !usados.has(c.campo)).map((c) => c.rotulo);

    // cliente aceita codigo do ERP OU CNPJ: basta um dos dois
    const { chaves, texto } = CHAVES_POR_TIPO[tipo];
    if (!chaves.some((k) => usados.has(k))) pendentes.push(texto);

    return pendentes;
  }, [CAMPOS, mapeamento, tipo]);

  const importar = useCallback(async () => {
    if (!planilha || !arquivo) return;

    setErro('');
    setCarregando(true);

    try {
      const r = await chamarApi({
        tipo,
        acao: 'importar',
        mapeamento: mapeamento.map((m) => ({ coluna: m.coluna, campo: m.campo })),
        linhas: planilha.linhas,
        formato_numero: formatoNumero,
        modo,
        nome_arquivo: arquivo.name,
      });

      setResultado(r as Resultado);
      setEtapa('resultado');
      aoConcluir();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível importar.');
    } finally {
      setCarregando(false);
    }
  }, [aoConcluir, arquivo, chamarApi, formatoNumero, mapeamento, modo, planilha]);

  if (!aberto) return null;

  const amostraDe = (coluna: string) =>
    (planilha?.linhas ?? [])
      .slice(0, 3)
      .map((l) => l[coluna])
      .filter((v) => v && v.trim())
      .join(' · ') || '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
      <div className="absolute inset-0" aria-hidden="true" onClick={fechar} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="importar-produtos-titulo"
        className="relative z-10 flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-card border border-line-soft bg-card shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
      >
        {/* ------------------------------- topo ------------------------------ */}
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-6 py-5 max-lg:px-4 max-lg:py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-lime/20 text-ink">
              <Database size={18} />
            </div>
            <div>
              <h2 id="importar-produtos-titulo" className="text-base font-semibold tracking-tight text-ink">
                {textos.titulo}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                {etapa === 'fonte' && textos.oQueSao}
                {etapa === 'arquivo' && 'Envie a planilha do jeito que ela já está. O trabalho de encaixar as colunas é nosso.'}
                {etapa === 'depara' && 'Confira o que cada coluna do seu arquivo virou aqui dentro.'}
                {etapa === 'resultado' && 'Importação concluída.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="flex h-9 w-9 items-center justify-center rounded-tile text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {/* ------------------------------ miolo ------------------------------ */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 max-lg:px-4">
          {erro ? (
            <div className="mb-4 flex items-start gap-2 rounded-panel border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{erro}</span>
            </div>
          ) : null}

          {/* etapa 1: escolher a fonte */}
          {etapa === 'fonte' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {FONTES.map((fonte) => (
                <button
                  key={fonte.tipo}
                  type="button"
                  disabled={!fonte.disponivel}
                  onClick={() => setEtapa('arquivo')}
                  className={`rounded-panel border p-4 text-left transition-colors ${
                    fonte.disponivel
                      ? 'border-line bg-card hover:border-ink/25'
                      : 'cursor-not-allowed border-line-soft bg-paper opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet size={16} className="text-muted" />
                    <span className="text-sm font-semibold text-ink">{fonte.rotulo}</span>
                    {!fonte.disponivel ? (
                      <span className="rounded-pill bg-stone px-2 py-0.5 text-[10px] font-semibold text-muted">
                        com nosso time
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted">{fonte.descricao}</p>
                </button>
              ))}
            </div>
          ) : null}

          {/* etapa 2: enviar o arquivo */}
          {etapa === 'arquivo' ? (
            <div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setArrastando(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void processarArquivo(f);
                }}
                className={`rounded-panel border-2 border-dashed px-6 py-12 text-center transition-colors ${
                  arrastando ? 'border-ink/40 bg-paper' : 'border-line bg-paper/60'
                }`}
              >
                {carregando ? (
                  <div className="flex flex-col items-center gap-3 text-muted">
                    <Loader2 size={26} className="animate-spin" />
                    <p className="text-sm">Lendo a planilha e montando o de-para...</p>
                  </div>
                ) : (
                  <>
                    <Upload size={26} className="mx-auto text-muted-soft" />
                    <p className="mt-3 text-sm font-semibold text-ink">Arraste o arquivo aqui</p>
                    <p className="mt-1 text-xs text-muted">ou</p>
                    <button
                      type="button"
                      onClick={() => inputArquivo.current?.click()}
                      className="mt-3 inline-flex items-center gap-2 rounded-panel bg-lime px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
                    >
                      Escolher arquivo
                    </button>
                    <p className="mt-4 text-xs text-muted-soft">
                      CSV separado por vírgula, ponto e vírgula ou tabulação. Não precisa arrumar nada antes.
                    </p>
                  </>
                )}

                <input
                  ref={inputArquivo}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void processarArquivo(f);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          ) : null}

          {/* etapa 3: conferir o de-para */}
          {etapa === 'depara' && planilha ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-panel bg-paper px-4 py-3 text-xs text-muted">
                <span className="font-semibold text-ink">{arquivo?.name}</span>
                <span>{planilha.colunas.length} colunas</span>
                <span>{planilha.totalLinhas} linhas</span>
                <span>números no formato {formatoNumero === 'BR' ? '1.234,56' : '1,234.56'}</span>
              </div>

              {avisos.length > 0 ? (
                <div className="rounded-panel border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-semibold text-amber-900">Vale conferir</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-5 text-amber-800">
                    {avisos.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {camposFaltando.length > 0 ? (
                <div className="flex items-start gap-2 rounded-panel border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Falta indicar qual coluna corresponde a: <strong>{camposFaltando.join(', ')}</strong>. Sem isso
                    não dá para importar.
                  </span>
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-panel border border-line-soft">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="bg-paper text-muted-soft">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Coluna do seu arquivo</th>
                      <th className="px-3 py-2 font-semibold">Exemplos</th>
                      <th className="px-3 py-2 font-semibold">Vira, aqui dentro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapeamento.map((item) => (
                      <tr key={item.coluna} className="border-t border-line-soft">
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-ink">{item.coluna}</div>
                          {item.motivo ? <div className="mt-0.5 text-[11px] text-muted-soft">{item.motivo}</div> : null}
                        </td>
                        <td className="max-w-[220px] px-3 py-2.5 text-muted">
                          <div className="truncate" title={amostraDe(item.coluna)}>
                            {amostraDe(item.coluna)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <select
                              value={item.campo ?? ''}
                              onChange={(e) => trocarCampo(item.coluna, e.target.value)}
                              className="w-full rounded-tile border border-line bg-card px-2.5 py-1.5 text-xs text-ink"
                              style={{ fontFamily: 'inherit' }}
                            >
                              <option value="">— não importar —</option>
                              {CAMPOS.map((c) => {
                                const outras = mapeamento.filter(
                                  (m) => m.campo === c.campo && m.coluna !== item.coluna,
                                ).length;

                                return (
                                  <option key={c.campo} value={c.campo}>
                                    {c.rotulo}
                                    {c.obrigatorio ? ' *' : ''}
                                    {outras > 0 && c.varias ? ` (+${outras} já aqui)` : ''}
                                  </option>
                                );
                              })}
                            </select>
                            {item.campo ? (
                              (() => {
                                const selo = SELO_CONFIANCA[item.confianca];
                                return (
                                  <span
                                    className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold ${selo.classe}`}
                                    title={
                                      item.confianca === 'alta'
                                        ? 'O nome da coluna e o conteúdo dela concordam.'
                                        : item.confianca === 'media'
                                          ? 'Só um dos dois indica esse campo. Vale um olhar.'
                                          : 'Palpite fraco. Confira antes de importar.'
                                    }
                                  >
                                    <selo.Icone size={14} strokeWidth={2.4} />
                                    {selo.rotulo}
                                  </span>
                                );
                              })()
                            ) : (
                              /* Sobrar coluna e normal (fornecedor, codigo de
                                 barras). O sinal existe para o estado ficar
                                 visivel, mas neutro - alarme aqui seria falso. */
                              <span
                                className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-soft"
                                title="Esta coluna não será importada."
                              >
                                <CircleDashed size={14} strokeWidth={2} />
                                fora
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] leading-5 text-muted-soft">
                <strong className="text-muted">Nome</strong>, <strong className="text-muted">Descrição</strong>,{' '}
                <strong className="text-muted">Categoria</strong> e{' '}
                <strong className="text-muted">Informações extras</strong> aceitam mais de uma coluna: os valores são
                somados, e do segundo em diante cada um vai identificado pelo nome da sua coluna. Os demais campos
                aceitam uma coluna só.
                <br />
                <strong className="text-muted">Informações extras</strong> não é uma coluna da nossa tabela — cada
                coluna vira uma anotação guardada junto do produto, que o KOTTA IA enxerga ao montar a cotação, mas que
                não entra na busca.
              </p>

              <div className="rounded-panel border border-line-soft bg-paper p-4">
                <p className="text-xs font-semibold text-ink">E os produtos que já estão cadastrados?</p>
                <div className="mt-3 space-y-2">
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="radio"
                      name="modo-import"
                      checked={modo === 'mesclar'}
                      onChange={() => setModo('mesclar')}
                      className="mt-0.5"
                    />
                    <span className="text-xs leading-5 text-muted">
                      <strong className="text-ink">Somar à base atual.</strong> Cria o que é novo, atualiza o que
                      mudou e <strong>não mexe</strong> em quem ficou de fora da planilha.
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="radio"
                      name="modo-import"
                      checked={modo === 'substituir'}
                      onChange={() => setModo('substituir')}
                      className="mt-0.5"
                    />
                    <span className="text-xs leading-5 text-muted">
                      <strong className="text-ink">Substituir a base.</strong> Além de criar e atualizar,{' '}
                      <strong>desativa todo produto que não estiver nesta planilha</strong>. Use só quando o arquivo
                      for o catálogo completo.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          {/* etapa 4: resultado */}
          {etapa === 'resultado' && resultado ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 rounded-panel border border-lime bg-lime/15 px-4 py-3">
                <Check size={18} className="text-ink" />
                <span className="text-sm font-semibold text-ink">
                  {resultado.validas} produtos processados de {resultado.lidas} linhas.
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { rotulo: 'Criados', valor: resultado.criados },
                  { rotulo: 'Atualizados', valor: resultado.atualizados },
                  { rotulo: 'Desativados', valor: resultado.desativados },
                ].map((c) => (
                  <div key={c.rotulo} className="rounded-panel border border-line-soft bg-paper px-4 py-3">
                    <p className="text-[11px] font-medium text-muted-soft">{c.rotulo}</p>
                    <p className="mt-1 text-xl font-semibold text-ink">{c.valor}</p>
                  </div>
                ))}
              </div>

              {resultado.com_informacoes_extras > 0 ? (
                <p className="text-xs leading-5 text-muted">
                  {resultado.com_informacoes_extras} produto(s) receberam informações extras guardadas junto do
                  cadastro.
                </p>
              ) : null}

              {resultado.duplicadas > 0 ? (
                <p className="text-xs leading-5 text-muted">
                  {resultado.duplicadas} linha(s) repetiam um código já usado na própria planilha. Para cada código
                  repetido, valeu a última linha.
                </p>
              ) : null}

              {resultado.total_ignoradas > 0 ? (
                <div className="rounded-panel border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-semibold text-amber-900">
                    {resultado.total_ignoradas} linha(s) ficaram de fora
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-amber-800">
                    {resultado.ignoradas.map((i) => (
                      <li key={i.linha}>
                        Linha {i.linha}: {i.motivo}
                      </li>
                    ))}
                    {resultado.total_ignoradas > resultado.ignoradas.length ? (
                      <li>… e mais {resultado.total_ignoradas - resultado.ignoradas.length}.</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

              <p className="text-xs leading-5 text-muted-soft">
                A busca inteligente desses produtos é recalculada em seguida, automaticamente.
              </p>
            </div>
          ) : null}
        </div>

        {/* ------------------------------- rodape ---------------------------- */}
        <div className="flex items-center justify-between gap-3 border-t border-line-soft px-6 py-4 max-lg:px-4">
          <div>
            {etapa === 'arquivo' || etapa === 'depara' ? (
              <button
                type="button"
                onClick={() => setEtapa(etapa === 'depara' ? 'arquivo' : 'fonte')}
                disabled={carregando}
                className="inline-flex items-center gap-1.5 rounded-panel px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-ink disabled:opacity-50"
              >
                <ArrowLeft size={15} />
                Voltar
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {etapa === 'resultado' ? (
              <button
                type="button"
                onClick={fechar}
                className="rounded-panel bg-lime px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
              >
                Concluir
              </button>
            ) : (
              <button
                type="button"
                onClick={fechar}
                className="rounded-panel px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                Cancelar
              </button>
            )}

            {etapa === 'depara' ? (
              <button
                type="button"
                onClick={() => void importar()}
                disabled={carregando || camposFaltando.length > 0}
                className="inline-flex items-center gap-2 rounded-panel bg-lime px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {carregando ? <Loader2 size={15} className="animate-spin" /> : null}
                {modo === 'substituir' ? 'Substituir catálogo' : 'Importar produtos'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportarPlanilhaModal;
