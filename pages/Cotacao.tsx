import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  Mail,
  MessageCircle,
  Paperclip,
  Zap,
} from 'lucide-react';
import OrcamentoEditorModal from '../components/OrcamentoEditorModal';
import WhatsAppChatView from '../components/chat/WhatsAppChatView';
import {
  formatBrazilianPhone,
  extractTimeFromDateTime,
  formatDateTime as formatChatDateTime,
} from '../components/chat/utils';
import type { ChatMessage, ChatMessageAuthor } from '../components/chat/types';
import {
  messageHtmlClassName,
  sanitizeHtmlContent,
  stripAttachmentAnalysisFromContent,
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
  membro_id: string;
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
  origem: 'EMAIL' | 'WHATSAPP' | null;
  telefone_lead: string | null;
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

interface EmpresaRecord {
  razao_social: string | null;
  cnpj: string | null;
  logo_url: string | null;
  email_responsavel: string | null;
  telefone_responsavel: string | null;
}

interface OrcamentoRecord {
  orcamento_id: string;
  data_emissao: string | null;
  validade: string | null;
  valor_total: string | null;
  status: string | null;
  aprovado_por: string | null;
  data_aprovacao: string | null;
  updated_at: string | null;
  pdf_url: string | null;
  html_orcamento: string | null;
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
  createdAt: string;
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
const APPROVE_ORCAMENTO_WEBHOOK_URL =
  'https://primary-production-b86f1.up.railway.app/webhook/aprovar-orcamento-v2';

const InfoField: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <p
      className="text-[10.5px] text-muted-soft"
      style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
    >
      {label}
    </p>
    <p className="mt-1 text-[13px] text-ink" style={{ fontWeight: 700 }}>
      {value}
    </p>
  </div>
);

const CotacaoPage: React.FC<CotacaoPageProps> = ({ empresaId, numeroTicket }) => {
  const [cotacao, setCotacao] = useState<AtendimentoRecord | null>(null);
  const [responsibleName, setResponsibleName] = useState('Membro nao identificado');
  const [linkedEmails, setLinkedEmails] = useState<string[]>([]);
  const [clientData, setClientData] = useState<ClientRecord | null>(null);
  const [orcamentoData, setOrcamentoData] = useState<OrcamentoRecord | null>(null);
  const [approvedByName, setApprovedByName] = useState('Não aprovado');
  const [orcamentoItems, setOrcamentoItems] = useState<OrcamentoItemRecord[]>([]);
  const [empresaData, setEmpresaData] = useState<EmpresaRecord | null>(null);
  const [orderedConversationItems, setOrderedConversationItems] = useState<ConversationItem[]>([]);
  const [expandedMessageIds, setExpandedMessageIds] = useState<string[]>([]);
  const [isOrcamentoModalOpen, setIsOrcamentoModalOpen] = useState(false);
  const [isDirectApproveConfirmationOpen, setIsDirectApproveConfirmationOpen] = useState(false);
  const [isDirectApproving, setIsDirectApproving] = useState(false);
  const [directApproveError, setDirectApproveError] = useState<string | null>(null);
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
          .from('sales_membros_v2')
          .select('membro_id, empresa_id, cargo')
          .eq('user_id', session.user.id)
          .limit(1);

        if (currentMemberError) {
          throw currentMemberError;
        }

        const currentMember = getFirstRow(currentMemberRows as CurrentMemberRecord[] | null);

        if (!currentMember?.empresa_id) {
          throw new Error('Nao foi possivel identificar a empresa do usuario.');
        }

        let atendimentoQuery = supabase
          .from('sales_atendimentos_v2')
          .select(
            'atendimento_id, empresa_id, cliente_id, created_at, status, categoria, assunto, numero_ticket, membro_id, origem, telefone_lead',
          )
          .eq('empresa_id', empresaId)
          .eq('numero_ticket', Number(numeroTicket))
          .in('categoria', ['COTACAO', 'PEDIDO_COMPRA']);

        if (currentMember.cargo !== 'ADMIN') {
          atendimentoQuery = atendimentoQuery.eq('membro_id', currentMember.membro_id);
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
          .from('sales_notificacoes_v2')
          .update({ lida: true })
          .eq('membro_id', currentMember.membro_id)
          .eq('atendimento_id', atendimento.atendimento_id)
          .eq('lida', false);

        const [
          messagesResponse,
          responsibleResponse,
          clientResponse,
          orcamentoResponse,
          empresaResponse,
          markNotificationsAsReadResponse,
        ] = await Promise.all([
          supabase
            .from('sales_mensagens_v2')
            .select('mensagem_id, created_at, origem, conteudo, metadata, anexos')
            .eq('empresa_id', currentMember.empresa_id)
            .eq('atendimento_id', atendimento.atendimento_id)
            .order('created_at', { ascending: true }),
          atendimento.membro_id
            ? supabase
                .from('sales_membros_v2')
                .select('nome')
                .eq('empresa_id', currentMember.empresa_id)
                .eq('membro_id', atendimento.membro_id)
                .limit(1)
            : Promise.resolve({ data: null, error: null }),
          atendimento.cliente_id
            ? supabase
                .from('sales_clientes_v2')
                .select('nome, razao_social, email, telefone, cnpj')
                .eq('empresa_id', currentMember.empresa_id)
                .eq('cliente_id', atendimento.cliente_id)
                .limit(1)
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from('sales_orcamentos_v2')
            .select(
              'orcamento_id, data_emissao, validade, valor_total, status, aprovado_por, data_aprovacao, updated_at, pdf_url, html_orcamento',
            )
            .eq('empresa_id', currentMember.empresa_id)
            .eq('atendimento_id', atendimento.atendimento_id)
            .order('updated_at', { ascending: false })
            .limit(1),
          supabase
            .from('sales_empresas_v2')
            .select('razao_social, cnpj, logo_url, email_responsavel, telefone_responsavel')
            .eq('empresa_id', currentMember.empresa_id)
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

        if (empresaResponse.error) {
          throw empresaResponse.error;
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
        const resolvedEmpresaData =
          getFirstRow(empresaResponse.data as EmpresaRecord[] | null) ?? null;
        let resolvedApprovedByName = 'Não aprovado';
        const cotacaoAssunto = atendimento.assunto || 'Cotacao sem assunto';
        const rawMessages = (messagesResponse.data ?? []) as MensagemRecord[];
        let resolvedOrcamentoItems: OrcamentoItemRecord[] = [];

        if (resolvedOrcamentoData?.orcamento_id) {
          const { data: itemsData, error: itemsError } = await supabase
            .from('sales_orcamentos_itens_v2')
            .select('item_id, quantidade, preco_unitario, total_item')
            .eq('orcamento_id', resolvedOrcamentoData.orcamento_id);

          if (itemsError) {
            throw itemsError;
          }

          resolvedOrcamentoItems = (itemsData ?? []) as OrcamentoItemRecord[];
        }

        if (resolvedOrcamentoData?.aprovado_por) {
          const { data: approvedByRows, error: approvedByError } = await supabase
            .from('sales_membros_v2')
            .select('nome')
            .eq('empresa_id', currentMember.empresa_id)
            .eq('membro_id', resolvedOrcamentoData.aprovado_por)
            .limit(1);

          if (approvedByError) {
            throw approvedByError;
          }

          resolvedApprovedByName =
            getFirstRow(approvedByRows as ResponsibleMemberRecord[] | null)?.nome || 'Não identificado';
        } else if (resolvedOrcamentoData?.data_aprovacao) {
          resolvedApprovedByName = 'IA';
        }

        const mappedMessages = rawMessages.map((message) => {
          const parsedMetadata = parseJsonObject(message.metadata);
          const rawContent = stripAttachmentAnalysisFromContent(
            message.conteudo || 'Sem conteudo disponivel.',
          );
          const contentText = stripHtmlToText(rawContent);

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
            createdAt: message.created_at,
            resumo: buildSummary(contentText),
            corpoHtml: sanitizeHtmlContent(rawContent),
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
        setEmpresaData(resolvedEmpresaData);
        setApprovedByName(resolvedApprovedByName);
        setOrcamentoItems(resolvedOrcamentoItems);
        setOrderedConversationItems(mappedMessages);
        setIsOrcamentoModalOpen(false);
        setIsDirectApproveConfirmationOpen(false);
        setIsDirectApproving(false);
        setDirectApproveError(null);
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
        setEmpresaData(null);
        setApprovedByName('Não aprovado');
        setOrcamentoItems([]);
        setOrderedConversationItems([]);
        setExpandedMessageIds([]);
        setIsOrcamentoModalOpen(false);
        setIsDirectApproveConfirmationOpen(false);
        setIsDirectApproving(false);
        setDirectApproveError(null);
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

  const handleDirectApprove = async () => {
    if (!orcamentoData?.orcamento_id || !cotacao?.atendimento_id || !cotacao?.membro_id) {
      setDirectApproveError('Não foi possível identificar os dados necessários para aprovar o orçamento.');
      return;
    }

    setIsDirectApproving(true);
    setDirectApproveError(null);

    try {
      const response = await fetch(APPROVE_ORCAMENTO_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orcamento_id: orcamentoData.orcamento_id,
          atendimento_id: cotacao.atendimento_id,
          membro_id: cotacao.membro_id,
        }),
      });

      if (!response.ok) {
        throw new Error('Não foi possível enviar o orçamento.');
      }

      await new Promise((resolve) => window.setTimeout(resolve, 5000));
      window.location.reload();
    } catch (error: any) {
      setDirectApproveError(error?.message || 'Não foi possível aprovar o orçamento.');
      setIsDirectApproving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center font-sans">
        <div className="h-10 w-10 rounded-full border-2 border-ink/15 border-t-ink animate-spin" />
      </div>
    );
  }

  if (loadError || !cotacao) {
    return (
      <div className="h-full w-full font-sans">
        <div
          className="rounded-tile border border-red-100 bg-red-50 px-5 py-4 text-[13px] text-red-600"
          style={{ fontWeight: 500 }}
        >
          {loadError || 'Nao foi possivel carregar a cotacao.'}
        </div>
      </div>
    );
  }

  const shouldShowOrcamentoApprovalAction = cotacao.status === 'AGUARDANDO_APROVACAO';
  const hasOrcamentoHtml = Boolean((orcamentoData?.html_orcamento || '').trim());
  const latestIaMessage = [...orderedConversationItems]
    .reverse()
    .find((message) => message.origem === 'IA');
  const latestIaMessageId = latestIaMessage?.id;
  const isWhatsAppLayout = cotacao.origem === 'WHATSAPP';

  const normalizeAuthor = (origem: string): ChatMessageAuthor => {
    const upper = (origem || '').toUpperCase();
    if (upper === 'IA') {
      return 'IA';
    }
    if (upper === 'HUMANO') {
      return 'HUMANO';
    }
    return 'CLIENTE';
  };

  const chatMessages: ChatMessage[] = orderedConversationItems.map((message) => ({
    id: message.id,
    author: normalizeAuthor(message.origem),
    time: formatChatDateTime(message.createdAt),
    createdAt: message.createdAt,
    contentHtml: message.corpoHtml,
    attachments: message.anexos.map((url) => ({ url })),
  }));

  const renderActionsForMessageId = (messageId: string) => {
    if (!shouldShowOrcamentoApprovalAction || latestIaMessageId !== messageId) {
      return null;
    }

    const approvalPendingCta = (label: string, onClick: () => void) => (
      <div
        className="flex flex-wrap items-center gap-4 rounded-tile border px-4 py-3"
        style={{ borderColor: 'rgba(235,245,125,.7)', backgroundColor: 'rgba(235,245,125,.18)' }}
      >
        <button
          type="button"
          onClick={onClick}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-[9px] bg-ink px-5 text-[13px] text-white transition-colors hover:bg-ink-soft"
          style={{ fontWeight: 700, transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
        >
          {label}
        </button>
        <span
          className="animate-pulse text-[10.5px] text-ink"
          style={{ fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}
        >
          Aprovação Pendente
        </span>
      </div>
    );

    if (hasOrcamentoHtml) {
      return approvalPendingCta('Visualizar Orçamento', () => setIsOrcamentoModalOpen(true));
    }

    if (orcamentoData) {
      return (
        <div className="space-y-2.5">
          <div
            className="rounded-tile border border-red-100 bg-red-50 px-4 py-3 text-[12.5px] text-red-600"
            style={{ fontWeight: 500 }}
          >
            <span style={{ fontWeight: 700 }}>Nenhum item foi encontrado para esse lead.</span> A IA
            não localizou os itens solicitados no catálogo — continue o atendimento manualmente,
            adicionando os itens no orçamento antes de aprovar.
          </div>
          {approvalPendingCta('Montar Orçamento', () => setIsOrcamentoModalOpen(true))}
        </div>
      );
    }

    return approvalPendingCta('Aprovar', () => {
      setDirectApproveError(null);
      setIsDirectApproveConfirmationOpen(true);
    });
  };

  return (
    <div className="h-full w-full overflow-y-auto xl:overflow-hidden font-sans" data-atendimento-id={cotacao.atendimento_id}>
      {isDirectApproveConfirmationOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-4">
          <div
            className="w-full max-w-md rounded-panel border border-line-soft bg-card p-6"
            style={{ boxShadow: '0 28px 80px -34px rgba(20,20,20,.45)' }}
          >
            <div className="space-y-3">
              <h3 className="text-[19px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.02em' }}>
                Aprovar e enviar
              </h3>
              <p className="text-[13.5px] leading-6 text-muted" style={{ fontWeight: 500 }}>
                Tem certeza que deseja aprovar este orçamento? O e-mail será enviado para o cliente.
              </p>
              {directApproveError ? (
                <div
                  className="rounded-tile border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-600"
                  style={{ fontWeight: 500 }}
                >
                  {directApproveError}
                </div>
              ) : null}
            </div>

            {isDirectApproving ? (
              <div className="mt-6 flex flex-col items-center justify-center gap-4 rounded-panel border border-line-soft bg-paper px-6 py-10 text-center">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-ink/15 border-t-ink" />
                <div className="space-y-1">
                  <p className="text-[12.5px] text-ink" style={{ fontWeight: 800, letterSpacing: '.08em' }}>
                    ORÇAMENTO ENVIADO
                  </p>
                  <p className="text-[13px] text-muted" style={{ fontWeight: 500 }}>
                    Aguarde enquanto recarregamos a página.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsDirectApproveConfirmationOpen(false);
                    setDirectApproveError(null);
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-[9px] border border-line bg-card px-5 text-[13px] text-ink transition-colors hover:bg-stone"
                  style={{ fontWeight: 700, transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
                >
                  Não
                </button>
                <button
                  type="button"
                  onClick={handleDirectApprove}
                  className="inline-flex h-11 items-center justify-center rounded-[9px] bg-lime px-5 text-[13px] text-ink transition-colors hover:bg-lime-deep"
                  style={{ fontWeight: 700, transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
                >
                  Sim
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <OrcamentoEditorModal
        isOpen={isOrcamentoModalOpen}
        onClose={() => setIsOrcamentoModalOpen(false)}
        assunto={cotacao.assunto}
        htmlOrcamento={orcamentoData?.html_orcamento || null}
        numeroTicket={cotacao.numero_ticket ? String(cotacao.numero_ticket) : null}
        empresaId={cotacao.empresa_id || null}
        empresaInfo={
          empresaData
            ? {
                logoUrl: empresaData.logo_url,
                razaoSocial: empresaData.razao_social,
                cnpj: empresaData.cnpj,
                email: empresaData.email_responsavel,
                telefone: empresaData.telefone_responsavel,
              }
            : null
        }
        orcamentoId={orcamentoData?.orcamento_id || null}
        atendimentoId={cotacao.atendimento_id}
        membroId={cotacao.membro_id}
        onHtmlSaved={(html) =>
          setOrcamentoData((currentValue) =>
            currentValue ? { ...currentValue, html_orcamento: html } : currentValue,
          )
        }
      />

      <div className="flex min-h-full flex-col gap-4 xl:h-full xl:min-h-0">
        <section className="flex flex-wrap items-start justify-between gap-4 px-1 pt-1">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={goBackToCotacoes}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill border border-line bg-card text-muted transition-colors hover:text-ink"
              style={{ transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
              aria-label="Voltar para cotações"
            >
              <ArrowLeft size={17} strokeWidth={2} />
            </button>

            <div className="min-w-0 space-y-1.5 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-pill border border-line bg-card px-2.5 py-1 text-[10.5px] text-muted"
                  style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                >
                  {cotacao.numero_ticket ? `#${cotacao.numero_ticket}` : 'Sem ticket'}
                </span>
                <span
                  className="rounded-pill bg-stone px-2.5 py-1 text-[10.5px] text-muted"
                  style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                >
                  {formatEnumLabel(cotacao.status)}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-pill bg-stone px-2.5 py-1 text-[10.5px] text-muted"
                  style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                >
                  {isWhatsAppLayout ? <MessageCircle size={11} /> : <Mail size={11} />}
                  {isWhatsAppLayout ? 'WhatsApp' : 'E-mail'}
                </span>
              </div>
              <h1 className="text-[22px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.02em' }}>
                {cotacao.assunto || 'Cotação sem assunto'}
              </h1>
            </div>
          </div>
        </section>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
            <section className="rounded-panel border border-line-soft bg-card p-5">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-stone text-muted">
                  <ClipboardList size={17} />
                </div>
                <h2 className="text-[13.5px] text-ink" style={{ fontWeight: 800 }}>
                  Dados do Atendimento
                </h2>
              </div>

              <div className="space-y-4">
                <InfoField label="Status" value={formatEnumLabel(cotacao.status)} />
                <InfoField label="Categoria" value={formatEnumLabel(cotacao.categoria)} />
                <InfoField
                  label="Ticket"
                  value={cotacao.numero_ticket ? `#${cotacao.numero_ticket}` : 'Sem ticket'}
                />
                <InfoField label="Data de Criação" value={formatDateTime(cotacao.created_at)} />
                <InfoField label="Responsável" value={responsibleName} />

                <div>
                  <p
                    className="text-[10.5px] text-muted-soft"
                    style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                  >
                    E-mails Vinculados
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {linkedEmails.length > 0 ? (
                      linkedEmails.map((email) => (
                        <span
                          key={email}
                          className="rounded-pill border border-line bg-paper px-2.5 py-1 text-[11px] text-muted"
                          style={{ fontWeight: 700 }}
                        >
                          {email}
                        </span>
                      ))
                    ) : (
                      <p className="text-[13px] text-ink" style={{ fontWeight: 700 }}>
                        -
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-panel border border-line-soft bg-card p-5">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-stone text-muted">
                  <FileText size={17} />
                </div>
                <h2 className="text-[13.5px] text-ink" style={{ fontWeight: 800 }}>
                  Dados do Orçamento
                </h2>
              </div>

              {orcamentoData ? (
                <div className="space-y-4">
                  <InfoField label="Status" value={formatEnumLabel(orcamentoData.status)} />
                  <InfoField label="Data de Emissão" value={formatDateOnly(orcamentoData.data_emissao)} />
                  <InfoField label="Aprovado por" value={approvedByName} />
                  <InfoField
                    label="Data da aprovação do orçamento"
                    value={
                      orcamentoData.data_aprovacao ? formatDateTime(orcamentoData.data_aprovacao) : '-'
                    }
                  />
                  {normalizeExternalUrl(orcamentoData.pdf_url) ? (
                    <a
                      href={normalizeExternalUrl(orcamentoData.pdf_url) || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-[9px] border border-line bg-paper px-4 py-2.5 text-[12.5px] text-ink transition-colors hover:bg-stone"
                      style={{ fontWeight: 700, transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
                    >
                      <Download size={14} />
                      Baixar PDF do Orçamento
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
                  Nenhum orçamento vinculado a este atendimento.
                </p>
              )}
            </section>
          </aside>

          <section className="flex h-[70vh] min-h-0 flex-col overflow-hidden rounded-panel border border-line-soft xl:h-full">
            {isWhatsAppLayout ? (
                <WhatsAppChatView
                  header={{
                    phoneFormatted: formatBrazilianPhone(cotacao.telefone_lead),
                    ticketLabel: cotacao.numero_ticket ? `#${cotacao.numero_ticket}` : 'Sem ticket',
                    category: formatEnumLabel(cotacao.categoria),
                    categoryKey: (cotacao.categoria || '').toUpperCase(),
                    customerName: clientData?.nome || undefined,
                  }}
                  messages={chatMessages}
                  renderActionsForMessageId={renderActionsForMessageId}
                  highlightedMessageId={shouldShowOrcamentoApprovalAction ? latestIaMessageId : undefined}
                />
            ) : (
              <div className="flex min-h-0 h-full flex-col overflow-y-auto bg-paper p-4">
                <div className="flex-1 space-y-2.5">
                  {orderedConversationItems.length > 0 ? (
                    orderedConversationItems.map((message) => {
                      const isExpanded = expandedMessageIds.includes(message.id);
                      const shouldShowMessageOrcamentoAction =
                        shouldShowOrcamentoApprovalAction && latestIaMessageId === message.id;
                      const originBadge =
                        message.origem === 'IA' ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-pill bg-lime px-2 py-0.5 text-[9.5px] text-ink"
                            style={{ fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}
                          >
                            <Zap size={10} />
                            IA
                          </span>
                        ) : message.origem === 'HUMANO' ? (
                          <span
                            className="rounded-pill bg-stone px-2 py-0.5 text-[9.5px] text-muted"
                            style={{ fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}
                          >
                            Você
                          </span>
                        ) : (
                          <span
                            className="rounded-pill border border-line px-2 py-0.5 text-[9.5px] text-muted"
                            style={{ fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}
                          >
                            Cliente
                          </span>
                        );

                      return (
                        <div
                          key={message.id}
                          className={`w-full rounded-panel border text-left transition-all ${
                            shouldShowMessageOrcamentoAction
                              ? 'border-lime bg-card'
                              : 'border-line-soft bg-card hover:border-ink/15'
                          }`}
                          style={{ transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
                        >
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
                            className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left"
                            aria-expanded={isExpanded}
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <span className="mt-0.5 shrink-0 text-muted-soft">
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </span>
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  {originBadge}
                                  <span className="truncate text-[12px] text-muted" style={{ fontWeight: 500 }}>
                                    {message.remetente}
                                  </span>
                                </div>
                                {!isExpanded ? (
                                  <p className="line-clamp-1 text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
                                    {buildSummary(message.corpoTexto)}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            <span className="shrink-0 text-[11px] text-muted-soft" style={{ fontWeight: 700 }}>
                              {message.horario}
                            </span>
                          </button>

                          {shouldShowMessageOrcamentoAction ? (
                            <div className="px-4 pb-3.5">{renderActionsForMessageId(message.id)}</div>
                          ) : null}

                          {isExpanded ? (
                            <div className="space-y-3 border-t border-line-soft px-4 pb-4 pt-3.5">
                              <div
                                className={messageHtmlClassName}
                                dangerouslySetInnerHTML={{ __html: message.corpoHtml }}
                              />
                              {!shouldShowMessageOrcamentoAction && message.anexos.length > 0 ? (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {message.anexos.map((attachment) => (
                                    <a
                                      key={attachment}
                                      href={attachment}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(event) => event.stopPropagation()}
                                      className="inline-flex items-center gap-2 rounded-tile border border-line bg-paper px-3 py-2 text-[11.5px] text-muted transition-colors hover:border-ink/15"
                                      style={{ fontWeight: 700, transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
                                    >
                                      <Paperclip size={13} />
                                      {getAttachmentLabel(attachment)}
                                    </a>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-panel border border-dashed border-line px-4 text-center">
                      <p className="text-[11px] text-muted-soft" style={{ fontWeight: 500 }}>
                        Nenhuma mensagem vinculada a esta cotação.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default CotacaoPage;
