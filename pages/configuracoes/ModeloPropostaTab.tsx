import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, ImagePlus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PERGUNTAS_PADRAO } from '../../lib/perguntasPadrao';
import {
  MODELO_PROPOSTA_PADRAO,
  TITULOS_CONDICOES,
  TITULOS_PROPOSTA,
  montarCondicoes,
  normalizarModelo,
  recalcularTotais,
  renderPropostaHtml,
  type DadosProposta,
  type EstadoColuna,
  type ItemProposta,
  type ModeloProposta,
} from '../../lib/modeloProposta';
import { formatarEndereco, modeloDaEmpresa, type EmpresaParaProposta } from '../../lib/propostaDados';

/* Aba "Modelo de proposta": o que a empresa personaliza no PDF do orcamento. A previa ao vivo usa
   exatamente o renderer que gera o PDF (lib/modeloProposta.ts), com dados de exemplo. */

const LARGURA_PAGINA_A4 = 794; // px a 96dpi
const ALTURA_PAGINA_A4 = 1123;

/* So na previa: o documento usa margens de impressao (@page), que o iframe ignora, e o conteudo
   ficava colado nas bordas. Aqui viram padding (14mm) e o rodape acompanha. Nao entra no PDF. */
const ESTILO_PREVIA =
  '<style>html{background:#fff}body{padding:14mm 14mm 24mm}.rodape{left:14mm!important;right:14mm!important;bottom:10mm!important}</style>';
const LIMITE_LOGO_BYTES = 2 * 1024 * 1024;
const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp'];

const CHAVES_INTERNAS_METADATA = new Set(['ncm', 'idaux', 'metadata']);

const COLUNAS: Array<{
  key: keyof ModeloProposta['colunas'];
  titulo: string;
  ajuda: string;
  /** Sem "Sempre": nao ha o que forcar quando o produto nao tem o dado (ex.: unidade). */
  soMostrarOuOcultar?: boolean;
}> = [
  { key: 'previsao', titulo: 'Previsão de entrega', ajuda: 'Coluna própria na tabela.' },
  {
    key: 'unidade',
    titulo: 'Unidade',
    ajuda: 'Aparece junto da quantidade (ex.: 30 PC), nos produtos que têm unidade.',
    soMostrarOuOcultar: true,
  },
  { key: 'sku', titulo: 'SKU', ajuda: 'Na linha de detalhes do item.' },
  { key: 'ncm', titulo: 'NCM', ajuda: 'Na linha de detalhes do item.' },
  { key: 'solicitado', titulo: '"Pedido como"', ajuda: 'As palavras do próprio cliente, embaixo do item.' },
];

const ESTADOS: Array<{ valor: EstadoColuna; rotulo: string }> = [
  { valor: 'auto', rotulo: 'Automático' },
  { valor: 'sempre', rotulo: 'Sempre' },
  { valor: 'nunca', rotulo: 'Nunca' },
];

interface Carregado {
  empresaId: string;
  empresa: EmpresaParaProposta;
  respostas: { codigo_padrao: string | null; resposta: string | null }[];
  chaves: Array<{ chave: string; exemplo: string }>;
}

/** O que vai para `sales_empresas_v2.modelo_proposta` (a logo mora em `logo_url`). */
const paraGravar = (modelo: ModeloProposta) => {
  const { logoUrl: _logoUrl, ...resto } = modelo;
  return resto;
};

/** Frase curta sobre o que o estado escolhido faz, mostrada embaixo de cada linha. */
const explicarEstado = (valor: EstadoColuna, soMostrarOuOcultar?: boolean) => {
  if (soMostrarOuOcultar) {
    return valor === 'nunca' ? 'Não aparece no PDF.' : 'Aparece nos itens que têm esse dado.';
  }
  if (valor === 'sempre') return 'Aparece em todos os itens; onde faltar o dado, sai um traço (—).';
  if (valor === 'nunca') return 'Não aparece no PDF, mesmo que o produto tenha o dado.';
  return 'Aparece só se pelo menos um item da proposta tiver esse dado.';
};

const ESTADOS_MOSTRAR_OCULTAR: Array<{ valor: EstadoColuna; rotulo: string }> = [
  { valor: 'auto', rotulo: 'Mostrar' },
  { valor: 'nunca', rotulo: 'Ocultar' },
];

const Segmentado: React.FC<{
  valor: EstadoColuna;
  onChange: (valor: EstadoColuna) => void;
  rotulo: string;
  soMostrarOuOcultar?: boolean;
}> = ({ valor, onChange, rotulo, soMostrarOuOcultar }) => (
  <div role="radiogroup" aria-label={rotulo} className="inline-flex shrink-0 rounded-pill bg-stone p-0.5">
    {(soMostrarOuOcultar ? ESTADOS_MOSTRAR_OCULTAR : ESTADOS).map((estado) => (
      <button
        key={estado.valor}
        type="button"
        role="radio"
        // Um "sempre" antigo gravado antes desta mudanca aparece como "Mostrar" (o renderer trata igual).
        aria-checked={(soMostrarOuOcultar && valor === 'sempre' ? 'auto' : valor) === estado.valor}
        onClick={() => onChange(estado.valor)}
        className={`rounded-pill px-3 py-1 text-[11.5px] transition-colors ${
          (soMostrarOuOcultar && valor === 'sempre' ? 'auto' : valor) === estado.valor
            ? 'bg-lime text-ink'
            : 'text-muted hover:text-ink'
        }`}
        style={{ fontWeight: 700 }}
      >
        {estado.rotulo}
      </button>
    ))}
  </div>
);

const Interruptor: React.FC<{ ligado: boolean; onChange: (ligado: boolean) => void; rotulo: string }> = ({
  ligado,
  onChange,
  rotulo,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={ligado}
    aria-label={rotulo}
    onClick={() => onChange(!ligado)}
    className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-pill transition-colors ${
      ligado ? 'bg-lime' : 'bg-stone'
    }`}
  >
    <span
      className={`inline-block h-5 w-5 transform rounded-pill bg-card shadow-sm transition-transform ${
        ligado ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

/** Texto do codigo da cor: aceita digitar livremente e so aplica quando for uma cor completa (#rrggbb). */
const CampoCor: React.FC<{ valor: string; onValida: (cor: string) => void; className: string }> = ({
  valor,
  onValida,
  className,
}) => {
  const [texto, setTexto] = useState(valor);

  // Acompanha mudancas de fora (seletor de cor, restaurar padrao).
  useEffect(() => setTexto(valor), [valor]);

  return (
    <input
      type="text"
      aria-label="Código da cor"
      value={texto}
      maxLength={7}
      spellCheck={false}
      onChange={(event) => {
        setTexto(event.target.value);
        const digitado = event.target.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(digitado)) onValida(digitado.toLowerCase());
      }}
      // Saiu do campo com algo incompleto: volta para a cor que esta valendo.
      onBlur={() => setTexto(valor)}
      className={className}
    />
  );
};

const Secao: React.FC<{ titulo: string; descricao?: string; children: React.ReactNode }> = ({
  titulo,
  descricao,
  children,
}) => (
  <section className="rounded-panel border border-line-soft bg-paper p-4 max-lg:p-3.5">
    <h3 className="text-[14px] text-ink" style={{ fontWeight: 800 }}>
      {titulo}
    </h3>
    {descricao ? <p className="mt-1 text-[12.5px] leading-5 text-muted">{descricao}</p> : null}
    <div className="mt-3.5 space-y-3">{children}</div>
  </section>
);

const montarDadosExemplo = (
  carregado: Carregado,
  modelo: ModeloProposta,
  emitidaEm: string,
): DadosProposta => {
  const extrasA: Record<string, string> = {};
  carregado.chaves.forEach(({ chave, exemplo }) => {
    extrasA[chave] = exemplo;
  });

  const itens: ItemProposta[] = [
    {
      nome: 'Produto de exemplo A',
      descricao: 'Descrição do produto, como está no seu catálogo',
      sku: 'EX-001',
      ncm: '0000.00.00',
      unidade: 'UN',
      quantidade: 2,
      previsaoEntrega: '7 dias úteis',
      precoUnitario: 1250,
      extras: Object.keys(extrasA).length ? extrasA : undefined,
      pedidoComo: 'quero dois do produto A',
    },
    {
      nome: 'Produto de exemplo B',
      descricao: 'Outro item, sem NCM nem previsão',
      sku: 'EX-002',
      unidade: 'CX',
      quantidade: 10,
      precoUnitario: 89.9,
    },
    { nome: 'Produto de exemplo C', quantidade: 1, precoUnitario: null, pedidoComo: 'item ainda sem preço' },
  ];

  const endereco = carregado.empresa.endereco_faturamento;

  return {
    orcamentoId: '00000000-0000-0000-0000-000000000000',
    numero: '1234',
    emitidaEm,
    emitente: {
      nome: carregado.empresa.razao_social || 'Nome da sua empresa',
      cnpj: carregado.empresa.cnpj || undefined,
      email: carregado.empresa.email_responsavel || undefined,
      telefone: carregado.empresa.telefone_responsavel || undefined,
      endereco: formatarEndereco(endereco),
    },
    cliente: {
      razaoSocial: 'Cliente Exemplo Ltda',
      documento: '00.000.000/0001-00',
      contato: 'Maria Souza',
      telefone: '(XX) XXXXX-XXXX',
      email: 'compras@clienteexemplo.com.br',
    },
    atendimento: { vendedor: 'Nome do vendedor', origem: 'WHATSAPP' },
    itens,
    totais: recalcularTotais(itens, { desconto: 100, frete: 'Incluso' }),
    condicoes: montarCondicoes(modelo.condicoesCodigos, carregado.respostas),
  };
};

const ModeloPropostaTab: React.FC = () => {
  const [carregado, setCarregado] = useState<Carregado | null>(null);
  const [salvo, setSalvo] = useState<ModeloProposta>(MODELO_PROPOSTA_PADRAO);
  const [rascunho, setRascunho] = useState<ModeloProposta>(MODELO_PROPOSTA_PADRAO);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [emitidaEm] = useState(() => new Date().toISOString());
  const [escala, setEscala] = useState(0.7);
  const previaRef = useRef<HTMLDivElement | null>(null);
  const inputLogoRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    const carregar = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session?.user?.id) throw new Error('Não foi possível identificar o usuário autenticado.');

        const { data: membro, error: membroError } = await supabase
          .from('sales_membros_v2')
          .select('empresa_id')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (membroError) throw membroError;
        if (!membro?.empresa_id) throw new Error('Não foi possível identificar a empresa vinculada ao usuário.');

        const empresaId = membro.empresa_id as string;

        const [empresaRes, respostasRes, produtosRes] = await Promise.all([
          supabase
            .from('sales_empresas_v2')
            .select(
              'razao_social, cnpj, logo_url, email_responsavel, telefone_responsavel, endereco_faturamento, modelo_proposta, texto_rodape_pdf',
            )
            .eq('empresa_id', empresaId)
            .maybeSingle(),
          supabase
            .from('sales_base_conhecimento_v2')
            .select('codigo_padrao, resposta')
            .eq('empresa_id', empresaId)
            .eq('ativo', true)
            .not('codigo_padrao', 'is', null),
          // As chaves de metadata variam por empresa: lidas de uma amostra do catalogo.
          supabase
            .from('sales_produtos_v2')
            .select('metadata')
            .eq('empresa_id', empresaId)
            .not('metadata', 'is', null)
            .limit(1000),
        ]);

        if (empresaRes.error) throw empresaRes.error;
        if (respostasRes.error) throw respostasRes.error;
        if (produtosRes.error) throw produtosRes.error;
        if (!empresaRes.data) throw new Error('Empresa não encontrada.');

        const exemplos = new Map<string, string>();
        for (const linha of produtosRes.data || []) {
          const metadata = (linha as { metadata: unknown }).metadata;
          if (typeof metadata !== 'object' || metadata === null) continue;
          for (const [chave, valor] of Object.entries(metadata as Record<string, unknown>)) {
            if (CHAVES_INTERNAS_METADATA.has(chave) || exemplos.has(chave)) continue;
            if (typeof valor === 'string' || typeof valor === 'number') {
              const texto = String(valor).trim();
              if (texto) exemplos.set(chave, texto);
            }
          }
        }

        if (!isMounted) return;

        const empresa = empresaRes.data as EmpresaParaProposta;
        const modelo = modeloDaEmpresa(empresa);

        setCarregado({
          empresaId,
          empresa,
          respostas: (respostasRes.data || []) as Carregado['respostas'],
          chaves: [...exemplos.entries()]
            .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
            .map(([chave, exemplo]) => ({ chave, exemplo })),
        });
        setSalvo(modelo);
        setRascunho(modelo);
      } catch (error: any) {
        console.error('Erro ao carregar o modelo de proposta:', error);
        if (isMounted) setLoadError(error?.message || 'Não foi possível carregar o modelo de proposta.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    carregar();

    return () => {
      isMounted = false;
    };
  }, []);

  // A pagina A4 tem largura fixa; a previa e escalada para caber na coluna.
  useEffect(() => {
    const el = previaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(([entrada]) => {
      const largura = entrada.contentRect.width;
      if (largura > 0) setEscala(Math.min(1, largura / LARGURA_PAGINA_A4));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isLoading, loadError]);

  const alterado = useMemo(
    () => JSON.stringify(paraGravar(rascunho)) !== JSON.stringify(paraGravar(salvo)) || rascunho.logoUrl !== salvo.logoUrl,
    [rascunho, salvo],
  );

  const previaHtml = useMemo(() => {
    if (!carregado) return '';
    const html = renderPropostaHtml(montarDadosExemplo(carregado, rascunho, emitidaEm), rascunho);
    return html.includes('</head>') ? html.replace('</head>', `${ESTILO_PREVIA}</head>`) : html + ESTILO_PREVIA;
  }, [carregado, rascunho, emitidaEm]);

  // Sempre em cima do estado mais recente (funcao), nunca do `rascunho` do render anterior: dois
  // cliques seguidos antes de re-renderizar nao podem apagar um ao outro.
  const atualizar = (parcial: Partial<ModeloProposta> | ((atual: ModeloProposta) => Partial<ModeloProposta>)) => {
    setRascunho((atual) => ({ ...atual, ...(typeof parcial === 'function' ? parcial(atual) : parcial) }));
    setSaveError(null);
    setSaveSuccess(null);
  };

  const atualizarColuna = (chave: keyof ModeloProposta['colunas'], valor: EstadoColuna) =>
    atualizar((atual) => ({ colunas: { ...atual.colunas, [chave]: valor } }));

  const atualizarMetadata = (chave: string, valor: EstadoColuna) =>
    atualizar((atual) => {
      const proximo = { ...atual.metadata };
      // Chave ausente = escondida; nao vale guardar "nunca" no jsonb.
      if (valor === 'nunca') delete proximo[chave];
      else proximo[chave] = valor;
      return { metadata: proximo };
    });

  const alternarCondicao = (codigo: string, marcada: boolean) =>
    atualizar((atual) => {
      const selecionadas = new Set(atual.condicoesCodigos);
      if (marcada) selecionadas.add(codigo);
      else selecionadas.delete(codigo);
      // Sempre na ordem da lista de perguntas, para o PDF ficar previsivel.
      return { condicoesCodigos: PERGUNTAS_PADRAO.map((p) => p.codigo).filter((c) => selecionadas.has(c)) };
    });

  const enviarLogo = async (arquivo: File | undefined) => {
    if (!arquivo || !carregado) return;

    setLogoError(null);

    if (!TIPOS_LOGO.includes(arquivo.type)) {
      setLogoError('Use uma imagem PNG, JPG ou WebP.');
      return;
    }

    if (arquivo.size > LIMITE_LOGO_BYTES) {
      setLogoError('A imagem passa de 2 MB. Reduza o tamanho e tente de novo.');
      return;
    }

    setIsUploadingLogo(true);

    try {
      const extensao = arquivo.type === 'image/png' ? 'png' : arquivo.type === 'image/webp' ? 'webp' : 'jpg';
      // Nome novo a cada envio: nunca sobrescreve a logo em uso, e o navegador nao serve versao antiga do cache.
      const caminho = `${carregado.empresaId}/logo-${Date.now()}.${extensao}`;

      const { error } = await supabase.storage
        .from('logos_clientes')
        .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
      if (error) throw error;

      const { data } = supabase.storage.from('logos_clientes').getPublicUrl(caminho);
      atualizar({ logoUrl: normalizarModelo({ logoUrl: data.publicUrl }).logoUrl });
    } catch (error: any) {
      console.error('Erro ao enviar a logo:', error);
      setLogoError(error?.message || 'Não foi possível enviar a logo.');
    } finally {
      setIsUploadingLogo(false);
      if (inputLogoRef.current) inputLogoRef.current.value = '';
    }
  };

  const salvar = async () => {
    if (!carregado) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const alteracoes: Record<string, unknown> = { modelo_proposta: paraGravar(normalizarModelo(rascunho)) };
      // So mexe em logo_url se a logo mudou (um valor antigo fora do padrao nao pode ser apagado sem querer).
      if (rascunho.logoUrl !== salvo.logoUrl) alteracoes.logo_url = rascunho.logoUrl;

      const { error } = await supabase
        .from('sales_empresas_v2')
        .update(alteracoes)
        .eq('empresa_id', carregado.empresaId);
      if (error) throw error;

      setSalvo(rascunho);
      setSaveSuccess('Modelo de proposta salvo. As próximas propostas já saem com ele.');
    } catch (error: any) {
      console.error('Erro ao salvar o modelo de proposta:', error);
      setSaveError(error?.message || 'Não foi possível salvar o modelo de proposta.');
    } finally {
      setIsSaving(false);
    }
  };

  const restaurarPadrao = () => {
    setRascunho((atual) => ({ ...MODELO_PROPOSTA_PADRAO, logoUrl: atual.logoUrl, observacoes: atual.observacoes }));
    setSaveError(null);
    setSaveSuccess(null);
  };

  const campoBase =
    'w-full rounded-[9px] border border-line bg-card px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-ink';

  return (
    <div className="space-y-5">
      <section className="rounded-panel border border-line-soft bg-paper p-5 max-lg:p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-panel bg-lime text-ink">
              <FileText className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-ink">Modelo de Proposta</h2>
              <p className="max-w-2xl text-sm leading-6 text-muted">
                Personalize o PDF que o seu cliente recebe: logo, cor, título, colunas, condições comerciais e
                observações. A prévia ao lado usa dados de exemplo e mostra exatamente o layout final.
              </p>
            </div>
          </div>

          {!isLoading && !loadError ? (
            <div className="flex shrink-0 items-center gap-2.5 self-start">
              <button
                type="button"
                onClick={restaurarPadrao}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-panel border border-line bg-card px-3 py-2 text-xs font-semibold text-muted transition-colors hover:text-ink disabled:opacity-60"
              >
                <RotateCcw size={13} />
                Restaurar padrão
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={isSaving || !alterado}
                className="inline-flex items-center gap-2 rounded-panel bg-lime px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save size={16} />
                {isSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {loadError ? (
        <div className="rounded-panel border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {loadError}
        </div>
      ) : null}
      {saveError ? (
        <div className="rounded-panel border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {saveError}
        </div>
      ) : null}
      {saveSuccess ? (
        <div className="rounded-panel border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {saveSuccess}
        </div>
      ) : null}

      {isLoading ? (
        <div className="px-1 py-10 text-sm text-muted">Carregando modelo de proposta...</div>
      ) : carregado ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Secao titulo="Identidade visual">
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-soft" style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                  Logo
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-line bg-card">
                    {rascunho.logoUrl ? (
                      <img src={rascunho.logoUrl} alt="Logo da empresa" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-[11px] text-muted-soft">Sem logo</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={inputLogoRef}
                      type="file"
                      accept={TIPOS_LOGO.join(',')}
                      className="hidden"
                      aria-label="Enviar logo"
                      onChange={(event) => enviarLogo(event.target.files?.[0])}
                    />
                    <button
                      type="button"
                      onClick={() => inputLogoRef.current?.click()}
                      disabled={isUploadingLogo}
                      className="inline-flex items-center gap-1.5 rounded-panel border border-line bg-card px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-ink/25 disabled:opacity-60"
                    >
                      <ImagePlus size={14} />
                      {isUploadingLogo ? 'Enviando...' : rascunho.logoUrl ? 'Trocar' : 'Enviar logo'}
                    </button>
                    {rascunho.logoUrl ? (
                      <button
                        type="button"
                        onClick={() => atualizar({ logoUrl: null })}
                        className="inline-flex items-center gap-1.5 rounded-panel px-2 py-2 text-xs font-semibold text-muted transition-colors hover:text-red-600"
                      >
                        <Trash2 size={13} />
                        Remover
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="text-[11.5px] text-muted">PNG, JPG ou WebP, até 2 MB. Sem logo, o espaço não aparece no PDF.</p>
                {logoError ? <p className="text-[12px] text-red-600" style={{ fontWeight: 600 }}>{logoError}</p> : null}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-[11px] text-muted-soft" style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                    Cor de destaque
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Escolher cor de destaque"
                      value={rascunho.corDestaque}
                      onChange={(event) => atualizar({ corDestaque: event.target.value })}
                      className="h-9 w-11 shrink-0 cursor-pointer rounded-[9px] border border-line bg-card p-1"
                    />
                    <CampoCor
                      valor={rascunho.corDestaque}
                      onValida={(cor) => atualizar({ corDestaque: cor })}
                      className={campoBase}
                    />
                  </div>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[11px] text-muted-soft" style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                    Título do documento
                  </span>
                  <select
                    value={rascunho.titulo}
                    onChange={(event) => atualizar({ titulo: event.target.value })}
                    className={campoBase}
                  >
                    {TITULOS_PROPOSTA.map((titulo) => (
                      <option key={titulo} value={titulo}>
                        {titulo}
                      </option>
                    ))}
                  </select>
                  <span className="block text-[11.5px] text-muted">
                    É o nome do documento, em letras grandes no canto superior direito do PDF, acima do número
                    (ex.: "PROPOSTA COMERCIAL Nº 146"). Muda só o nome; o conteúdo é o mesmo.
                  </span>
                </label>
              </div>
            </Secao>

            <Secao titulo="Documento">
              <label className="block space-y-1.5">
                <span className="text-[11px] text-muted-soft" style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                  Validade da proposta (dias)
                </span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={rascunho.validadeDias}
                  onChange={(event) => {
                    const numero = Number(event.target.value);
                    atualizar({ validadeDias: Number.isFinite(numero) ? Math.min(365, Math.max(0, Math.round(numero))) : 0 });
                  }}
                  className={`${campoBase} sm:max-w-[140px]`}
                />
                <span className="block text-[11.5px] text-muted">
                  Vira a data "Válida até ..." no topo. Com 0, o selo não aparece.
                </span>
              </label>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[13px] text-ink" style={{ fontWeight: 700 }}>Mostrar o vendedor</p>
                  <p className="text-[11.5px] text-muted">Linha do responsável na caixa "Atendimento".</p>
                </div>
                <Interruptor ligado={rascunho.mostrarVendedor} onChange={(v) => atualizar({ mostrarVendedor: v })} rotulo="Mostrar o vendedor" />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[13px] text-ink" style={{ fontWeight: 700 }}>Rodapé "gerado por Kotta"</p>
                  <p className="text-[11.5px] text-muted">Link discreto no rodapé de cada página.</p>
                </div>
                <Interruptor ligado={rascunho.rodapeKotta} onChange={(v) => atualizar({ rodapeKotta: v })} rotulo='Rodapé "gerado por Kotta"' />
              </div>
            </Secao>

            <Secao
              titulo="Colunas da tabela"
              descricao="Escolha o que aparece na tabela de itens. Cada informação tem três opções:"
            >
              <ul className="space-y-1 rounded-[9px] bg-stone/60 px-3 py-2.5 text-[12px] leading-5 text-muted">
                <li>
                  <b className="text-ink">Automático</b> (recomendado): mostra só quando algum item da proposta tem o
                  dado. Se nenhum tiver, a coluna some sozinha.
                </li>
                <li>
                  <b className="text-ink">Sempre</b>: mostra em todas as propostas; onde o item não tem o dado, sai um
                  traço (—).
                </li>
                <li>
                  <b className="text-ink">Nunca</b>: não mostra, mesmo que os produtos tenham o dado.
                </li>
              </ul>
              {COLUNAS.map((coluna) => (
                <div key={coluna.key} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] text-ink" style={{ fontWeight: 700 }}>{coluna.titulo}</p>
                    <p className="text-[11.5px] text-muted">{coluna.ajuda}</p>
                    <p className="text-[11.5px] text-muted-soft">
                      {explicarEstado(rascunho.colunas[coluna.key], coluna.soMostrarOuOcultar)}
                    </p>
                  </div>
                  <Segmentado
                    rotulo={coluna.titulo}
                    valor={rascunho.colunas[coluna.key]}
                    soMostrarOuOcultar={coluna.soMostrarOuOcultar}
                    onChange={(valor) => atualizarColuna(coluna.key, valor)}
                  />
                </div>
              ))}

              <div className="border-t border-line-soft pt-3">
                <p className="text-[13px] text-ink" style={{ fontWeight: 700 }}>Campos do seu catálogo</p>
                {carregado.chaves.length === 0 ? (
                  <p className="mt-1 text-[11.5px] text-muted">
                    Seu catálogo não tem campos extras (como acabamento ou cor) para mostrar.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2.5">
                    {carregado.chaves.map(({ chave }) => (
                      <div key={chave} className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] text-ink" style={{ fontWeight: 600 }}>{chave}</p>
                          <p className="text-[11.5px] text-muted-soft">
                            {explicarEstado(rascunho.metadata[chave] ?? 'nunca')}
                          </p>
                        </div>
                        <Segmentado
                          rotulo={chave}
                          valor={rascunho.metadata[chave] ?? 'nunca'}
                          onChange={(valor) => atualizarMetadata(chave, valor)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Secao>

            <Secao
              titulo="Condições comerciais"
              descricao="O texto de cada condição é a resposta que você já deu na Base de Conhecimento. Marque as que devem aparecer no PDF."
            >
              {PERGUNTAS_PADRAO.filter((pergunta) => TITULOS_CONDICOES[pergunta.codigo]).map((pergunta) => {
                const resposta = carregado.respostas.find((r) => r.codigo_padrao === pergunta.codigo)?.resposta?.trim();
                const marcada = rascunho.condicoesCodigos.includes(pergunta.codigo);

                return (
                  <label
                    key={pergunta.codigo}
                    className={`flex items-start gap-2.5 ${resposta ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                  >
                    <input
                      type="checkbox"
                      checked={marcada && Boolean(resposta)}
                      disabled={!resposta}
                      onChange={(event) => alternarCondicao(pergunta.codigo, event.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 accent-[#1e293b]"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] text-ink" style={{ fontWeight: 700 }}>
                        {TITULOS_CONDICOES[pergunta.codigo]}
                      </span>
                      <span className="line-clamp-2 block text-[11.5px] leading-5 text-muted">
                        {resposta || 'Ainda não respondida na Base de Conhecimento.'}
                      </span>
                    </span>
                  </label>
                );
              })}
            </Secao>

            <Secao
              titulo="Observações"
              descricao="Texto livre no fim do documento (ex.: prazos, sujeição a estoque). Vale para todas as propostas."
            >
              <textarea
                value={rascunho.observacoes}
                onChange={(event) => atualizar({ observacoes: event.target.value })}
                rows={4}
                maxLength={1500}
                placeholder="Ex.: Valores sujeitos a confirmação de estoque no faturamento."
                className={`${campoBase} resize-y`}
              />
            </Secao>
          </div>

          <div className="min-w-0 xl:sticky xl:top-2 xl:self-start">
            <div className="rounded-panel border border-line-soft bg-stone p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[11px] text-muted-soft" style={{ fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                  Prévia (dados de exemplo)
                </p>
                {alterado ? (
                  <span className="rounded-pill bg-card px-2.5 py-0.5 text-[11px] text-muted" style={{ fontWeight: 700 }}>
                    Alterações não salvas
                  </span>
                ) : null}
              </div>
              <div ref={previaRef} className="w-full overflow-hidden">
                <div style={{ height: ALTURA_PAGINA_A4 * escala }}>
                  <iframe
                    title="Prévia da proposta"
                    srcDoc={previaHtml}
                    referrerPolicy="no-referrer"
                    sandbox="allow-same-origin"
                    className="border border-line bg-white"
                    style={{
                      width: LARGURA_PAGINA_A4,
                      height: ALTURA_PAGINA_A4,
                      transform: `scale(${escala})`,
                      transformOrigin: 'top left',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ModeloPropostaTab;
