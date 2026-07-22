import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface OrcamentoEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  assunto: string | null;
  htmlOrcamento: string | null;
  orcamentoId: string | null;
  atendimentoId: string | null;
  membroId: string | null;
  onHtmlSaved: (html: string) => void;
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
  itemId: string;
  nome: string;
  quantidade: string;
  sku: string;
  descricao: string;
  ncm: string;
  valorUnitario: string;
  valorTotal: string;
  disponivel: boolean;
}

interface ObservacaoField {
  id: string;
  texto: string;
}

const CLIENT_FIELD_ORDER = ['razao_social', 'cnpj_cpf', 'endereco', 'email', 'telefone'] as const;

const CLIENT_FIELD_LABELS: Record<(typeof CLIENT_FIELD_ORDER)[number], string> = {
  razao_social: 'Razão Social',
  cnpj_cpf: 'CNPJ/CPF',
  endereco: 'Endereço',
  email: 'Email',
  telefone: 'Telefone',
};

const CLIENT_HTML_LABELS: Record<(typeof CLIENT_FIELD_ORDER)[number], string> = {
  razao_social: 'Razão Social:',
  cnpj_cpf: 'CNPJ/CPF:',
  endereco: 'Endereço:',
  email: 'Email:',
  telefone: 'Telefone:',
};

const APROVACAO_WEBHOOK_URL =
  'https://primary-systec.up.railway.app/webhook/c0b437a3-92f2-4e07-8017-33534099784b';

const ITEM_FIELD_LABELS: Record<Exclude<keyof OrcamentoItemRow, 'id' | 'itemId'>, string> = {
  nome: 'Nome',
  quantidade: 'Quantidade',
  sku: 'SKU',
  descricao: 'Descrição',
  ncm: 'NCM',
  valorUnitario: 'Valor Unitário',
  valorTotal: 'Valor Total',
  disponivel: 'Disponível',
};

const normalizeEmbeddedAssetUrl = (value: string | null) => {
  if (!value) {
    return null;
  }

  const normalizedValue = value
    .replace(/`/g, '')
    .replace(/^['"]+|['"]+$/g, '')
    .trim();

  return normalizedValue || null;
};

const buildFieldId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const escapeHtmlValue = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeComparisonText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const decodeInlineHtmlText = (value: string) => {
  if (!value) {
    return '';
  }

  if (typeof DOMParser === 'undefined') {
    return value
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/<\/?[^>]+>/g, '')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  const documentNode = new DOMParser().parseFromString(value, 'text/html');
  return (documentNode.body.textContent || '').replace(/\u00a0/g, ' ').trim();
};

const serializeHtmlDocument = (documentNode: Document) => {
  const doctype = documentNode.doctype
    ? `<!DOCTYPE ${documentNode.doctype.name}${
        documentNode.doctype.publicId ? ` PUBLIC "${documentNode.doctype.publicId}"` : ''
      }${documentNode.doctype.systemId ? ` "${documentNode.doctype.systemId}"` : ''}>`
    : '<!DOCTYPE html>';

  return `${doctype}\n${documentNode.documentElement.outerHTML}`;
};

const buildDefaultClientFields = () =>
  CLIENT_FIELD_ORDER.map((key) => ({
    id: buildFieldId(key),
    key,
    label: CLIENT_FIELD_LABELS[key],
    value: '',
  })) satisfies EditorField[];

const buildDefaultItemRow = () => ({
  id: buildFieldId('item'),
  itemId: '',
  nome: '',
  quantidade: '',
  sku: '',
  descricao: '',
  ncm: '',
  valorUnitario: '',
  valorTotal: '',
  disponivel: true,
}) satisfies OrcamentoItemRow;

const buildDefaultObservacaoField = () =>
  ({
    id: buildFieldId('observacao'),
    texto: '',
  }) satisfies ObservacaoField;

const extractClientSectionFields = (value: string | null) => {
  const defaultFields = buildDefaultClientFields();

  if (!value || typeof DOMParser === 'undefined') {
    return defaultFields;
  }

  const extractedValues = new Map<string, string>();
  const documentNode = new DOMParser().parseFromString(value, 'text/html');
  const clientSection = documentNode.querySelector('.info-cliente');

  if (!clientSection) {
    return defaultFields;
  }

  const fieldElements = Array.from(clientSection.querySelectorAll('.campo'));

  fieldElements.forEach((fieldElement) => {
    const labelElement = fieldElement.querySelector('strong');
    const label = decodeInlineHtmlText(labelElement?.textContent || '').replace(/:\s*$/, '').trim();
    const valueOnly = decodeInlineHtmlText(
      fieldElement.textContent?.replace(labelElement?.textContent || '', '') || '',
    );

    const normalizedLabel = normalizeComparisonText(label);

    if (normalizedLabel === 'razao social') {
      extractedValues.set('razao_social', valueOnly);
    } else if (normalizedLabel === 'cnpj/cpf') {
      extractedValues.set('cnpj_cpf', valueOnly);
    } else if (normalizedLabel === 'endereco') {
      extractedValues.set('endereco', valueOnly);
    } else if (normalizedLabel === 'email') {
      extractedValues.set('email', valueOnly);
    } else if (normalizedLabel === 'telefone') {
      extractedValues.set('telefone', valueOnly);
    }
  });

  return defaultFields.map((field) => ({
    ...field,
    value: extractedValues.get(field.key) || '',
  }));
};

const extractItemsSectionRows = (value: string | null) => {
  if (!value || typeof DOMParser === 'undefined') {
    return [] as OrcamentoItemRow[];
  }

  const documentNode = new DOMParser().parseFromString(value, 'text/html');
  const rowElements = Array.from(documentNode.querySelectorAll('table.itens-pedido tbody tr'));

  return rowElements.map((rowElement, index) => {
    const cells = Array.from(rowElement.querySelectorAll('td'));
    const descricaoHtml = cells[3]?.innerHTML || '';
    const descricaoText = decodeInlineHtmlText(descricaoHtml || cells[3]?.textContent || '');
    const nomeText = decodeInlineHtmlText(cells[0]?.innerHTML || cells[0]?.textContent || '');
    const itemId =
      rowElement.getAttribute('data-item-id') ||
      rowElement.getAttribute('data-itemid') ||
      String(index + 1);

    return {
      id: buildFieldId(`item-row-${index}`),
      itemId,
      nome: nomeText,
      quantidade: decodeInlineHtmlText(cells[1]?.textContent || ''),
      sku: decodeInlineHtmlText(cells[2]?.textContent || ''),
      descricao: descricaoText,
      ncm: decodeInlineHtmlText(cells[4]?.textContent || ''),
      valorUnitario: decodeInlineHtmlText(cells[5]?.textContent || ''),
      valorTotal: decodeInlineHtmlText(cells[6]?.textContent || ''),
      disponivel:
        !rowElement.classList.contains('indisponivel-row') &&
        !/indispon/i.test(descricaoText),
    };
  });
};

const extractObservacaoField = (value: string | null) => {
  const defaultField = buildDefaultObservacaoField();

  if (!value || typeof DOMParser === 'undefined') {
    return defaultField;
  }

  const documentNode = new DOMParser().parseFromString(value, 'text/html');
  const observacaoParagraph = documentNode.querySelector('.observacoes p');

  return {
    ...defaultField,
    texto: decodeInlineHtmlText(observacaoParagraph?.textContent || ''),
  };
};

const applyClientFieldsToOrcamentoHtml = (value: string | null, fields: EditorField[]) => {
  if (!value || fields.length === 0 || typeof DOMParser === 'undefined') {
    return value || '';
  }

  const documentNode = new DOMParser().parseFromString(value, 'text/html');
  const clientSection = documentNode.querySelector('.info-cliente');

  if (!clientSection) {
    return value;
  }

  const titleElement = clientSection.querySelector('h3');
  const rowsHtml = fields
    .filter((field) => field.label.trim() || field.value.trim())
    .map((field) => {
      const fieldValue = field.value.trim();
      const htmlLabel = field.isCustom
        ? `${field.label.trim() || 'Novo campo'}:`
        : CLIENT_HTML_LABELS[field.key as keyof typeof CLIENT_HTML_LABELS] || `${field.label.trim()}:`;

      return `<div class="campo"><strong>${escapeHtmlValue(htmlLabel)}</strong>${fieldValue ? ` ${escapeHtmlValue(fieldValue)}` : ''}</div>`;
    })
    .join('');

  clientSection.innerHTML = `${titleElement ? titleElement.outerHTML : '<h3>Informações do cliente:</h3>'}${rowsHtml}`;

  return serializeHtmlDocument(documentNode);
};

const applyItemsToOrcamentoHtml = (value: string | null, items: OrcamentoItemRow[]) => {
  if (!value || typeof DOMParser === 'undefined') {
    return value || '';
  }

  const documentNode = new DOMParser().parseFromString(value, 'text/html');
  const tbodyElement = documentNode.querySelector('table.itens-pedido tbody');

  if (!tbodyElement) {
    return value;
  }

  const rowsHtml = items
    .map((item) => {
      const isDisponivel = item.disponivel;
      const descricaoCell = isDisponivel
        ? escapeHtmlValue(item.descricao)
        : `<span class="badge-indisponivel">${escapeHtmlValue(item.descricao || 'Indisponível')}</span>`;

      return `<tr${isDisponivel ? '' : ' class="indisponivel-row"'} data-item-id="${escapeHtmlValue(
        item.itemId,
      )}">
         <td>${escapeHtmlValue(item.nome)}</td>
         <td>${escapeHtmlValue(item.quantidade)}</td>
         <td>${escapeHtmlValue(item.sku)}</td>
         <td>${descricaoCell}</td>
         <td>${escapeHtmlValue(item.ncm)}</td>
         <td style="text-align: right;">${escapeHtmlValue(item.valorUnitario)}</td>
         <td style="text-align: right; font-weight: bold;">${escapeHtmlValue(item.valorTotal)}</td>
       </tr>`;
    })
    .join('');

  tbodyElement.innerHTML = rowsHtml;

  return serializeHtmlDocument(documentNode);
};

const applyObservacaoToOrcamentoHtml = (value: string | null, observacao: ObservacaoField) => {
  if (!value || typeof DOMParser === 'undefined') {
    return value || '';
  }

  const documentNode = new DOMParser().parseFromString(value, 'text/html');
  const observacoesSection = documentNode.querySelector('.observacoes');

  if (!observacoesSection) {
    return value;
  }

  const titleElement = observacoesSection.querySelector('h3');
  observacoesSection.innerHTML = `${
    titleElement ? titleElement.outerHTML : '<h3>Observações</h3>'
  }<p>${escapeHtmlValue(observacao.texto.trim())}</p>`;

  return serializeHtmlDocument(documentNode);
};

const buildOrcamentoPreviewHtml = (value: string | null) => {
  if (!value) {
    return '';
  }

  const normalizedSource = value.replace(/\u0000/g, '').trim();

  if (!normalizedSource) {
    return '';
  }

  const cleanedSource = normalizedSource.replace(
    /\b(src|href)\s*=\s*(["'])([\s\S]*?)\2/gi,
    (_match, attributeName: string, _quote: string, attributeValue: string) => {
      const cleanValue = normalizeEmbeddedAssetUrl(attributeValue);
      return cleanValue ? `${attributeName}="${cleanValue}"` : '';
    },
  );

  const viewportTag = '<meta name="viewport" content="width=device-width, initial-scale=1" />';
  const previewSpacingStyle =
    '<style id="orcamento-preview-spacing">body{margin:24px !important;padding:24px 24px 120px 24px !important;box-sizing:border-box;background:#ffffff;}.footer{bottom:24px !important;}</style>';

  const hasViewport = /meta\s+name=["']viewport["']/i.test(cleanedSource);

  if (/<head[^>]*>/i.test(cleanedSource)) {
    return cleanedSource.replace(
      /<head([^>]*)>/i,
      `<head$1>${hasViewport ? '' : viewportTag}${previewSpacingStyle}`,
    );
  }

  if (/<html[^>]*>/i.test(cleanedSource)) {
    return cleanedSource.replace(
      /<html([^>]*)>/i,
      `<html$1><head>${hasViewport ? '' : viewportTag}${previewSpacingStyle}</head>`,
    );
  }

  return `<!DOCTYPE html><html><head>${viewportTag}${previewSpacingStyle}</head><body>${cleanedSource}</body></html>`;
};

const OrcamentoEditorModal: React.FC<OrcamentoEditorModalProps> = ({
  isOpen,
  onClose,
  assunto,
  htmlOrcamento,
  orcamentoId,
  atendimentoId,
  membroId,
  onHtmlSaved,
}) => {
  const [clientFields, setClientFields] = useState<EditorField[]>([]);
  const [itemsRows, setItemsRows] = useState<OrcamentoItemRow[]>([]);
  const [observacaoField, setObservacaoField] = useState<ObservacaoField>(
    buildDefaultObservacaoField(),
  );
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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const extractedClientFields = extractClientSectionFields(htmlOrcamento);
    const extractedItemsRows = extractItemsSectionRows(htmlOrcamento);
    const extractedObservacaoField = extractObservacaoField(htmlOrcamento);
    setClientFields(extractedClientFields);
    setItemsRows(extractedItemsRows);
    setObservacaoField(extractedObservacaoField);
    setExpandedClientFieldIds([]);
    setExpandedItemRowIds([]);
    setIsObservacaoFieldExpanded(false);
    setIsApproveConfirmationOpen(false);
    setActionFeedback(null);
    setActionError(null);
  }, [htmlOrcamento, isOpen]);

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

  const handleItemRowChange = (
    rowId: string,
    fieldKey: keyof Omit<OrcamentoItemRow, 'id'>,
    fieldValue: string | boolean,
  ) => {
    setItemsRows((currentRows) =>
      currentRows.map((row) => (row.id === rowId ? { ...row, [fieldKey]: fieldValue } : row)),
    );
  };

  const handleRemoveItemRow = (rowId: string) => {
    setItemsRows((currentRows) => currentRows.filter((row) => row.id !== rowId));
    setExpandedItemRowIds((currentIds) => currentIds.filter((currentId) => currentId !== rowId));
  };

  const handleAddItemRow = () => {
    const newItemRow = buildDefaultItemRow();
    setItemsRows((currentRows) => [...currentRows, newItemRow]);
    setExpandedItemRowIds((currentIds) => [...currentIds, newItemRow.id]);
  };

  const handleObservacaoChange = (texto: string) => {
    setObservacaoField((currentField) => ({ ...currentField, texto }));
  };

  const editedOrcamentoHtmlSource = useMemo(
    () =>
      applyObservacaoToOrcamentoHtml(
        applyItemsToOrcamentoHtml(
          applyClientFieldsToOrcamentoHtml(htmlOrcamento, clientFields),
          itemsRows,
        ),
        observacaoField,
      ),
    [clientFields, htmlOrcamento, itemsRows, observacaoField],
  );
  const orcamentoHtml = useMemo(
    () => buildOrcamentoPreviewHtml(editedOrcamentoHtmlSource),
    [editedOrcamentoHtmlSource],
  );
  const hasOrcamentoHtml = Boolean(orcamentoHtml);
  const canSaveHtml = Boolean(orcamentoId && editedOrcamentoHtmlSource.trim()) && !isSavingHtml;
  const canApproveOrcamento =
    Boolean(orcamentoId && atendimentoId && membroId) && !isApprovingOrcamento;

  const saveHtmlToDatabase = async () => {
    if (!orcamentoId || !editedOrcamentoHtmlSource.trim()) {
      throw new Error('Não foi possível identificar o HTML do orçamento para salvar.');
    }

    const { error } = await supabase
      .from('sales_orcamentos')
      .update({ html_orcamento: editedOrcamentoHtmlSource })
      .eq('orcamento_id', orcamentoId);

    if (error) {
      throw error;
    }

    onHtmlSaved(editedOrcamentoHtmlSource);
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
      await new Promise((resolve) => window.setTimeout(resolve, 5000));
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
    <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]">
      <button
        type="button"
        aria-label="Fechar visualizacao do orcamento"
        onClick={onClose}
        className="absolute inset-0"
      />

      <div className="relative z-10 flex h-screen w-screen flex-col overflow-hidden bg-[#F3F6FA]">
        <div className="flex items-center justify-between gap-4 border-b border-black/5 bg-white px-6 py-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
              Visualização do Orçamento
            </p>
            <h2 className="truncate text-lg font-semibold text-gray-900">
              {assunto || 'Cotação sem assunto'}
            </h2>
            {actionFeedback ? (
              <p className="mt-2 text-sm font-medium text-emerald-600">{actionFeedback}</p>
            ) : null}
            {actionError ? (
              <p className="mt-2 text-sm font-medium text-red-600">{actionError}</p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={handleSaveHtml}
              disabled={!canSaveHtml}
              className="inline-flex items-center justify-center rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 transition-colors hover:border-black/20 hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex items-center justify-center rounded-2xl bg-[#EBF57D] px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#dce86a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isApprovingOrcamento ? 'Aprovando...' : 'Aprovar e Enviar'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/10 bg-[#F8F8F8] text-gray-600 transition-colors hover:bg-[#F1F1F1] hover:text-gray-900"
              aria-label="Fechar modal do orçamento"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-b border-black/5 bg-white px-6 py-6 xl:border-b-0 xl:border-r">
            <div className="space-y-5">
              <div className="rounded-[28px] border border-black/10 bg-[#FAFBFC]">
                <button
                  type="button"
                  onClick={() => setIsClientSectionExpanded((currentValue) => !currentValue)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                  aria-expanded={isClientSectionExpanded}
                >
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900">
                      Informações do Cliente
                    </h3>
                  </div>

                  <div className="ml-4 flex shrink-0 items-center gap-3">
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-500">
                      {clientFields.length}
                    </span>
                    <span className="text-gray-400">
                      {isClientSectionExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </span>
                  </div>
                </button>

                {isClientSectionExpanded ? (
                  <div className="space-y-3 border-t border-black/8 px-4 pb-4 pt-4">
                    {clientFields.map((field) => {
                      const isExpanded = expandedClientFieldIds.includes(field.id);

                      return (
                        <div
                          key={field.id}
                          className="rounded-3xl border border-black/10 bg-white"
                        >
                          <button
                            type="button"
                            onClick={() => toggleClientFieldExpansion(field.id)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                            aria-expanded={isExpanded}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-gray-900">
                                {field.label}
                              </p>
                            </div>

                            <span className="shrink-0 text-gray-400">
                              {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            </span>
                          </button>

                          {isExpanded ? (
                            <div className="space-y-3 border-t border-black/8 px-4 pb-4 pt-3">
                              {field.isCustom ? (
                                <input
                                  type="text"
                                  value={field.label}
                                  onChange={(event) =>
                                    handleClientFieldLabelChange(field.id, event.target.value)
                                  }
                                  placeholder="Nome do campo"
                                  className="w-full rounded-2xl border border-black/10 bg-[#FAFBFC] px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition-colors focus:border-black/20"
                                />
                              ) : null}

                              <input
                                type="text"
                                value={field.value}
                                onChange={(event) =>
                                  handleClientFieldValueChange(field.id, event.target.value)
                                }
                                placeholder="Digite o valor"
                                className="w-full rounded-2xl border border-black/10 bg-[#FAFBFC] px-3 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-black/20"
                              />

                              <button
                                type="button"
                                onClick={() => handleRemoveClientField(field.id)}
                                className="inline-flex items-center justify-center rounded-full border border-black/10 bg-[#FAFBFC] px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-black/20 hover:text-gray-900"
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
                      className="inline-flex w-full items-center justify-center rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-gray-900 transition-colors hover:border-black/20 hover:bg-[#FAFAFA]"
                    >
                      Adicionar informação
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="rounded-[28px] border border-black/10 bg-[#FAFBFC]">
                <button
                  type="button"
                  onClick={() => setIsItemsSectionExpanded((currentValue) => !currentValue)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                  aria-expanded={isItemsSectionExpanded}
                >
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900">Itens do Pedido</h3>
                  </div>

                  <div className="ml-4 flex shrink-0 items-center gap-3">
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-500">
                      {itemsRows.length}
                    </span>
                    <span className="text-gray-400">
                      {isItemsSectionExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </span>
                  </div>
                </button>

                {isItemsSectionExpanded ? (
                  <div className="space-y-3 border-t border-black/8 px-4 pb-4 pt-4">
                    {itemsRows.map((itemRow, index) => {
                      const isExpanded = expandedItemRowIds.includes(itemRow.id);
                      const itemLabel = itemRow.nome.trim() || `Item ${index + 1}`;

                      return (
                        <div
                          key={itemRow.id}
                          className="rounded-3xl border border-black/10 bg-white"
                        >
                          <button
                            type="button"
                            onClick={() => toggleItemRowExpansion(itemRow.id)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                            aria-expanded={isExpanded}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-gray-900">
                                {itemLabel}
                              </p>
                            </div>

                            <span className="shrink-0 text-gray-400">
                              {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            </span>
                          </button>

                          {isExpanded ? (
                            <div className="space-y-3 border-t border-black/8 px-4 pb-4 pt-3">
                              {(Object.keys(ITEM_FIELD_LABELS) as Array<
                                Exclude<keyof OrcamentoItemRow, 'id' | 'itemId'>
                              >).map((fieldKey) => (
                                <div key={fieldKey} className="space-y-1.5">
                                  <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                                    {ITEM_FIELD_LABELS[fieldKey]}
                                  </label>

                                  {fieldKey === 'disponivel' ? (
                                    <select
                                      value={itemRow.disponivel ? 'true' : 'false'}
                                      onChange={(event) =>
                                        handleItemRowChange(
                                          itemRow.id,
                                          fieldKey,
                                          event.target.value === 'true',
                                        )
                                      }
                                      className="w-full rounded-2xl border border-black/10 bg-[#FAFBFC] px-3 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-black/20"
                                    >
                                      <option value="true">Disponível</option>
                                      <option value="false">Indisponível</option>
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      value={String(itemRow[fieldKey] || '')}
                                      onChange={(event) =>
                                        handleItemRowChange(itemRow.id, fieldKey, event.target.value)
                                      }
                                      placeholder="Digite o valor"
                                      className="w-full rounded-2xl border border-black/10 bg-[#FAFBFC] px-3 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-black/20"
                                    />
                                  )}
                                </div>
                              ))}

                              <button
                                type="button"
                                onClick={() => handleRemoveItemRow(itemRow.id)}
                                className="inline-flex items-center justify-center rounded-full border border-black/10 bg-[#FAFBFC] px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-black/20 hover:text-gray-900"
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
                      className="inline-flex w-full items-center justify-center rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-gray-900 transition-colors hover:border-black/20 hover:bg-[#FAFAFA]"
                    >
                      Adicionar linha
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="rounded-[28px] border border-black/10 bg-[#FAFBFC]">
                <button
                  type="button"
                  onClick={() => setIsObservacaoSectionExpanded((currentValue) => !currentValue)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                  aria-expanded={isObservacaoSectionExpanded}
                >
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900">Observação</h3>
                  </div>

                  <div className="ml-4 flex shrink-0 items-center gap-3">
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-500">
                      1
                    </span>
                    <span className="text-gray-400">
                      {isObservacaoSectionExpanded ? (
                        <ChevronDown size={18} />
                      ) : (
                        <ChevronRight size={18} />
                      )}
                    </span>
                  </div>
                </button>

                {isObservacaoSectionExpanded ? (
                  <div className="space-y-3 border-t border-black/8 px-4 pb-4 pt-4">
                    <div className="rounded-3xl border border-black/10 bg-white">
                      <button
                        type="button"
                        onClick={() => setIsObservacaoFieldExpanded((currentValue) => !currentValue)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                        aria-expanded={isObservacaoFieldExpanded}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">Texto</p>
                        </div>

                        <span className="shrink-0 text-gray-400">
                          {isObservacaoFieldExpanded ? (
                            <ChevronDown size={18} />
                          ) : (
                            <ChevronRight size={18} />
                          )}
                        </span>
                      </button>

                      {isObservacaoFieldExpanded ? (
                        <div className="space-y-3 border-t border-black/8 px-4 pb-4 pt-3">
                          <textarea
                            value={observacaoField.texto}
                            onChange={(event) => handleObservacaoChange(event.target.value)}
                            rows={6}
                            placeholder="Digite o texto da observação"
                            className="w-full resize-y rounded-2xl border border-black/10 bg-[#FAFBFC] px-3 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-black/20"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>

          <section className="min-h-0 overflow-auto bg-[#F7F8FA] p-5 pb-8">
            {hasOrcamentoHtml ? (
              <div className="flex min-h-full w-full overflow-auto rounded-[24px] border border-black/10 bg-white p-6 pb-10">
                <div className="mx-auto flex w-full min-w-[860px] max-w-[860px] justify-center pb-8">
                  <iframe
                    title="Visualização do orçamento"
                    srcDoc={orcamentoHtml}
                    className="h-[1160px] w-[820px] flex-none border border-black/10 bg-white"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-[22px] border border-dashed border-black/10 bg-white px-6 text-center">
                <p className="text-sm font-medium text-gray-500">
                  Nenhum HTML de orçamento foi encontrado para esta cotação.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {isApproveConfirmationOpen ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Aprovar Orçamento</h3>
              {isApprovingOrcamento ? (
                <div className="mt-4 space-y-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-[#EBF57D]" />
                  </div>
                  <p className="text-sm leading-6 text-gray-600">
                    Enviando o orçamento. Aguarde alguns segundos enquanto finalizamos o envio.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  Tem certeza que deseja aprovar este orçamento? O e-mail será enviado para o
                  cliente.
                </p>
              )}
            </div>

            {!isApprovingOrcamento ? (
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsApproveConfirmationOpen(false)}
                  className="inline-flex items-center justify-center rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:border-black/20 hover:bg-[#FAFAFA]"
                >
                  Não
                </button>

                <button
                  type="button"
                  onClick={handleApproveOrcamento}
                  disabled={isApprovingOrcamento}
                  className="inline-flex items-center justify-center rounded-2xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Sim
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default OrcamentoEditorModal;
