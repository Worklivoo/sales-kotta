import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, ClipboardList, Paperclip } from 'lucide-react';
import {
  messageHtmlClassName,
  sanitizeHtmlContent,
  stripHtmlToText,
} from '../lib/htmlContent';
import { supabase } from '../lib/supabase';

interface CotacaoPageProps {
  empresaId: string;
  numeroTicket: string;
}

type KanbanStatus =
  | 'TRIAGEM'
  | 'COLETANDO_DADOS'
  | 'AGUARDANDO_APROVACAO'
  | 'ORCAMENTO_ENVIADO'
  | 'CONCLUIDO'
  | 'DESCARTADO';

type MessageOrigin = 'CLIENTE' | 'IA' | 'HUMANO';

interface CurrentMemberRecord {
  empresa_id: string;
  cargo: string | null;
}

interface AtendimentoRecord {
  atendimento_id: string;
  empresa_id: string;
  cliente_id: string | null;
  created_at: string;
  status: KanbanStatus;
  categoria: string;
  assunto: string | null;
  numero_ticket: number | null;
  membro_id: string | null;
}

interface ResponsibleMemberRecord {
  nome: string | null;
}

interface ClientRecord {
  nome: string | null;
  razao_social: string | null;
  email: string | null;
  telefone: string | null;
  cnpj: string | null;
}

interface OrcamentoRecord {
  orcamento_id: string;
  data_emissao: string | null;
  validade: string | null;
  valor_total: string | null;
  status: string | null;
  pdf_url: string | null;
}

interface OrcamentoItemRecord {
  item_id: string;
  quantidade: string | null;
  preco_unitario: string | null;
  total_item: string | null;
}

interface MensagemRecord {
  mensagem_id: string;
  created_at: string;
  origem: MessageOrigin | string | null;
  conteudo: string | null;
  metadata: unknown;
  anexos: unknown;
}

interface ConversationItem {
  id: string;
  origem: MessageOrigin | string;
  remetente: string;
  copia: string;
  assunto: string;
  horario: string;
  resumo: string;
  corpoHtml: string;
  corpoTexto: string;
  anexos: string[];
}

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const formatDateTime = (value: string) => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsedDate);
};

const formatDateOnly = (value: string | null) => {
  if (!value) {
    return '-';
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsedDate);
};

const formatEnumLabel = (value: string | null) => {
  if (!value) {
    return '-';
  }

  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const formatDocument = (value: string | null) => {
  if (!value) {
    return '-';
  }

  const digits = value.replace(/\D/g, '');

  if (digits.length !== 14) {
    return value;
  }

  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const formatPhone = (value: string | null) => {
  if (!value) {
    return '-';
  }

  const digits = value.replace(/\D/g, '');

  if (digits.length === 13) {
    return digits.replace(/^(\d{2})(\d{2})(\d{5})(\d{4})$/, '+$1 ($2) $3-$4');
  }

  if (digits.length === 12) {
    return digits.replace(/^(\d{2})(\d{2})(\d{4})(\d{4})$/, '+$1 ($2) $3-$4');
  }

  if (digits.length === 11) {
    return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  }

  if (digits.length === 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  }

  return value;
};

const formatCurrency = (value: string | number | null) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const numericValue = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));

  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(numericValue);
};

const normalizeExternalUrl = (value: string | null) => {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  return `https://${trimmedValue.replace(/^\/+/, '')}`;
};

const goBackToCotacoes = () => {
  window.location.pathname = '/cotacoes';
};

const parseJsonObject = (value: unknown): Record<string, unknown> | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const normalizeAttachmentUrl = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.replace(/`/g, '').trim();
  return normalizedValue || null;
};

const normalizeAttachmentList = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return normalizeAttachmentUrl(item);
      }

      if (item && typeof item === 'object' && 'url' in item) {
        return normalizeAttachmentUrl((item as { url?: unknown }).url);
      }

      return null;
    })
    .filter((item): item is string => Boolean(item));
};

const parseAttachmentList = (value: unknown) => {
  if (!value) {
    return [] as string[];
  }

  if (Array.isArray(value)) {
    return normalizeAttachmentList(value);
  }

  if (typeof value !== 'string') {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(value);
    return normalizeAttachmentList(parsed);
  } catch {
    return [] as string[];
  }
};

const buildSummary = (value: string) => {
  const singleLine = value.replace(/\s+/g, ' ').trim();

  if (singleLine.length <= 140) {
    return singleLine;
  }

  return `${singleLine.slice(0, 137)}...`;
};

const collectEmailsFromValue = (value: unknown, bucket: Set<string>) => {
  if (typeof value === 'string') {
    const matches = value.match(emailPattern) ?? [];
    matches.forEach((email) => bucket.add(email.toLowerCase()));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectEmailsFromValue(item, bucket));
    return;
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectEmailsFromValue(item, bucket));
  }
};

const extractCopyRecipients = (metadata: Record<string, unknown> | null) => {
  if (!metadata) {
    return '-';
  }

  const copyKeys = ['cc', 'copia', 'copias', 'emails_copia', 'email_copia'];
  const recipients = new Set<string>();

  copyKeys.forEach((key) => {
    if (key in metadata) {
      collectEmailsFromValue(metadata[key], recipients);
    }
  });

  return recipients.size > 0 ? Array.from(recipients).join(', ') : '-';
};

const buildSenderLabel = (
  origem: string,
  metadata: Record<string, unknown> | null,
  responsibleName: string,
) => {
  if (origem === 'IA') {
    return 'IA';
  }

  if (origem === 'HUMANO') {
    return responsibleName;
  }

  const senderEmail =
    typeof metadata?.email_remetente === 'string' ? metadata.email_remetente : null;

  return senderEmail || 'Cliente';
};

const getAttachmentLabel = (attachment: string) => {
  try {
    const url = new URL(attachment);
    const segments = url.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || attachment;
  } catch {
    const segments = attachment.split('/').filter(Boolean);
    return segments[segments.length - 1] || attachment;
  }
};

const getFirstRow = <T,>(rows: T[] | null | undefined) => rows?.[0] ?? null;

const CotacaoPage: React.FC<CotacaoPageProps> = ({ empresaId, numeroTicket }) => {
  const [cotacao, setCotacao] = useState<AtendimentoRecord | null>(null);
  const [responsibleName, setResponsibleName] = useState('Membro nao identificado');
  const [linkedEmails, setLinkedEmails] = useState<string[]>([]);
  const [clientData, setClientData] = useState<ClientRecord | null>(null);
  const [orcamentoData, setOrcamentoData] = useState<OrcamentoRecord | null>(null);
  const [orcamentoItems, setOrcamentoItems] = useState<OrcamentoItemRecord[]>([]);
  const [orderedConversationItems, setOrderedConversationItems] = useState<ConversationItem[]>([]);
  const [expandedMessageIds, setExpandedMessageIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadCotacao = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session?.user?.id) {
          throw new Error('Nao foi possivel identificar o usuario autenticado.');
        }

        const { data: currentMemberRows, error: currentMemberError } = await supabase
          .from('sales_membros_empresa')
          .select('empresa_id, cargo')
          .eq('membro_id', session.user.id)
          .limit(1);

        if (currentMemberError) {
          throw currentMemberError;
        }

        const currentMember = getFirstRow(currentMemberRows as CurrentMemberRecord[] | null);

        if (!currentMember?.empresa_id) {
          throw new Error('Nao foi possivel identificar a empresa do usuario.');
        }

        let atendimentoQuery = supabase
          .from('sales_atendimento')
          .select(
            'atendimento_id, empresa_id, cliente_id, created_at, status, categoria, assunto, numero_ticket, membro_id',
          )
          .eq('empresa_id', empresaId)
          .eq('numero_ticket', Number(numeroTicket))
          .eq('categoria', 'COTACAO');

        if (currentMember.cargo !== 'ADMIN') {
          atendimentoQuery = atendimentoQuery.eq('membro_id', session.user.id);
        }

        const { data: atendimentoRows, error: atendimentoError } = await atendimentoQuery.limit(1);

        if (atendimentoError) {
          throw atendimentoError;
        }

        const atendimento = getFirstRow(atendimentoRows as AtendimentoRecord[] | null);

        if (!atendimento) {
          throw new Error('Cotacao nao encontrada.');
        }

        const markNotificationsAsReadPromise = supabase
          .from('sales_notificacoes')
          .update({ notificacao_lida: true })
          .eq('membro_id', session.user.id)
          .eq('atendimento_id', atendimento.atendimento_id)
          .eq('notificacao_lida', false);

        const [
          messagesResponse,
          responsibleResponse,
          clientResponse,
          orcamentoResponse,
          markNotificationsAsReadResponse,
        ] = await Promise.all([
          supabase
            .from('sales_mensagens')
            .select('mensagem_id, created_at, origem, conteudo, metadata, anexos')
            .eq('empresa_id', currentMember.empresa_id)
            .eq('atendimento_id', atendimento.atendimento_id)
            .order('created_at', { ascending: true }),
          atendimento.membro_id
            ? supabase
                .from('sales_membros_empresa')
                .select('nome')
                .eq('empresa_id', currentMember.empresa_id)
                .eq('membro_id', atendimento.membro_id)
                .limit(1)
            : Promise.resolve({ data: null, error: null }),
          atendimento.cliente_id
            ? supabase
                .from('sales_clientes_finais')
                .select('nome, razao_social, email, telefone, cnpj')
                .eq('empresa_id', currentMember.empresa_id)
                .eq('cliente_id', atendimento.cliente_id)
                .limit(1)
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from('sales_orcamentos')
            .select('orcamento_id, data_emissao, validade, valor_total, status, pdf_url')
            .eq('empresa_id', currentMember.empresa_id)
            .eq('atendimento_id', atendimento.atendimento_id)
            .limit(1),
          markNotificationsAsReadPromise,
        ]);

        if (messagesResponse.error) {
          throw messagesResponse.error;
        }

        if (responsibleResponse.error) {
          throw responsibleResponse.error;
        }

        if (clientResponse.error) {
          throw clientResponse.error;
        }

        if (orcamentoResponse.error) {
          throw orcamentoResponse.error;
        }

        if (markNotificationsAsReadResponse.error) {
          console.error('Erro ao marcar notificacoes da cotacao como lidas:', markNotificationsAsReadResponse.error);
        }

        const resolvedResponsibleName =
          getFirstRow(responsibleResponse.data as ResponsibleMemberRecord[] | null)?.nome ||
          'Membro nao identificado';
        const resolvedClientData = getFirstRow(clientResponse.data as ClientRecord[] | null) ?? null;
        const resolvedOrcamentoData =
          getFirstRow(orcamentoResponse.data as OrcamentoRecord[] | null) ?? null;
        const cotacaoAssunto = atendimento.assunto || 'Cotacao sem assunto';
        const rawMessages = (messagesResponse.data ?? []) as MensagemRecord[];
        let resolvedOrcamentoItems: OrcamentoItemRecord[] = [];

        if (resolvedOrcamentoData?.orcamento_id) {
          const { data: itemsData, error: itemsError } = await supabase
            .from('sales_orcamentos_itens')
            .select('item_id, quantidade, preco_unitario, total_item')
            .eq('orcamento_id', resolvedOrcamentoData.orcamento_id);

          if (itemsError) {
            throw itemsError;
          }

          resolvedOrcamentoItems = (itemsData ?? []) as OrcamentoItemRecord[];
        }

        const mappedMessages = rawMessages.map((message) => {
          const parsedMetadata = parseJsonObject(message.metadata);
          const contentText = stripHtmlToText(message.conteudo || 'Sem conteudo disponivel.');

          return {
            id: message.mensagem_id,
            origem: (message.origem || 'HUMANO').toUpperCase(),
            remetente: buildSenderLabel(
              (message.origem || 'HUMANO').toUpperCase(),
              parsedMetadata,
              resolvedResponsibleName,
            ),
            copia: extractCopyRecipients(parsedMetadata),
            assunto: cotacaoAssunto,
            horario: formatDateTime(message.created_at),
            resumo: buildSummary(contentText),
            corpoHtml: sanitizeHtmlContent(message.conteudo || 'Sem conteudo disponivel.'),
            corpoTexto: contentText,
            anexos: parseAttachmentList(message.anexos),
          };
        });
        const resolvedLinkedEmails = Array.from(
          rawMessages.reduce((bucket, message) => {
            collectEmailsFromValue(parseJsonObject(message.metadata), bucket);
            return bucket;
          }, new Set<string>()),
        );

        if (!isMounted) {
          return;
        }

        setCotacao(atendimento);
        setResponsibleName(resolvedResponsibleName);
        setLinkedEmails(resolvedLinkedEmails);
        setClientData(resolvedClientData);
        setOrcamentoData(resolvedOrcamentoData);
        setOrcamentoItems(resolvedOrcamentoItems);
        setOrderedConversationItems(mappedMessages);
      } catch (error: any) {
        console.error('Erro ao carregar cotacao:', error);

        if (!isMounted) {
          return;
        }

        setCotacao(null);
        setResponsibleName('Membro nao identificado');
        setLinkedEmails([]);
        setClientData(null);
        setOrcamentoData(null);
        setOrcamentoItems([]);
        setOrderedConversationItems([]);
        setExpandedMessageIds([]);
        setLoadError(error?.message || 'Nao foi possivel carregar a cotacao.');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadCotacao();

    return () => {
      isMounted = false;
    };
  }, [empresaId, numeroTicket]);

  useEffect(() => {
    const defaultExpandedMessageId =
      orderedConversationItems[orderedConversationItems.length - 1]?.id ?? '';

    setExpandedMessageIds((currentExpandedMessageIds) => {
      const validExpandedMessageIds = currentExpandedMessageIds.filter((messageId) =>
        orderedConversationItems.some((message) => message.id === messageId),
      );

      if (validExpandedMessageIds.length > 0) {
        return validExpandedMessageIds;
      }

      return defaultExpandedMessageId ? [defaultExpandedMessageId] : [];
    });
  }, [orderedConversationItems]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-black/10 border-t-black animate-spin" />
      </div>
    );
  }

  if (loadError || !cotacao) {
    return (
      <div className="h-full w-full">
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-medium text-red-600">
          {loadError || 'Nao foi possivel carregar a cotacao.'}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto" data-atendimento-id={cotacao.atendimento_id}>
      <div className="flex min-h-full flex-col gap-4 pb-2">
        <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_6px_24px_rgba(15,23,42,0.035)] lg:p-5">
          <div className="border-b border-black/5 px-1 pb-5">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={goBackToCotacoes}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-[#F8F8F8] text-gray-600 transition-colors hover:bg-[#F1F1F1] hover:text-gray-900"
                aria-label="Voltar para cotacoes"
              >
                <ArrowLeft size={18} />
              </button>

              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <span className="inline-flex rounded-full border border-black/10 bg-[#F6F6F6] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                  {cotacao.numero_ticket ? `#${cotacao.numero_ticket}` : 'Sem ticket'}
                </span>
                <h1 className="text-[28px] font-semibold tracking-tight text-gray-900">
                  {cotacao.assunto || 'Cotacao sem assunto'}
                </h1>
              </div>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 gap-8 pt-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="space-y-6 xl:border-r xl:border-black/5 xl:pr-6">
              <section className="border-b border-black/5 pb-6">
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl bg-[#F3F4F6] p-3 text-gray-600">
                    <ClipboardList size={20} />
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-base font-semibold tracking-tight text-gray-900">
                      Dados do Atendimento
                    </h2>
                  </div>
                </div>

                <div className="space-y-4 pl-1">
                  <div>
                    <p className="text-xs font-medium text-gray-500">Status</p>
                    <p className="mt-1 text-sm font-semibold tracking-tight text-gray-900">
                      {formatEnumLabel(cotacao.status)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500">Categoria</p>
                    <p className="mt-1 text-sm font-semibold tracking-tight text-gray-900">
                      {formatEnumLabel(cotacao.categoria)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500">Ticket</p>
                    <p className="mt-1 text-sm font-semibold tracking-tight text-gray-900">
                      {cotacao.numero_ticket ? `#${cotacao.numero_ticket}` : 'Sem ticket'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500">Data de Criacao</p>
                    <p className="mt-1 text-sm font-semibold tracking-tight text-gray-900">
                      {formatDateTime(cotacao.created_at)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500">Responsavel</p>
                    <p className="mt-1 text-sm font-semibold tracking-tight text-gray-900">
                      {responsibleName}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500">E-mails Vinculados</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {linkedEmails.length > 0 ? (
                        linkedEmails.map((email) => (
                          <span
                            key={email}
                            className="inline-flex rounded-full border border-black/10 bg-[#F7F7F7] px-3 py-1 text-xs font-medium text-gray-700"
                          >
                            {email}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm font-semibold tracking-tight text-gray-900">-</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              </section>

            </aside>

            <section className="min-h-0">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Atendimento</h2>
              </div>
            </div>

            <div className="min-h-[640px] rounded-2xl bg-[#FCFCFC] px-1 py-1 sm:px-2 sm:py-2">
              <div className="space-y-4">
                {orderedConversationItems.length > 0 ? (
                  orderedConversationItems.map((message) => {
                    const isExpanded = expandedMessageIds.includes(message.id);

                    return (
                      <div
                        key={message.id}
                        className={`w-full rounded-2xl border border-black/5 bg-white text-left transition-all ${
                          isExpanded
                            ? 'px-4 py-4 sm:px-5 sm:py-5'
                            : 'px-4 py-4 hover:border-black/10 hover:bg-[#FCFCFC]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-3">
                              <div className="min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedMessageIds((currentExpandedMessageIds) =>
                                      currentExpandedMessageIds.includes(message.id)
                                        ? currentExpandedMessageIds.filter(
                                            (messageId) => messageId !== message.id,
                                          )
                                        : [...currentExpandedMessageIds, message.id],
                                    )
                                  }
                                  className="flex w-full items-start justify-between gap-3 text-left"
                                  aria-expanded={isExpanded}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start gap-3">
                                      <div className="mt-0.5 text-gray-400">
                                        {isExpanded ? (
                                          <ChevronDown size={18} />
                                        ) : (
                                          <ChevronRight size={18} />
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <span className="text-sm font-semibold text-gray-900">
                                          {message.origem}
                                        </span>
                                        <span className="mt-0.5 block break-all text-sm text-gray-500 sm:mt-0 sm:inline sm:break-all sm:pl-2">
                                          {message.remetente}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <p className="shrink-0 text-xs font-medium text-gray-400">
                                    {message.horario}
                                  </p>
                                </button>

                                {isExpanded ? (
                                  <div className="mt-5 space-y-3">
                                    <div
                                      className={messageHtmlClassName}
                                      dangerouslySetInnerHTML={{ __html: message.corpoHtml }}
                                    />
                                    {message.anexos.length > 0 ? (
                                      <div className="flex flex-wrap gap-2 pt-1">
                                        {message.anexos.map((attachment) => (
                                          <a
                                            key={attachment}
                                            href={attachment}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={(event) => event.stopPropagation()}
                                            className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-[#FAFAFA] px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-black/20 hover:bg-white"
                                          >
                                            <Paperclip size={14} />
                                            {getAttachmentLabel(attachment)}
                                          </a>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : (
                                  <p className="mt-3 line-clamp-1 text-sm leading-6 text-gray-500">
                                    {buildSummary(message.corpoTexto)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-black/10 bg-white px-4 text-center">
                    <p className="text-xs font-medium text-gray-400">
                      Nenhuma mensagem vinculada a esta cotacao.
                    </p>
                  </div>
                )}
              </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CotacaoPage;
