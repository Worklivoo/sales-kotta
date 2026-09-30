import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Package, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  gerarProposta,
  recalcularTotais,
  type DadosProposta,
  type ItemProposta,
} from '../lib/modeloProposta';
import {
  carregarProposta,
  type ContextoProposta,
  type EmpresaParaProposta,
  type OrcamentoParaProposta,
  type PropostaCarregada,
} from '../lib/propostaDados';

/* O editor trabalha em cima dos DADOS da proposta (lib/modeloProposta.ts: DadosProposta), nunca
   do HTML. A previa e o que vai para o banco saem do mesmo renderer que o servidor usa para o
   PDF: renderPropostaHtml(dados, modelo). Nenhum acesso a celula de tabela por indice. */

interface OrcamentoEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  assunto: string | null;
  empresaId: string | null;
  orcamento: OrcamentoParaProposta | null;
  empresa: EmpresaParaProposta | null;
  numeroTicket: number | null;
  origem: 'EMAIL' | 'WHATSAPP' | null;
  vendedor: string | null;
  cliente: ContextoProposta['cliente'];
  atendimentoId: string | null;
  membroId: string | null;
  onSaved: (html: string, dados: DadosProposta, valorTotal: number) => void;
}

interface EditorField {
  id: string;
  key: string;
  label: string;
  value: string;
  isCustom?: boolean;
}

interface OrcamentoItemRow {
  id: string;
  produtoId: string | null;
  isManuallyAdded: boolean;
  nome: string;
  quantidade: string;
  unidade: string;
  sku: string;
  descricao: string;
  ncm: string;
  previsaoEntrega: string;
  /** Vazio = "Sob consulta". */
  valorUnitario: string;
  // Nao aparecem no formulario, mas seguem para a proposta.
  moeda: string;
  extras?: Record<string, string>;
  pedidoComo?: string;
}

type EditableItemField =
  | 'nome'
  | 'quantidade'
  | 'unidade'
  | 'sku'
  | 'descricao'
  | 'ncm'
  | 'previsaoEntrega'
  | 'valorUnitario';

interface ProdutoOption {
  produto_id: string;
  codigo_sku: string | null;
  nome: string;
  descricao: string | null;
  preco_venda: number | null;
  unidade_medida: string | null;
  metadata: Record<string, unknown> | null;
}

const CLIENT_FIELD_ORDER = ['razao_social', 'cnpj_cpf', 'contato', 'telefone', 'email'] as const;

const CLIENT_FIELD_LABELS: Record<(typeof CLIENT_FIELD_ORDER)[number], string> = {
  razao_social: 'Razão Social',
  cnpj_cpf: 'CNPJ/CPF',
  contato: 'Contato',
  telefone: 'Telefone',
  email: 'Email',
};

const ITEM_FIELD_LABELS: Record<Exclude<EditableItemField, 'nome'>, string> = {
  quantidade: 'Quantidade',
  unidade: 'Unidade',
  sku: 'SKU',
  descricao: 'Descrição',
  ncm: 'NCM',
  previsaoEntrega: 'Previsão de Entrega',
  valorUnitario: 'Valor Unitário',
};

const APROVACAO_WEBHOOK_URL =
  'https://primary-production-b86f1.up.railway.app/webhook/aprovar-orcamento-v2';

// A automacao de aprovacao pode levar bem mais que alguns segundos para concluir
// (PDF, e-mail, atualizacao de status). Recarregar a pagina antes disso faz o
// botao de aprovar reaparecer clicavel, permitindo aprovacao em duplicidade.
// Por isso aguardamos a confirmacao real do status no banco antes de recarregar.
const waitForAtendimentoStatusChange = async (
  atendimentoId: string,
  fromStatus: string,
  { intervalMs = 1500, timeoutMs = 90000 }: { intervalMs?: number; timeoutMs?: number } = {},
) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data } = await supabase
      .from('sales_atendimentos_v2')
      .select('status')
      .eq('atendimento_id', atendimentoId)
      .maybeSingle();

    if (data && data.status !== fromStatus) {
      return true;
    }

    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }

  return false;
};

const buildFieldId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

/* ---------------------------------------------------------------- numeros */

/** Le "34.900,00", "34900,5", "R$ 6,90" ou "1500". Vazio ou invalido = null. */
const lerNumeroBR = (value: string): number | null => {
  const limpo = value.replace(/[^\d,.-]/g, '').trim();

  if (!limpo) {
    return null;
  }

  // "34.900" (so ponto, grupos de 3) e milhar em pt-BR, nao decimal.
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(limpo)
      ? limpo.replace(/\./g, '')
      : limpo;
  const numero = Number(normalizado);

  return Number.isFinite(numero) ? numero : null;
};

const formatarPreco = (valor: number) =>
  valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatarQuantidade = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

const formatProdutoPreco = (produto: ProdutoOption) => {
  if (produto.preco_venda == null) {
    return null;
  }

  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    produto.preco_venda,
  );
};

/* ------------------------------------------- dados <-> estado do formulario */

const buildDefaultItemRow = (): OrcamentoItemRow => ({
  id: buildFieldId('item'),
  produtoId: null,
  isManuallyAdded: true,
  nome: '',
  quantidade: '1',
  unidade: '',
  sku: '',
  descricao: '',
  ncm: '',
  previsaoEntrega: '',
  valorUnitario: '',
  moeda: 'BRL',
});

const clientFieldsFromDados = (dados: DadosProposta): EditorField[] => {
  const cliente = dados.cliente || {};
  const valores: Record<(typeof CLIENT_FIELD_ORDER)[number], string> = {
    razao_social: cliente.razaoSocial || '',
    cnpj_cpf: cliente.documento || '',
    contato: cliente.contato || '',
    telefone: cliente.telefone || '',
    email: cliente.email || '',
  };

  return [
    ...CLIENT_FIELD_ORDER.map((key) => ({
      id: buildFieldId(key),
      key,
      label: CLIENT_FIELD_LABELS[key],
      value: valores[key],
    })),
    ...(cliente.extras || []).map((extra, index) => ({
      id: buildFieldId('custom-client'),
      key: `custom_${index + 1}`,
      label: extra.rotulo,
      value: extra.valor,
      isCustom: true,
    })),
  ];
};

const itemRowsFromDados = (dados: DadosProposta): OrcamentoItemRow[] =>
  dados.itens.map((item, index) => ({
    id: buildFieldId(`item-row-${index}`),
    produtoId: null,
    isManuallyAdded: false,
    nome: item.nome,
    quantidade: formatarQuantidade(item.quantidade),
    unidade: item.unidade || '',
    sku: item.sku || '',
    descricao: item.descricao || '',
    ncm: item.ncm || '',
    previsaoEntrega: item.previsaoEntrega || '',
    valorUnitario: typeof item.precoUnitario === 'number' ? formatarPreco(item.precoUnitario) : '',
    moeda: item.moeda || 'BRL',
    extras: item.extras,
    pedidoComo: item.pedidoComo,
  }));

const itemFromRow = (row: OrcamentoItemRow): ItemProposta => ({
  nome: row.nome.trim(),
  descricao: row.descricao.trim() || undefined,
  sku: row.sku.trim() || undefined,
  ncm: row.ncm.trim() || undefined,
  unidade: row.unidade.trim() || undefined,
  quantidade: lerNumeroBR(row.quantidade) ?? 0,
  previsaoEntrega: row.previsaoEntrega.trim() || undefined,
  precoUnitario: lerNumeroBR(row.valorUnitario),
  moeda: row.moeda,
  extras: row.extras,
  pedidoComo: row.pedidoComo,
});

const clienteFromFields = (fields: EditorField[]): NonNullable<DadosProposta['cliente']> => {
  const valor = (key: string) => fields.find((field) => field.key === key)?.value.trim() || undefined;

  return {
    razaoSocial: valor('razao_social'),
    documento: valor('cnpj_cpf'),
    contato: valor('contato'),
    telefone: valor('telefone'),
    email: valor('email'),
    extras: fields
      .filter((field) => field.isCustom && field.label.trim() && field.value.trim())
      .map((field) => ({ rotulo: field.label.trim(), valor: field.value.trim() })),
  };
};

/** Envolve o HTML da proposta para a previa em iframe (respiro e rodape acima da borda). */
const buildPreviewHtml = (html: string) => {
  const preview =
    '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
    '<style id="orcamento-preview-spacing">body{margin:24px !important;padding-bottom:90px !important;background:#ffffff;}.rodape{bottom:24px !important;}</style>';

  return html.replace(/<head[^>]*>/i, (head) => `${head}${preview}`);
};

const OrcamentoEditorModal: React.FC<OrcamentoEditorModalProps> = ({
  isOpen,
  onClose,
  assunto,
  empresaId,
  orcamento,
  empresa,
  numeroTicket,
  origem,
  vendedor,
  cliente,
  atendimentoId,
  membroId,
  onSaved,
}) => {
  const [carregada, setCarregada] = useState<PropostaCarregada | null>(null);
  const [isLoadingProposta, setIsLoadingProposta] = useState(false);
  const [clientFields, setClientFields] = useState<EditorField[]>([]);
  const [itemsRows, setItemsRows] = useState<OrcamentoItemRow[]>([]);
  const [observacao, setObservacao] = useState('');
  const [isClientSectionExpanded, setIsClientSectionExpanded] = useState(true);
  const [isItemsSectionExpanded, setIsItemsSectionExpanded] = useState(true);
  const [isObservacaoSectionExpanded, setIsObservacaoSectionExpanded] = useState(true);
  const [expandedClientFieldIds, setExpandedClientFieldIds] = useState<string[]>([]);
  const [expandedItemRowIds, setExpandedItemRowIds] = useState<string[]>([]);
  const [isObservacaoFieldExpanded, setIsObservacaoFieldExpanded] = useState(false);
  const [isSavingHtml, setIsSavingHtml] = useState(false);
  const [isApprovingOrcamento, setIsApprovingOrcamento] = useState(false);
  const [isApproveConfirmationOpen, setIsApproveConfirmationOpen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [productSearchRowId, setProductSearchRowId] = useState<string | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productResults, setProductResults] = useState<ProdutoOption[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);

  const orcamentoId = orcamento?.orcamento_id || null;

  // Carrega os dados sempre que o modal abre (ou troca de orcamento). Enquanto isso o formulario fica vazio.
  useEffect(() => {
    if (!isOpen || !empresaId) {
      setCarregada(null);
      return;
    }

    let isCancelled = false;
    setIsLoadingProposta(true);
    setCarregada(null);
    setActionFeedback(null);
    setActionError(null);
    setIsApproveConfirmationOpen(false);
    setExpandedClientFieldIds([]);
    setExpandedItemRowIds([]);
    setIsObservacaoFieldExpanded(false);
    setProductSearchRowId(null);
    setProductSearchQuery('');
    setProductResults([]);

    carregarProposta({ empresaId, orcamento, empresa, numeroTicket, origem, vendedor, cliente })
      .then((resultado) => {
        if (isCancelled) {
          return;
        }

        setCarregada(resultado);
        setClientFields(clientFieldsFromDados(resultado.dados));
        setItemsRows(itemRowsFromDados(resultado.dados));
        setObservacao(resultado.dados.observacoes || '');
      })
      .catch((error: any) => {
        if (!isCancelled) {
          console.error('Erro ao carregar dados da proposta:', error);
          setActionError(error?.message || 'Não foi possível carregar os dados do orçamento.');
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingProposta(false);
        }
      });

    return () => {
      isCancelled = true;
    };
    // Carrega uma vez por abertura: os dados editados nao podem ser sobrescritos por re-render do pai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, orcamentoId, empresaId]);

  useEffect(() => {
    if (!productSearchRowId || !empresaId) {
      setProductResults([]);
      return;
    }

    const query = productSearchQuery.trim();

    if (!query) {
      setProductResults([]);
      setIsSearchingProducts(false);
      return;
    }

    let isCancelled = false;
    setIsSearchingProducts(true);

    const timeoutId = window.setTimeout(async () => {
      const safeQuery = query.replace(/[%,()]/g, ' ').trim();

      const { data, error } = await supabase
        .from('sales_produtos_v2')
        .select('produto_id, codigo_sku, nome, descricao, preco_venda, unidade_medida, metadata')
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .or(`nome.ilike.%${safeQuery}%,codigo_sku.ilike.%${safeQuery}%`)
        .order('nome', { ascending: true })
        .limit(15);

      if (isCancelled) {
        return;
      }

      if (error) {
        console.error('Erro ao buscar produtos:', error);
        setProductResults([]);
      } else {
        setProductResults((data ?? []) as ProdutoOption[]);
      }

      setIsSearchingProducts(false);
    }, 300);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [productSearchQuery, productSearchRowId, empresaId]);

  const toggleClientFieldExpansion = (fieldId: string) => {
    setExpandedClientFieldIds((currentIds) =>
      currentIds.includes(fieldId)
        ? currentIds.filter((currentId) => currentId !== fieldId)
        : [...currentIds, fieldId],
    );
  };

  const handleClientFieldValueChange = (fieldId: string, value: string) => {
    setClientFields((currentFields) =>
      currentFields.map((field) => (field.id === fieldId ? { ...field, value } : field)),
    );
  };

  const handleClientFieldLabelChange = (fieldId: string, label: string) => {
    setClientFields((currentFields) =>
      currentFields.map((field) => (field.id === fieldId ? { ...field, label } : field)),
    );
  };

  const handleRemoveClientField = (fieldId: string) => {
    setClientFields((currentFields) => currentFields.filter((field) => field.id !== fieldId));
    setExpandedClientFieldIds((currentIds) => currentIds.filter((currentId) => currentId !== fieldId));
  };

  const handleAddClientField = () => {
    const newFieldId = buildFieldId('custom-client');

    setClientFields((currentFields) => [
      ...currentFields,
      {
        id: newFieldId,
        key: `custom_${Date.now()}`,
        label: 'Novo campo',
        value: '',
        isCustom: true,
      },
    ]);
    setExpandedClientFieldIds((currentIds) => [...currentIds, newFieldId]);
  };

  const toggleItemRowExpansion = (rowId: string) => {
    setExpandedItemRowIds((currentIds) =>
      currentIds.includes(rowId)
        ? currentIds.filter((currentId) => currentId !== rowId)
        : [...currentIds, rowId],
    );
  };

  const handleItemRowChange = (rowId: string, fieldKey: EditableItemField, fieldValue: string) => {
    setItemsRows((currentRows) =>
      currentRows.map((row) => (row.id === rowId ? { ...row, [fieldKey]: fieldValue } : row)),
    );
  };

  const handleRemoveItemRow = (rowId: string) => {
    setItemsRows((currentRows) => currentRows.filter((row) => row.id !== rowId));
    setExpandedItemRowIds((currentIds) => currentIds.filter((currentId) => currentId !== rowId));

    if (productSearchRowId === rowId) {
      setProductSearchRowId(null);
      setProductSearchQuery('');
    }
  };

  const handleAddItemRow = () => {
    const newItemRow = buildDefaultItemRow();
    setItemsRows((currentRows) => [...currentRows, newItemRow]);
    setExpandedItemRowIds((currentIds) => [...currentIds, newItemRow.id]);
    setProductSearchRowId(newItemRow.id);
    setProductSearchQuery('');
  };

  const handleSelectProduto = (rowId: string, produto: ProdutoOption) => {
    const metadata = produto.metadata || {};
    const extras: Record<string, string> = {};

    for (const [chave, valor] of Object.entries(metadata)) {
      if (['ncm', 'idaux', 'metadata'].includes(chave)) continue;
      if (typeof valor === 'string' || typeof valor === 'number') {
        const conteudo = String(valor).trim();
        if (conteudo) extras[chave] = conteudo;
      }
    }

    setItemsRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              produtoId: produto.produto_id,
              nome: produto.nome,
              sku: produto.codigo_sku || '',
              descricao: produto.descricao || row.descricao,
              unidade: produto.unidade_medida || row.unidade,
              ncm: typeof metadata.ncm === 'string' ? metadata.ncm : row.ncm,
              valorUnitario: produto.preco_venda != null ? formatarPreco(produto.preco_venda) : row.valorUnitario,
              extras: Object.keys(extras).length ? extras : undefined,
            }
          : row,
      ),
    );
    setProductSearchRowId(null);
    setProductSearchQuery('');
    setProductResults([]);
  };

  // Dados da proposta com as edicoes aplicadas. Tudo abaixo (previa, salvar) sai daqui.
  const dadosEditados = useMemo<DadosProposta | null>(() => {
    if (!carregada) {
      return null;
    }

    const itens = itemsRows.filter((row) => row.nome.trim()).map(itemFromRow);

    return {
      ...carregada.dados,
      cliente: clienteFromFields(clientFields),
      itens,
      totais: recalcularTotais(itens, carregada.dados.totais),
      observacoes: observacao.trim() || undefined,
    };
  }, [carregada, clientFields, itemsRows, observacao]);

  const proposta = useMemo(
    () => (dadosEditados && carregada ? gerarProposta(dadosEditados, carregada.modelo) : null),
    [dadosEditados, carregada],
  );
  const propostaHtml = proposta?.html || '';
  const valorTotal = proposta?.valorTotal ?? 0;
  const previewHtml = useMemo(() => (propostaHtml ? buildPreviewHtml(propostaHtml) : ''), [propostaHtml]);

  const isBlankOrcamento = carregada?.fonte === 'vazio';
  const isRemontado = carregada?.fonte === 'catalogo';
  const hasUnlinkedManualItem = itemsRows.some((row) => row.isManuallyAdded && !row.produtoId);
  const canSaveHtml = Boolean(orcamentoId && propostaHtml) && !isSavingHtml && !hasUnlinkedManualItem;
  const canApproveOrcamento =
    Boolean(orcamentoId && atendimentoId && membroId && propostaHtml) &&
    !isApprovingOrcamento &&
    !hasUnlinkedManualItem;

  const saveHtmlToDatabase = async () => {
    if (!orcamentoId || !dadosEditados || !propostaHtml) {
      throw new Error('Não foi possível identificar os dados do orçamento para salvar.');
    }

    // valor_total acompanha o que o cliente ve no PDF (aparece no painel do orcamento e no funil).
    const { error } = await supabase
      .from('sales_orcamentos_v2')
      .update({ html_orcamento: propostaHtml, dados_proposta: dadosEditados, valor_total: valorTotal })
      .eq('orcamento_id', orcamentoId);

    if (error) {
      throw error;
    }

    onSaved(propostaHtml, dadosEditados, valorTotal);
  };

  const handleSaveHtml = async () => {
    setIsSavingHtml(true);
    setActionError(null);
    setActionFeedback(null);

    try {
      await saveHtmlToDatabase();
      setActionFeedback('Alterações salvas com sucesso.');
    } catch (error: any) {
      setActionError(error?.message || 'Não foi possível salvar as alterações.');
    } finally {
      setIsSavingHtml(false);
    }
  };

  const handleApproveOrcamento = async () => {
    if (!orcamentoId || !atendimentoId || !membroId) {
      setActionError('Não foi possível identificar os dados necessários para aprovar o orçamento.');
      setActionFeedback(null);
      return;
    }

    let shouldReloadPage = false;
    setIsApprovingOrcamento(true);
    setActionError(null);
    setActionFeedback(null);

    try {
      await saveHtmlToDatabase();

      const response = await fetch(APROVACAO_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orcamento_id: orcamentoId,
          atendimento_id: atendimentoId,
          membro_id: membroId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Falha ao enviar o orçamento. Status ${response.status}.`);
      }

      shouldReloadPage = true;
      await waitForAtendimentoStatusChange(atendimentoId, 'AGUARDANDO_APROVACAO');
      window.location.reload();
    } catch (error: any) {
      setActionError(error?.message || 'Não foi possível enviar o orçamento.');
    } finally {
      if (!shouldReloadPage) {
        setIsApprovingOrcamento(false);
      }
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(20,20,20,0.55)] backdrop-blur-sm font-sans">
      <button
        type="button"
        aria-label="Fechar visualizacao do orcamento"
        onClick={isApprovingOrcamento ? undefined : onClose}
        disabled={isApprovingOrcamento}
        className="absolute inset-0 disabled:cursor-not-allowed"
      />

      <div className="relative z-10 flex h-screen w-screen flex-col overflow-hidden bg-paper">
        <div className="flex items-center justify-between gap-4 border-b border-line-soft bg-card px-6 py-5 max-lg:flex-col max-lg:items-stretch max-lg:gap-3 max-lg:px-4 max-lg:py-4">
          <div className="min-w-0">
            <p
              className="text-[10.5px] text-muted-soft"
              style={{ fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}
            >
              Visualização do Orçamento
            </p>
            <h2 className="truncate text-[18px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.01em' }}>
              {assunto || 'Cotação sem assunto'}
            </h2>
            {actionFeedback ? (
              <p className="mt-1.5 text-[12.5px] text-emerald-600" style={{ fontWeight: 700 }}>
                {actionFeedback}
              </p>
            ) : null}
            {actionError ? (
              <p className="mt-1.5 text-[12.5px] text-red-600" style={{ fontWeight: 700 }}>
                {actionError}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-3 max-lg:w-full max-lg:flex-wrap max-lg:justify-between max-lg:gap-2">
            <button
              type="button"
              onClick={handleSaveHtml}
              disabled={!canSaveHtml}
              className="inline-flex h-11 items-center justify-center rounded-[9px] border border-line bg-card px-4 text-[13px] text-ink transition-colors hover:bg-stone disabled:cursor-not-allowed disabled:opacity-50 max-lg:h-10 max-lg:px-3 max-lg:text-[12px]"
              style={{ fontWeight: 700, transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
            >
              {isSavingHtml ? 'Salvando...' : 'Salvar Alterações'}
            </button>

            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setActionFeedback(null);
                setIsApproveConfirmationOpen(true);
              }}
              disabled={!canApproveOrcamento}
              className="inline-flex h-11 items-center justify-center rounded-[9px] bg-lime px-4 text-[13px] text-ink transition-colors hover:bg-lime-deep disabled:cursor-not-allowed disabled:opacity-50 max-lg:h-10 max-lg:px-3 max-lg:text-[12px]"
              style={{ fontWeight: 700, transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
            >
              {isApprovingOrcamento ? 'Aprovando...' : 'Aprovar e Enviar'}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={isApprovingOrcamento}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border border-line bg-card text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 max-lg:h-10 max-lg:w-10"
              style={{ transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
              aria-label="Fechar modal do orçamento"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {isBlankOrcamento ? (
          <div className="flex items-start gap-3 border-b border-red-100 bg-red-50 px-6 py-3.5 max-lg:px-4">
            <div className="mt-0.5 shrink-0 text-red-600">
              <AlertTriangle size={17} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] text-red-600" style={{ fontWeight: 700 }}>
                Nenhum item foi encontrado automaticamente para esse lead
              </p>
              <p className="mt-0.5 text-[12.5px] text-red-600" style={{ fontWeight: 500, opacity: 0.85 }}>
                A IA não localizou os itens solicitados no catálogo. Preencha os dados do cliente e
                adicione os itens manualmente abaixo antes de aprovar o orçamento.
              </p>
            </div>
          </div>
        ) : null}

        {isRemontado ? (
          <div className="flex items-start gap-3 border-b border-line-soft bg-stone px-6 py-3 max-lg:px-4">
            <div className="mt-0.5 shrink-0 text-muted">
              <AlertTriangle size={16} strokeWidth={2} />
            </div>
            <p className="text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
              Este orçamento foi criado no modelo antigo e foi remontado no layout novo a partir do
              catálogo. Confira itens, quantidades e valores antes de aprovar: ajustes manuais feitos
              antes podem não ter sido mantidos.
            </p>
          </div>
        ) : null}

        {hasUnlinkedManualItem ? (
          <div className="flex items-start gap-3 border-b border-line-soft bg-stone px-6 py-3 max-lg:px-4">
            <div className="mt-0.5 shrink-0 text-muted">
              <Package size={16} strokeWidth={2} />
            </div>
            <p className="text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
              Existem itens adicionados manualmente sem produto vinculado — busque e selecione um
              produto do catálogo para poder salvar ou aprovar.
            </p>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-b border-line-soft bg-card px-5 py-6 xl:border-b-0 xl:border-r max-lg:px-4 max-lg:py-4">
            <div className="space-y-4">
              {/* Informações do Cliente */}
              <div className="rounded-panel border border-line-soft bg-paper">
                <button
                  type="button"
                  onClick={() => setIsClientSectionExpanded((currentValue) => !currentValue)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                  aria-expanded={isClientSectionExpanded}
                >
                  <h3 className="text-[13.5px] text-ink" style={{ fontWeight: 800 }}>
                    Informações do Cliente
                  </h3>
                  <div className="ml-4 flex shrink-0 items-center gap-2.5">
                    <span
                      className="rounded-pill bg-card px-2.5 py-0.5 text-[11px] text-muted"
                      style={{ fontWeight: 700 }}
                    >
                      {clientFields.length}
                    </span>
                    <span className="text-muted-soft">
                      {isClientSectionExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                    </span>
                  </div>
                </button>

                {isClientSectionExpanded ? (
                  <div className="space-y-2.5 border-t border-line-soft px-4 pb-4 pt-3.5">
                    {clientFields.map((field) => {
                      const isExpanded = expandedClientFieldIds.includes(field.id);

                      return (
                        <div key={field.id} className="rounded-tile border border-line-soft bg-card">
                          <button
                            type="button"
                            onClick={() => toggleClientFieldExpansion(field.id)}
                            className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
                            aria-expanded={isExpanded}
                          >
                            <p className="truncate text-[12.5px] text-ink" style={{ fontWeight: 700 }}>
                              {field.label}
                            </p>
                            <span className="shrink-0 text-muted-soft">
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </span>
                          </button>

                          {isExpanded ? (
                            <div className="space-y-2 border-t border-line-soft px-3.5 pb-3.5 pt-3">
                              {field.isCustom ? (
                                <input
                                  type="text"
                                  value={field.label}
                                  onChange={(event) =>
                                    handleClientFieldLabelChange(field.id, event.target.value)
                                  }
                                  placeholder="Nome do campo"
                                  className="w-full rounded-[9px] border border-line bg-paper px-3 py-2 text-[12.5px] text-ink outline-none transition-colors focus:border-ink"
                                  style={{ fontWeight: 700, transitionDuration: '.22s' }}
                                />
                              ) : null}

                              <input
                                type="text"
                                value={field.value}
                                onChange={(event) =>
                                  handleClientFieldValueChange(field.id, event.target.value)
                                }
                                placeholder="Digite o valor"
                                className="w-full rounded-[9px] border border-line bg-paper px-3 py-2 text-[12.5px] text-ink outline-none transition-colors focus:border-ink"
                                style={{ fontWeight: 500, transitionDuration: '.22s' }}
                              />

                              <button
                                type="button"
                                onClick={() => handleRemoveClientField(field.id)}
                                className="text-[11.5px] text-muted-soft transition-colors hover:text-red-600"
                                style={{ fontWeight: 700, transitionDuration: '.22s' }}
                              >
                                Excluir
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={handleAddClientField}
                      className="inline-flex w-full items-center justify-center rounded-[9px] border border-line bg-card px-4 py-2.5 text-[12.5px] text-ink transition-colors hover:bg-stone"
                      style={{ fontWeight: 700, transitionDuration: '.22s' }}
                    >
                      Adicionar informação
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Itens do Pedido */}
              <div className="rounded-panel border border-line-soft bg-paper">
                <button
                  type="button"
                  onClick={() => setIsItemsSectionExpanded((currentValue) => !currentValue)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                  aria-expanded={isItemsSectionExpanded}
                >
                  <h3 className="text-[13.5px] text-ink" style={{ fontWeight: 800 }}>
                    Itens do Pedido
                  </h3>
                  <div className="ml-4 flex shrink-0 items-center gap-2.5">
                    <span
                      className="rounded-pill bg-card px-2.5 py-0.5 text-[11px] text-muted"
                      style={{ fontWeight: 700 }}
                    >
                      {itemsRows.length}
                    </span>
                    <span className="text-muted-soft">
                      {isItemsSectionExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                    </span>
                  </div>
                </button>

                {isItemsSectionExpanded ? (
                  <div className="space-y-2.5 border-t border-line-soft px-4 pb-4 pt-3.5">
                    {itemsRows.map((itemRow, index) => {
                      const isExpanded = expandedItemRowIds.includes(itemRow.id);
                      const itemLabel = itemRow.nome.trim() || `Novo item ${index + 1}`;
                      const isSearchingThisRow = productSearchRowId === itemRow.id;
                      const needsProductLink = itemRow.isManuallyAdded && !itemRow.produtoId;

                      return (
                        <div key={itemRow.id} className="rounded-tile border border-line-soft bg-card">
                          <button
                            type="button"
                            onClick={() => toggleItemRowExpansion(itemRow.id)}
                            className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
                            aria-expanded={isExpanded}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <p className="truncate text-[12.5px] text-ink" style={{ fontWeight: 700 }}>
                                {itemLabel}
                              </p>
                              {needsProductLink ? (
                                <span
                                  className="shrink-0 rounded-pill bg-red-50 px-2 py-0.5 text-[9.5px] text-red-600"
                                  style={{ fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' }}
                                >
                                  Vincular produto
                                </span>
                              ) : itemRow.isManuallyAdded ? (
                                <span
                                  className="shrink-0 rounded-pill bg-lime px-2 py-0.5 text-[9.5px] text-ink"
                                  style={{ fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' }}
                                >
                                  Catálogo
                                </span>
                              ) : !itemRow.valorUnitario.trim() ? (
                                <span
                                  className="shrink-0 rounded-pill bg-red-50 px-2 py-0.5 text-[9.5px] text-red-600"
                                  style={{ fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' }}
                                >
                                  Sob consulta
                                </span>
                              ) : null}
                            </div>
                            <span className="shrink-0 text-muted-soft">
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </span>
                          </button>

                          {isExpanded ? (
                            <div className="space-y-2.5 border-t border-line-soft px-3.5 pb-3.5 pt-3">
                              {itemRow.isManuallyAdded ? (
                                <div className="space-y-1.5">
                                  <label
                                    className="block text-[10.5px] text-muted-soft"
                                    style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                                  >
                                    Produto (catálogo)
                                  </label>

                                  {itemRow.produtoId && !isSearchingThisRow ? (
                                    <div className="flex items-center justify-between gap-2 rounded-[9px] border border-line bg-paper px-3 py-2">
                                      <div className="min-w-0">
                                        <p className="truncate text-[12.5px] text-ink" style={{ fontWeight: 700 }}>
                                          {itemRow.nome}
                                        </p>
                                        <p className="truncate text-[11px] text-muted" style={{ fontWeight: 500 }}>
                                          SKU: {itemRow.sku || '—'}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setProductSearchRowId(itemRow.id);
                                          setProductSearchQuery('');
                                        }}
                                        className="shrink-0 text-[11.5px] text-muted-soft transition-colors hover:text-ink"
                                        style={{ fontWeight: 700, transitionDuration: '.22s' }}
                                      >
                                        Trocar
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="relative">
                                      <div className="flex h-10 items-center gap-2 rounded-[9px] border border-line bg-paper px-3">
                                        <Search size={14} className="shrink-0 text-muted-soft" />
                                        <input
                                          type="text"
                                          autoFocus
                                          value={productSearchQuery}
                                          onChange={(event) => {
                                            setProductSearchRowId(itemRow.id);
                                            setProductSearchQuery(event.target.value);
                                          }}
                                          onFocus={() => setProductSearchRowId(itemRow.id)}
                                          placeholder="Buscar por nome ou SKU"
                                          className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-muted-soft"
                                          style={{ fontWeight: 500 }}
                                        />
                                      </div>

                                      {isSearchingThisRow && productSearchQuery.trim() ? (
                                        <div
                                          className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 max-h-[220px] overflow-y-auto rounded-[9px] border border-line bg-card py-1"
                                          style={{ boxShadow: '0 18px 40px -18px rgba(20,20,20,.35)' }}
                                        >
                                          {isSearchingProducts ? (
                                            <p className="px-3.5 py-2.5 text-[12px] text-muted-soft" style={{ fontWeight: 500 }}>
                                              Buscando...
                                            </p>
                                          ) : productResults.length > 0 ? (
                                            productResults.map((produto) => (
                                              <button
                                                key={produto.produto_id}
                                                type="button"
                                                onClick={() => handleSelectProduto(itemRow.id, produto)}
                                                className="flex w-full items-start justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-stone"
                                                style={{ transitionDuration: '.15s' }}
                                              >
                                                <div className="min-w-0">
                                                  <p className="truncate text-[12.5px] text-ink" style={{ fontWeight: 700 }}>
                                                    {produto.nome}
                                                  </p>
                                                  <p className="truncate text-[11px] text-muted" style={{ fontWeight: 500 }}>
                                                    SKU: {produto.codigo_sku || '—'}
                                                  </p>
                                                </div>
                                                {formatProdutoPreco(produto) ? (
                                                  <span
                                                    className="shrink-0 text-[11.5px] text-ink"
                                                    style={{ fontWeight: 700 }}
                                                  >
                                                    {formatProdutoPreco(produto)}
                                                  </span>
                                                ) : null}
                                              </button>
                                            ))
                                          ) : (
                                            <p className="px-3.5 py-2.5 text-[12px] text-muted-soft" style={{ fontWeight: 500 }}>
                                              Nenhum produto encontrado no catálogo.
                                            </p>
                                          )}
                                        </div>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  <label
                                    className="block text-[10.5px] text-muted-soft"
                                    style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                                  >
                                    Nome
                                  </label>
                                  <input
                                    type="text"
                                    value={itemRow.nome}
                                    onChange={(event) => handleItemRowChange(itemRow.id, 'nome', event.target.value)}
                                    placeholder="Digite o valor"
                                    className="w-full rounded-[9px] border border-line bg-paper px-3 py-2 text-[12.5px] text-ink outline-none transition-colors focus:border-ink"
                                    style={{ fontWeight: 500, transitionDuration: '.22s' }}
                                  />
                                </div>
                              )}

                              {(Object.keys(ITEM_FIELD_LABELS) as Array<Exclude<EditableItemField, 'nome'>>)
                                .filter((fieldKey) => fieldKey !== 'sku' || !itemRow.isManuallyAdded)
                                .map((fieldKey) => (
                                  <div key={fieldKey} className="space-y-1.5">
                                    <label
                                      className="block text-[10.5px] text-muted-soft"
                                      style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                                    >
                                      {ITEM_FIELD_LABELS[fieldKey]}
                                    </label>

                                    <input
                                      type="text"
                                      value={itemRow[fieldKey]}
                                      onChange={(event) =>
                                        handleItemRowChange(itemRow.id, fieldKey, event.target.value)
                                      }
                                      placeholder={
                                        fieldKey === 'valorUnitario' ? 'Em branco = Sob consulta' : 'Digite o valor'
                                      }
                                      className="w-full rounded-[9px] border border-line bg-paper px-3 py-2 text-[12.5px] text-ink outline-none transition-colors focus:border-ink"
                                      style={{ fontWeight: 500, transitionDuration: '.22s' }}
                                    />
                                  </div>
                                ))}

                              <button
                                type="button"
                                onClick={() => handleRemoveItemRow(itemRow.id)}
                                className="text-[11.5px] text-muted-soft transition-colors hover:text-red-600"
                                style={{ fontWeight: 700, transitionDuration: '.22s' }}
                              >
                                Excluir linha
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      className="inline-flex w-full items-center justify-center rounded-[9px] border border-line bg-card px-4 py-2.5 text-[12.5px] text-ink transition-colors hover:bg-stone"
                      style={{ fontWeight: 700, transitionDuration: '.22s' }}
                    >
                      Adicionar linha
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Observação */}
              <div className="rounded-panel border border-line-soft bg-paper">
                <button
                  type="button"
                  onClick={() => setIsObservacaoSectionExpanded((currentValue) => !currentValue)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                  aria-expanded={isObservacaoSectionExpanded}
                >
                  <h3 className="text-[13.5px] text-ink" style={{ fontWeight: 800 }}>
                    Observação
                  </h3>
                  <div className="ml-4 flex shrink-0 items-center gap-2.5">
                    <span
                      className="rounded-pill bg-card px-2.5 py-0.5 text-[11px] text-muted"
                      style={{ fontWeight: 700 }}
                    >
                      1
                    </span>
                    <span className="text-muted-soft">
                      {isObservacaoSectionExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                    </span>
                  </div>
                </button>

                {isObservacaoSectionExpanded ? (
                  <div className="space-y-2.5 border-t border-line-soft px-4 pb-4 pt-3.5">
                    <div className="rounded-tile border border-line-soft bg-card">
                      <button
                        type="button"
                        onClick={() => setIsObservacaoFieldExpanded((currentValue) => !currentValue)}
                        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
                        aria-expanded={isObservacaoFieldExpanded}
                      >
                        <p className="truncate text-[12.5px] text-ink" style={{ fontWeight: 700 }}>
                          Texto
                        </p>
                        <span className="shrink-0 text-muted-soft">
                          {isObservacaoFieldExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                      </button>

                      {isObservacaoFieldExpanded ? (
                        <div className="space-y-2 border-t border-line-soft px-3.5 pb-3.5 pt-3">
                          <textarea
                            value={observacao}
                            onChange={(event) => setObservacao(event.target.value)}
                            rows={6}
                            placeholder="Digite o texto da observação"
                            className="w-full resize-y rounded-[9px] border border-line bg-paper px-3 py-2 text-[12.5px] text-ink outline-none transition-colors focus:border-ink"
                            style={{ fontWeight: 500, transitionDuration: '.22s' }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>

          <section className="min-h-0 overflow-auto bg-stone p-5 pb-8 max-lg:p-3">
            {isLoadingProposta ? (
              <div className="flex h-full items-center justify-center rounded-panel border border-dashed border-line bg-card px-6 text-center">
                <Loader2 size={22} className="animate-spin text-muted" />
              </div>
            ) : previewHtml ? (
              <div className="flex min-h-full w-full overflow-auto rounded-panel border border-line-soft bg-card p-6 pb-10 max-lg:p-3">
                <div className="mx-auto flex w-full min-w-[860px] max-w-[860px] justify-center pb-8">
                  <iframe
                    title="Visualização do orçamento"
                    srcDoc={previewHtml}
                    className="h-[1160px] w-[820px] flex-none border border-line bg-white"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-panel border border-dashed border-line bg-card px-6 text-center">
                <p className="text-[13px] text-muted" style={{ fontWeight: 500 }}>
                  Não foi possível montar a visualização deste orçamento.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {isApprovingOrcamento ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4">
          <div
            className="w-full max-w-sm rounded-panel border-2 border-lime bg-card p-8 text-center"
            style={{ boxShadow: '0 40px 110px -30px rgba(0,0,0,.65)' }}
          >
            <Loader2 size={52} className="mx-auto animate-spin text-lime-deep" strokeWidth={2.5} />
            <h3 className="mt-5 text-[19px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.01em' }}>
              Aprovando orçamento...
            </h3>
            <p className="mt-2.5 text-[13.5px] leading-6 text-muted" style={{ fontWeight: 500 }}>
              Isso pode levar até 1 minuto. Não feche esta janela — a página vai atualizar sozinha
              assim que o envio for concluído.
            </p>
          </div>
        </div>
      ) : isApproveConfirmationOpen ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 px-4">
          <div
            className="w-full max-w-md rounded-panel border border-line-soft bg-card p-6"
            style={{ boxShadow: '0 28px 80px -34px rgba(20,20,20,.45)' }}
          >
            <div>
              <h3 className="text-[18px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.01em' }}>
                Aprovar Orçamento
              </h3>
              <p className="mt-3 text-[13.5px] leading-6 text-muted" style={{ fontWeight: 500 }}>
                Tem certeza que deseja aprovar este orçamento? O e-mail será enviado para o
                cliente.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsApproveConfirmationOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-[9px] border border-line bg-card px-4 text-[13px] text-ink transition-colors hover:bg-stone"
                style={{ fontWeight: 700, transitionDuration: '.22s' }}
              >
                Não
              </button>

              <button
                type="button"
                onClick={handleApproveOrcamento}
                className="inline-flex h-11 items-center justify-center rounded-[9px] bg-ink px-4 text-[13px] text-white transition-colors hover:bg-ink-soft"
                style={{ fontWeight: 700, transitionDuration: '.22s' }}
              >
                Sim
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default OrcamentoEditorModal;
