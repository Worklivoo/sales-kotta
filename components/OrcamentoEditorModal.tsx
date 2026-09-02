import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Package, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface BlankOrcamentoEmpresaInfo {
  logoUrl: string | null;
  razaoSocial: string | null;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
}

interface OrcamentoEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  assunto: string | null;
  htmlOrcamento: string | null;
  numeroTicket: string | null;
  empresaId: string | null;
  empresaInfo: BlankOrcamentoEmpresaInfo | null;
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
  produtoId: string | null;
  isManuallyAdded: boolean;
  nome: string;
  quantidade: string;
  sku: string;
  descricao: string;
  ncm: string;
  previsaoEntrega: string;
  valorUnitario: string;
  valorTotal: string;
  disponivel: boolean;
}

interface ProdutoOption {
  produto_id: string;
  codigo_sku: string | null;
  nome: string;
  descricao: string | null;
  preco_venda: number | null;
  unidade_medida: string | null;
}

interface ObservacaoField {
  id: string;
  texto: string;
}

interface CurrencySignature {
  marker: string;
  position: 'prefix' | 'suffix';
}

const CLIENT_FIELD_ORDER = ['razao_social', 'cnpj_cpf', 'email', 'telefone'] as const;

const CLIENT_FIELD_LABELS: Record<(typeof CLIENT_FIELD_ORDER)[number], string> = {
  razao_social: 'Razão Social',
  cnpj_cpf: 'CNPJ/CPF',
  email: 'Email',
  telefone: 'Telefone',
};

const CLIENT_HTML_LABELS: Record<(typeof CLIENT_FIELD_ORDER)[number], string> = {
  razao_social: 'Razão Social:',
  cnpj_cpf: 'CNPJ/CPF:',
  email: 'Email:',
  telefone: 'Telefone:',
};

const APROVACAO_WEBHOOK_URL =
  'https://primary-production-23d76b.up.railway.app/webhook/aprovar-orcamento-v2';

const ITEM_FIELD_LABELS: Record<
  Exclude<keyof OrcamentoItemRow, 'id' | 'itemId' | 'produtoId' | 'isManuallyAdded'>,
  string
> = {
  nome: 'Nome',
  quantidade: 'Quantidade',
  sku: 'SKU',
  descricao: 'Descrição',
  ncm: 'NCM',
  previsaoEntrega: 'Previsão de Entrega',
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

const BOM_PATTERN = new RegExp(String.fromCharCode(0xfeff));
const NBSP_PATTERN = new RegExp(String.fromCharCode(0xa0), 'g');
const NULL_CHAR_PATTERN = new RegExp(String.fromCharCode(0), 'g');
const COMBINING_MARKS_PATTERN = /[̀-ͯ]/g;

const stripLeadingBom = (value: string) => value.replace(BOM_PATTERN, '');
const stripNbsp = (value: string) => value.replace(NBSP_PATTERN, ' ');

const normalizeHtmlSource = (value: string | null) => {
  if (!value) {
    return '';
  }

  const normalizedValue = stripLeadingBom(value).trim();

  if (!normalizedValue) {
    return '';
  }

  try {
    const parsedValue = JSON.parse(normalizedValue);

    if (typeof parsedValue === 'string') {
      return stripLeadingBom(parsedValue).trim();
    }

    if (Array.isArray(parsedValue)) {
      const firstHtmlEntry = parsedValue.find((item): item is string => typeof item === 'string');
      return firstHtmlEntry ? stripLeadingBom(firstHtmlEntry).trim() : normalizedValue;
    }
  } catch {
    // Mantem o valor original quando nao for JSON valido.
  }

  return normalizedValue;
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
    .replace(COMBINING_MARKS_PATTERN, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const decodeInlineHtmlText = (value: string) => {
  if (!value) {
    return '';
  }

  if (typeof DOMParser === 'undefined') {
    return stripNbsp(
      value
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/<\/?[^>]+>/g, ''),
    ).trim();
  }

  const documentNode = new DOMParser().parseFromString(value, 'text/html');
  return stripNbsp(documentNode.body.textContent || '').trim();
};

const decodeInlineHtmlMultilineText = (value: string) =>
  decodeInlineHtmlText(value.replace(/<br\s*\/?>/gi, '\n')).replace(/\n{3,}/g, '\n\n');

const isDashLikeValue = (value: string) => /^[-—–\s]*$/.test(stripNbsp(value).trim());

const formatMultilineHtmlValue = (value: string) =>
  escapeHtmlValue(value.trim()).replace(/\r?\n/g, '<br>');

const ensureCellCount = (documentNode: Document, rowElement: HTMLTableRowElement, count: number) => {
  const cells = Array.from(rowElement.querySelectorAll('td')) as HTMLTableCellElement[];

  while (cells.length < count) {
    const newCell = documentNode.createElement('td');
    rowElement.append(newCell);
    cells.push(newCell);
  }

  return cells.slice(0, count);
};

const setFieldElementContent = (
  documentNode: Document,
  fieldElement: HTMLElement,
  label: string,
  value: string,
) => {
  fieldElement.innerHTML = '';

  const strongElement = documentNode.createElement('strong');
  strongElement.textContent = label;
  fieldElement.append(strongElement);

  if (value.trim()) {
    fieldElement.append(documentNode.createTextNode(` ${value.trim()}`));
  }
};

const parseCurrencyValue = (value: string) => {
  const normalizedValue = stripNbsp(value).trim();

  if (!normalizedValue || isDashLikeValue(normalizedValue)) {
    return null;
  }

  const digitsOnlyValue = normalizedValue.replace(/[^\d,.-]/g, '').trim();

  if (!digitsOnlyValue) {
    return null;
  }

  const normalizedNumber = digitsOnlyValue.includes(',')
    ? digitsOnlyValue.replace(/\./g, '').replace(',', '.')
    : digitsOnlyValue;
  const parsedValue = Number(normalizedNumber);

  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const extractCurrencySignature = (value: string): CurrencySignature | null => {
  const normalizedValue = stripNbsp(value).trim();

  if (!normalizedValue || isDashLikeValue(normalizedValue)) {
    return null;
  }

  const prefixMatch = normalizedValue.match(/^[^\d-]+/);

  if (prefixMatch?.[0]?.trim()) {
    return {
      marker: prefixMatch[0].trim(),
      position: 'prefix',
    };
  }

  const suffixMatch = normalizedValue.match(/[^\d.,-]+$/);

  if (suffixMatch?.[0]?.trim()) {
    return {
      marker: suffixMatch[0].trim(),
      position: 'suffix',
    };
  }

  return null;
};

const formatMonetaryValue = (value: number, currencySignature: CurrencySignature) => {
  const formattedNumber = value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const nbsp = String.fromCharCode(0xa0);

  return currencySignature.position === 'suffix'
    ? `${formattedNumber}${nbsp}${currencySignature.marker}`
    : `${currencySignature.marker}${nbsp}${formattedNumber}`;
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
  produtoId: null,
  isManuallyAdded: true,
  nome: '',
  quantidade: '1',
  sku: '',
  descricao: '',
  ncm: '',
  previsaoEntrega: '',
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
  const htmlSource = normalizeHtmlSource(value);

  if (!htmlSource || typeof DOMParser === 'undefined') {
    return defaultFields;
  }

  const extractedValues = new Map<string, string>();
  const customFields: EditorField[] = [];
  const documentNode = new DOMParser().parseFromString(htmlSource, 'text/html');
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
    } else if (label || valueOnly) {
      customFields.push({
        id: buildFieldId('custom-client'),
        key: `custom_${customFields.length + 1}`,
        label: label || 'Novo campo',
        value: valueOnly,
        isCustom: true,
      });
    }
  });

  return [
    ...defaultFields.map((field) => ({
      ...field,
      value: extractedValues.get(field.key) || '',
    })),
    ...customFields,
  ];
};

const extractItemsSectionRows = (value: string | null) => {
  const htmlSource = normalizeHtmlSource(value);

  if (!htmlSource || typeof DOMParser === 'undefined') {
    return [] as OrcamentoItemRow[];
  }

  const documentNode = new DOMParser().parseFromString(htmlSource, 'text/html');
  const rowElements = Array.from(documentNode.querySelectorAll('table.itens-pedido tbody tr'));

  return rowElements.map((rowElement, index) => {
    const cells = Array.from(rowElement.querySelectorAll('td'));
    const descricaoHtml = cells[3]?.innerHTML || '';
    const descricaoText = decodeInlineHtmlText(descricaoHtml || cells[3]?.textContent || '');
    const primeiroCampoHtml = cells[0]?.innerHTML || cells[0]?.textContent || '';
    const primeiroCampoPartes = primeiroCampoHtml
      .split(/<br\s*\/?>/i)
      .map((part) => decodeInlineHtmlText(part))
      .filter(Boolean);
    const itemId =
      rowElement.getAttribute('data-item-id') ||
      rowElement.getAttribute('data-itemid') ||
      String(index + 1);
    const skuDaPrimeiraColuna = primeiroCampoPartes
      .map((part) => {
        const match = part.match(/^SKU:\s*(.*)$/i);
        return match ? match[1].trim() : null;
      })
      .find((part): part is string => Boolean(part));
    const isLinhaIndisponivel =
      rowElement.classList.contains('indisponivel-row') || /indispon/i.test(descricaoText);
    const nomeText =
      primeiroCampoPartes.find((part) => !/^SKU:\s*/i.test(part)) ||
      decodeInlineHtmlText(primeiroCampoHtml);
    const skuText = decodeInlineHtmlText(cells[2]?.textContent || '');
    const hasNewItemsLayout = cells.length >= 8;

    return {
      id: buildFieldId(`item-row-${index}`),
      itemId,
      produtoId: null,
      isManuallyAdded: false,
      nome: nomeText,
      quantidade: decodeInlineHtmlText(cells[1]?.textContent || ''),
      sku:
        isLinhaIndisponivel && skuDaPrimeiraColuna && isDashLikeValue(skuText)
          ? skuDaPrimeiraColuna
          : skuText,
      descricao: descricaoText,
      ncm: decodeInlineHtmlText(cells[4]?.textContent || ''),
      previsaoEntrega: hasNewItemsLayout
        ? decodeInlineHtmlMultilineText(cells[5]?.innerHTML || cells[5]?.textContent || '')
        : '',
      valorUnitario: decodeInlineHtmlText(
        cells[hasNewItemsLayout ? 6 : 5]?.textContent || '',
      ),
      valorTotal: decodeInlineHtmlText(cells[hasNewItemsLayout ? 7 : 6]?.textContent || ''),
      disponivel: !isLinhaIndisponivel,
    };
  });
};

const extractObservacaoField = (value: string | null) => {
  const defaultField = buildDefaultObservacaoField();
  const htmlSource = normalizeHtmlSource(value);

  if (!htmlSource || typeof DOMParser === 'undefined') {
    return defaultField;
  }

  const documentNode = new DOMParser().parseFromString(htmlSource, 'text/html');
  const observacaoParagraph = documentNode.querySelector('.observacoes p');

  return {
    ...defaultField,
    texto: decodeInlineHtmlText(observacaoParagraph?.textContent || ''),
  };
};

const applyClientFieldsToOrcamentoHtml = (value: string | null, fields: EditorField[]) => {
  const htmlSource = normalizeHtmlSource(value);

  if (!htmlSource || fields.length === 0 || typeof DOMParser === 'undefined') {
    return htmlSource;
  }

  const documentNode = new DOMParser().parseFromString(htmlSource, 'text/html');
  const clientSection = documentNode.querySelector('.info-cliente');

  if (!clientSection) {
    return htmlSource;
  }

  const existingFieldElements = Array.from(clientSection.querySelectorAll('.campo')) as HTMLElement[];
  const templateFieldElement = existingFieldElements[0] || documentNode.createElement('div');
  const titleElement = clientSection.querySelector('h3');
  const desiredFields = fields.filter((field) => field.label.trim() || field.value.trim());
  let insertionAnchor: ChildNode | null = titleElement;

  existingFieldElements.forEach((fieldElement) => fieldElement.remove());

  desiredFields.forEach((field, index) => {
    const fieldElement = (
      existingFieldElements[index]?.cloneNode(true) ||
      templateFieldElement.cloneNode(true)
    ) as HTMLElement;

    fieldElement.className = fieldElement.className || 'campo';

    const htmlLabel = field.isCustom
      ? `${field.label.trim() || 'Novo campo'}:`
      : CLIENT_HTML_LABELS[field.key as keyof typeof CLIENT_HTML_LABELS] || `${field.label.trim()}:`;

    setFieldElementContent(documentNode, fieldElement, htmlLabel, field.value);

    if (insertionAnchor?.parentNode === clientSection) {
      const spacingNode = documentNode.createTextNode('\n    ');
      insertionAnchor.parentNode.insertBefore(spacingNode, insertionAnchor.nextSibling);
      insertionAnchor.parentNode.insertBefore(fieldElement, spacingNode.nextSibling);
      insertionAnchor = fieldElement;
    } else {
      clientSection.append(fieldElement);
      insertionAnchor = fieldElement;
    }
  });

  return serializeHtmlDocument(documentNode);
};

const applyItemsToOrcamentoHtml = (value: string | null, items: OrcamentoItemRow[]) => {
  const htmlSource = normalizeHtmlSource(value);

  if (!htmlSource || typeof DOMParser === 'undefined') {
    return htmlSource;
  }

  const documentNode = new DOMParser().parseFromString(htmlSource, 'text/html');
  const tbodyElement = documentNode.querySelector('table.itens-pedido tbody');

  if (!tbodyElement) {
    return htmlSource;
  }

  const existingRows = Array.from(tbodyElement.querySelectorAll('tr')) as HTMLTableRowElement[];
  const fallbackRowTemplate =
    existingRows[0] || (documentNode.createElement('tr') as HTMLTableRowElement);
  const newRowsFragment = documentNode.createDocumentFragment();

  items.forEach((item, index) => {
    const sourceRow =
      existingRows[index] ||
      existingRows.find((row) =>
        item.disponivel ? !row.classList.contains('indisponivel-row') : row.classList.contains('indisponivel-row'),
      ) ||
      fallbackRowTemplate;
    const rowElement = sourceRow.cloneNode(true) as HTMLTableRowElement;
    const cells = ensureCellCount(documentNode, rowElement, 8);

    rowElement.setAttribute('data-item-id', item.itemId);
    rowElement.classList.toggle('indisponivel-row', !item.disponivel);

    if (item.disponivel) {
      cells[0].innerHTML = escapeHtmlValue(item.nome);
      cells[2].textContent = item.sku;
      cells[3].textContent = item.descricao;
    } else {
      const nomeBase = item.nome.trim() || 'Item';
      const skuBase = item.sku.trim() || '—';
      cells[0].innerHTML = `${escapeHtmlValue(nomeBase)}<br>SKU: ${escapeHtmlValue(skuBase)}`;
      cells[2].textContent = '—';
      cells[3].innerHTML = `<span class="badge-indisponivel">${escapeHtmlValue(
        item.descricao.trim() || 'Indisponível',
      )}</span>`;
    }

    cells[1].textContent = item.quantidade;
    cells[1].style.textAlign = 'center';
    cells[4].textContent = item.ncm;
    cells[5].innerHTML = formatMultilineHtmlValue(item.previsaoEntrega);
    cells[5].classList.add('col-previsao');
    cells[6].style.textAlign = 'right';
    cells[6].textContent = item.valorUnitario;
    cells[7].style.textAlign = 'right';
    cells[7].style.fontWeight = 'bold';
    cells[7].textContent = item.valorTotal;

    newRowsFragment.append(rowElement);
  });

  tbodyElement.innerHTML = '';
  tbodyElement.append(newRowsFragment);

  const totalCell = documentNode.querySelector('table.itens-pedido tfoot td:last-child');
  const totalValues = items
    .map((item) => ({
      parsedValue: parseCurrencyValue(item.valorTotal),
      currencySignature: extractCurrencySignature(item.valorTotal),
    }))
    .filter(
      (item): item is { parsedValue: number; currencySignature: CurrencySignature } =>
        item.parsedValue !== null && Boolean(item.currencySignature),
    );

  const uniqueCurrencySignatures = new Set(
    totalValues.map(
      (item) => `${item.currencySignature.position}:${item.currencySignature.marker}`,
    ),
  );

  if (totalCell && totalValues.length > 0 && uniqueCurrencySignatures.size === 1) {
    const currencySignature = totalValues[0].currencySignature;
    const totalValue = totalValues.reduce((currentTotal, item) => currentTotal + item.parsedValue, 0);
    totalCell.textContent = formatMonetaryValue(totalValue, currencySignature);
  } else if (totalCell && totalValues.length > 0) {
    totalCell.textContent = '—';
  }

  return serializeHtmlDocument(documentNode);
};

const applyObservacaoToOrcamentoHtml = (value: string | null, observacao: ObservacaoField) => {
  const htmlSource = normalizeHtmlSource(value);

  if (!htmlSource || typeof DOMParser === 'undefined') {
    return htmlSource;
  }

  const documentNode = new DOMParser().parseFromString(htmlSource, 'text/html');
  const observacoesSection = documentNode.querySelector('.observacoes');

  if (!observacoesSection) {
    return htmlSource;
  }

  const observacaoParagraph =
    observacoesSection.querySelector('p') || documentNode.createElement('p');

  observacaoParagraph.textContent = observacao.texto.trim();

  if (!observacaoParagraph.parentElement) {
    observacoesSection.append(observacaoParagraph);
  }

  return serializeHtmlDocument(documentNode);
};

const buildOrcamentoPreviewHtml = (value: string | null) => {
  const htmlSource = normalizeHtmlSource(value);

  if (!htmlSource) {
    return '';
  }

  const normalizedSource = htmlSource.replace(NULL_CHAR_PATTERN, '').trim();

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

const buildBlankOrcamentoHtml = (
  numeroTicket: string | null,
  empresa: BlankOrcamentoEmpresaInfo | null,
  dataEmissao: string,
) => {
  const empresaLogo = empresa?.logoUrl || '';
  const empresaNome = empresa?.razaoSocial || '';
  const empresaCnpj = empresa?.cnpj || '';
  const empresaEmail = empresa?.email || '';
  const empresaTelefone = empresa?.telefone || '';

  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    "@page { size: A4; margin: 15mm; }" +
    "body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 0; font-size: 12px; }" +
    '.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px; }' +
    '.header-logo img { max-width: 120px; max-height: 70px; object-fit: contain; }' +
    '.header-empresa { flex: 1; margin-left: 20px; font-size: 11px; color: #475569; line-height: 1.5; }' +
    '.header-empresa strong { display: block; font-size: 14px; color: #0f172a; margin-bottom: 3px; }' +
    '.header-orcamento { text-align: right; min-width: 160px; }' +
    '.header-orcamento h1 { margin: 0 0 4px 0; font-size: 20px; color: #0f172a; }' +
    '.header-orcamento p { margin: 0; color: #64748b; font-size: 12px; }' +
    '.header-orcamento .atendimento-id { font-weight: normal; color: #94a3b8; font-size: 11px; margin-top: 4px; }' +
    '.info-cliente { margin-bottom: 20px; }' +
    '.info-cliente h3 { margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }' +
    '.info-cliente .campo { font-size: 11px; color: #1e293b; margin: 3px 0; }' +
    '.info-cliente .campo strong { color: #475569; font-weight: 600; margin-right: 4px; }' +
    '.section-title { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 0 0 8px 0; }' +
    'table.itens-pedido { width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 15px; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); font-size: 9.5px; }' +
    'table.itens-pedido thead th { background: #e2e8f0; color: #334155; padding: 5px 4px; font-weight: 600; font-size: 8px; text-transform: uppercase; letter-spacing: 0.2px; text-align: left; line-height: 1.1; }' +
    'table.itens-pedido tbody td { padding: 5px 4px; font-size: 9px; color: #1e293b; border-bottom: 1px solid #f1f5f9; vertical-align: middle; line-height: 1.2; word-wrap: break-word; overflow: visible; }' +
    'table.itens-pedido tbody tr:nth-child(even) { background: #f8fafc; }' +
    'table.itens-pedido tfoot td { padding: 6px 4px; font-size: 9.5px; font-weight: bold; color: #0f172a; border-top: 2px solid #cbd5e1; white-space: nowrap; }' +
    '.col-previsao { font-size: 8px !important; line-height: 1.15 !important; }' +
    '.observacoes { margin-top: 10px; font-size: 10px; color: #475569; line-height: 1.5; }' +
    '.observacoes h3 { margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }' +
    '.footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }' +
    '</style></head><body>' +
    '<div class="header">' +
    '<div class="header-logo">' +
    (empresaLogo ? '<img src="' + empresaLogo + '" alt="Logo">' : '') +
    '</div>' +
    '<div class="header-empresa">' +
    '<strong>' + empresaNome + '</strong>' +
    (empresaCnpj ? 'CNPJ: ' + empresaCnpj + '<br>' : '') +
    (empresaEmail ? empresaEmail + '<br>' : '') +
    (empresaTelefone ? empresaTelefone : '') +
    '</div>' +
    '<div class="header-orcamento">' +
    '<h1>ORÇAMENTO</h1>' +
    ('<p>Data de emissão: ' + dataEmissao + '</p>') +
    (numeroTicket ? '<p class="atendimento-id">Nº ' + numeroTicket + '</p>' : '') +
    '</div>' +
    '</div>' +
    '<div class="info-cliente">' +
    '<h3>Informações do cliente:</h3>' +
    '<div class="campo"><strong>Razão Social:</strong> </div>' +
    '<div class="campo"><strong>CNPJ/CPF:</strong> </div>' +
    '<div class="campo"><strong>Email:</strong> </div>' +
    '<div class="campo"><strong>Telefone:</strong> </div>' +
    '</div>' +
    '<p class="section-title">Itens do Pedido</p>' +
    '<table class="itens-pedido"><thead><tr>' +
    '<th style="width: 14%;">Solicitado</th>' +
    '<th style="width: 6%; text-align: center;">Qtd.</th>' +
    '<th style="width: 11%;">SKU</th>' +
    '<th style="width: 21%;">Descrição</th>' +
    '<th style="width: 7%;">NCM</th>' +
    '<th style="width: 15%;">Prev. entrega</th>' +
    '<th style="width: 13%; text-align: right;">Val. Unit.</th>' +
    '<th style="width: 13%; text-align: right;">Val. Total</th>' +
    '</tr></thead><tbody></tbody>' +
    '<tfoot><tr><td colspan="7" style="text-align: right;">Total:</td>' +
    '<td style="text-align: right; font-weight: bold;">—</td></tr></tfoot>' +
    '</table>' +
    '<div class="observacoes"><h3>Observações</h3><p></p></div>' +
    '<div class="footer"><strong>' + empresaNome + '</strong></div>' +
    '</body></html>'
  );
};

const formatProdutoPreco = (produto: ProdutoOption) => {
  if (produto.preco_venda == null) {
    return null;
  }

  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    produto.preco_venda,
  );
};

const OrcamentoEditorModal: React.FC<OrcamentoEditorModalProps> = ({
  isOpen,
  onClose,
  assunto,
  htmlOrcamento,
  numeroTicket,
  empresaId,
  empresaInfo,
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
  const [wasOpen, setWasOpen] = useState(false);
  const [lastSyncedHtml, setLastSyncedHtml] = useState<string | null>(null);
  const [productSearchRowId, setProductSearchRowId] = useState<string | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productResults, setProductResults] = useState<ProdutoOption[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);

  const isBlankOrcamento = !normalizeHtmlSource(htmlOrcamento).trim();
  // Congelado no primeiro render: se recalculado a cada render, o timestamp muda quando o
  // relogio vira o minuto, o que quebraria a comparacao de sincronizacao abaixo e descartaria
  // edicoes em andamento do usuario.
  const [blankOrcamentoDataEmissao] = useState(() =>
    new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  );
  const effectiveHtmlOrcamento = isBlankOrcamento
    ? buildBlankOrcamentoHtml(numeroTicket, empresaInfo, blankOrcamentoDataEmissao)
    : htmlOrcamento;

  // Sincroniza o estado do editor a partir do HTML fonte durante a renderizacao (nao em useEffect),
  // para nunca pintar um frame intermediario com a tabela de itens vazia antes da extracao concluir.
  if (isOpen && (!wasOpen || effectiveHtmlOrcamento !== lastSyncedHtml)) {
    setWasOpen(true);
    setLastSyncedHtml(effectiveHtmlOrcamento);
    setClientFields(extractClientSectionFields(effectiveHtmlOrcamento));
    setItemsRows(extractItemsSectionRows(effectiveHtmlOrcamento));
    setObservacaoField(extractObservacaoField(effectiveHtmlOrcamento));
    setExpandedClientFieldIds([]);
    setExpandedItemRowIds([]);
    setIsObservacaoFieldExpanded(false);
    setIsApproveConfirmationOpen(false);
    setActionFeedback(null);
    setActionError(null);
    setProductSearchRowId(null);
    setProductSearchQuery('');
    setProductResults([]);
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

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
        .select('produto_id, codigo_sku, nome, descricao, preco_venda, unidade_medida')
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

  const handleItemRowChange = (
    rowId: string,
    fieldKey: keyof Omit<OrcamentoItemRow, 'id' | 'itemId' | 'produtoId' | 'isManuallyAdded'>,
    fieldValue: string | boolean,
  ) => {
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
    setItemsRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              produtoId: produto.produto_id,
              nome: produto.nome,
              sku: produto.codigo_sku || '',
              descricao: produto.descricao || row.descricao,
              valorUnitario: formatProdutoPreco(produto) || row.valorUnitario,
            }
          : row,
      ),
    );
    setProductSearchRowId(null);
    setProductSearchQuery('');
    setProductResults([]);
  };

  const handleObservacaoChange = (texto: string) => {
    setObservacaoField((currentField) => ({ ...currentField, texto }));
  };

  const editedOrcamentoHtmlSource = useMemo(
    () =>
      applyObservacaoToOrcamentoHtml(
        applyItemsToOrcamentoHtml(
          applyClientFieldsToOrcamentoHtml(effectiveHtmlOrcamento, clientFields),
          itemsRows,
        ),
        observacaoField,
      ),
    [clientFields, effectiveHtmlOrcamento, itemsRows, observacaoField],
  );
  const orcamentoHtml = useMemo(
    () => buildOrcamentoPreviewHtml(editedOrcamentoHtmlSource),
    [editedOrcamentoHtmlSource],
  );
  const hasOrcamentoHtml = Boolean(orcamentoHtml);
  const hasUnlinkedManualItem = itemsRows.some((row) => row.isManuallyAdded && !row.produtoId);
  const canSaveHtml =
    Boolean(orcamentoId && editedOrcamentoHtmlSource.trim()) && !isSavingHtml && !hasUnlinkedManualItem;
  const canApproveOrcamento =
    Boolean(orcamentoId && atendimentoId && membroId) && !isApprovingOrcamento && !hasUnlinkedManualItem;

  const saveHtmlToDatabase = async () => {
    if (!orcamentoId || !editedOrcamentoHtmlSource.trim()) {
      throw new Error('Não foi possível identificar o HTML do orçamento para salvar.');
    }

    const { error } = await supabase
      .from('sales_orcamentos_v2')
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
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] font-sans">
      <button
        type="button"
        aria-label="Fechar visualizacao do orcamento"
        onClick={onClose}
        className="absolute inset-0"
      />

      <div className="relative z-10 flex h-screen w-screen flex-col overflow-hidden bg-paper">
        <div className="flex items-center justify-between gap-4 border-b border-line-soft bg-card px-6 py-5">
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

          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={handleSaveHtml}
              disabled={!canSaveHtml}
              className="inline-flex h-11 items-center justify-center rounded-[9px] border border-line bg-card px-4 text-[13px] text-ink transition-colors hover:bg-stone disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex h-11 items-center justify-center rounded-[9px] bg-lime px-4 text-[13px] text-ink transition-colors hover:bg-lime-deep disabled:cursor-not-allowed disabled:opacity-50"
              style={{ fontWeight: 700, transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
            >
              {isApprovingOrcamento ? 'Aprovando...' : 'Aprovar e Enviar'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border border-line bg-card text-muted transition-colors hover:text-ink"
              style={{ transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
              aria-label="Fechar modal do orçamento"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {isBlankOrcamento ? (
          <div className="flex items-start gap-3 border-b border-red-100 bg-red-50 px-6 py-3.5">
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

        {hasUnlinkedManualItem ? (
          <div className="flex items-start gap-3 border-b border-line-soft bg-stone px-6 py-3">
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
          <aside className="min-h-0 overflow-y-auto border-b border-line-soft bg-card px-5 py-6 xl:border-b-0 xl:border-r">
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

                              {(Object.keys(ITEM_FIELD_LABELS) as Array<
                                Exclude<keyof OrcamentoItemRow, 'id' | 'itemId' | 'produtoId' | 'isManuallyAdded'>
                              >)
                                .filter((fieldKey) => fieldKey !== 'nome' || !itemRow.isManuallyAdded)
                                .filter((fieldKey) => fieldKey !== 'sku' || !itemRow.isManuallyAdded)
                                .map((fieldKey) => (
                                  <div key={fieldKey} className="space-y-1.5">
                                    <label
                                      className="block text-[10.5px] text-muted-soft"
                                      style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                                    >
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
                                        className="w-full rounded-[9px] border border-line bg-paper px-3 py-2 text-[12.5px] text-ink outline-none transition-colors focus:border-ink"
                                        style={{ fontWeight: 500, transitionDuration: '.22s' }}
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
                                        className="w-full rounded-[9px] border border-line bg-paper px-3 py-2 text-[12.5px] text-ink outline-none transition-colors focus:border-ink"
                                        style={{ fontWeight: 500, transitionDuration: '.22s' }}
                                      />
                                    )}
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
                            value={observacaoField.texto}
                            onChange={(event) => handleObservacaoChange(event.target.value)}
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

          <section className="min-h-0 overflow-auto bg-stone p-5 pb-8">
            {hasOrcamentoHtml ? (
              <div className="flex min-h-full w-full overflow-auto rounded-panel border border-line-soft bg-card p-6 pb-10">
                <div className="mx-auto flex w-full min-w-[860px] max-w-[860px] justify-center pb-8">
                  <iframe
                    title="Visualização do orçamento"
                    srcDoc={orcamentoHtml}
                    className="h-[1160px] w-[820px] flex-none border border-line bg-white"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-panel border border-dashed border-line bg-card px-6 text-center">
                <p className="text-[13px] text-muted" style={{ fontWeight: 500 }}>
                  Nenhum HTML de orçamento foi encontrado para esta cotação.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {isApproveConfirmationOpen ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 px-4">
          <div
            className="w-full max-w-md rounded-panel border border-line-soft bg-card p-6"
            style={{ boxShadow: '0 28px 80px -34px rgba(20,20,20,.45)' }}
          >
            <div>
              <h3 className="text-[18px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.01em' }}>
                Aprovar Orçamento
              </h3>
              {isApprovingOrcamento ? (
                <div className="mt-4 space-y-3">
                  <div className="h-2 w-full overflow-hidden rounded-pill bg-stone">
                    <div className="h-full w-1/3 animate-pulse rounded-pill bg-lime" />
                  </div>
                  <p className="text-[13px] leading-6 text-muted" style={{ fontWeight: 500 }}>
                    Enviando o orçamento. Aguarde alguns segundos enquanto finalizamos o envio.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-[13.5px] leading-6 text-muted" style={{ fontWeight: 500 }}>
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
                  className="inline-flex h-11 items-center justify-center rounded-[9px] border border-line bg-card px-4 text-[13px] text-ink transition-colors hover:bg-stone"
                  style={{ fontWeight: 700, transitionDuration: '.22s' }}
                >
                  Não
                </button>

                <button
                  type="button"
                  onClick={handleApproveOrcamento}
                  disabled={isApprovingOrcamento}
                  className="inline-flex h-11 items-center justify-center rounded-[9px] bg-ink px-4 text-[13px] text-white transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ fontWeight: 700, transitionDuration: '.22s' }}
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
