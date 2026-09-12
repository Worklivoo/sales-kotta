import React, { useEffect, useMemo, useState } from 'react';
import MelhorarResposta from '../components/feedback/MelhorarResposta';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Hash,
  Mail,
  Paperclip,
  Search,
  SlidersHorizontal,
  Tag,
  User,
  Zap,
} from 'lucide-react';
import {
  messageHtmlClassName,
  sanitizeHtmlContent,
  stripAttachmentAnalysisFromContent,
  stripHtmlToText,
} from '../lib/htmlContent';
import { supabase } from '../lib/supabase';

type MessageAuthor = 'CLIENTE' | 'IA' | 'HUMANO';

const CATEGORY_OPTIONS = [
  'COTACAO',
  'DUVIDA_TECNICA',
  'FINANCEIRO',
  'RECLAMACAO',
  'SPAM',
  'OUTROS',
  'PEDIDO_COMPRA',
  'INDEFINIDO',
] as const;

type AtendimentoCategory = (typeof CATEGORY_OPTIONS)[number];

interface CurrentMemberRecord {
  membro_id: string;
  empresa_id: string;
  cargo: string | null;
}

interface AtendimentoRecord {
  atendimento_id: string;
  empresa_id: string;
  created_at: string;
  updated_at: string | null;
  status: string | null;
  categoria: string | null;
  assunto: string | null;
  numero_ticket: number | null;
  membro_id: string | null;
  email_lead: string | null;
}

interface MemberRecord {
  membro_id: string;
  nome: string | null;
}

interface EmpresaRecord {
  razao_social: string | null;
}

interface MensagemRecord {
  mensagem_id: string;
  atendimento_id: string;
  created_at: string;
  origem: MessageAuthor | string | null;
  conteudo: string | null;
  metadata: unknown;
  anexos: unknown;
}

interface AtendimentoMessage {
  id: string;
  author: MessageAuthor;
  senderEmail: string;
  time: string;
  contentHtml: string;
  contentText: string;
  attachments: string[];
}

interface AtendimentoItem {
  atendimentoId: string;
  ticketLabel: string;
  subject: string;
  customer: string;
  email: string;
  preview: string;
  categoryKey: string;
  category: string;
  tag: string;
  createdAt: string;
  lastActivityAt: string;
  responsible: string;
  messages: AtendimentoMessage[];
}

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

const buildSummary = (value: string) => {
  const singleLine = value.replace(/\s+/g, ' ').trim();

  if (!singleLine) {
    return 'Sem conteúdo disponível.';
  }

  if (singleLine.length <= 140) {
    return singleLine;
  }

  return `${singleLine.slice(0, 137)}...`;
};

const formatStatusLabel = (status: string | null) => {
  if (!status) {
    return 'Sem status';
  }

  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const formatCategoryLabel = (category: string | null) => {
  if (!category) {
    return 'Sem categoria';
  }

  return category
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

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

const formatInboxDate = (value: string) => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTargetDay = new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
  );
  const diffInDays = Math.round(
    (startOfToday.getTime() - startOfTargetDay.getTime()) / (1000 * 60 * 60 * 24),
  );
  const hours = parsedDate.getHours();
  const minutes = parsedDate.getMinutes();
  const timeLabel = minutes > 0 ? `${hours}h${String(minutes).padStart(2, '0')}` : `${hours}h`;

  if (diffInDays === 0) {
    return `Hoje, às ${timeLabel}`;
  }

  if (diffInDays === 1) {
    return `Ontem, às ${timeLabel}`;
  }

  if (diffInDays > 1 && diffInDays < 7) {
    const weekdayLabel = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
    }).format(parsedDate);

    return `${weekdayLabel.charAt(0).toUpperCase() + weekdayLabel.slice(1)}, às ${timeLabel}`;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(parsedDate);
};

const normalizeMessageAuthor = (value: string | null): MessageAuthor => {
  const normalized = (value || '').toUpperCase();

  if (normalized === 'IA') {
    return 'IA';
  }

  if (normalized === 'HUMANO') {
    return 'HUMANO';
  }

  return 'CLIENTE';
};

const extractSenderEmail = (metadata: Record<string, unknown> | null) => {
  return typeof metadata?.email_remetente === 'string' ? metadata.email_remetente : '';
};

const buildCustomerLabel = (email: string) => {
  if (!email) {
    return 'Cliente';
  }

  const localPart = email.split('@')[0] || 'cliente';

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const buildMessageSenderEmail = (
  author: MessageAuthor,
  metadata: Record<string, unknown> | null,
  companyName: string,
  atendimentoEmailLead: string,
) => {
  const senderEmail = extractSenderEmail(metadata);

  if (senderEmail) {
    return senderEmail;
  }

  if (author === 'CLIENTE' && atendimentoEmailLead) {
    return atendimentoEmailLead;
  }

  if (author === 'IA') {
    return 'IA';
  }

  if (author === 'HUMANO' && companyName) {
    return companyName;
  }

  return 'E-mail não identificado';
};

const getFirstRow = <T,>(rows: T[] | null | undefined) => rows?.[0] ?? null;

const EmailPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [atendimentos, setAtendimentos] = useState<AtendimentoItem[]>([]);
  const [selectedAtendimentoId, setSelectedAtendimentoId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [expandedMessageIds, setExpandedMessageIds] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<AtendimentoCategory[]>([
    ...CATEGORY_OPTIONS,
  ]);
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadAtendimentos = async () => {
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
          throw new Error('Não foi possível identificar o usuário autenticado.');
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
          throw new Error('Não foi possível identificar a empresa do usuário.');
        }

        let atendimentosQuery = supabase
          .from('sales_atendimentos_v2')
          .select(
            'atendimento_id, empresa_id, created_at, updated_at, status, categoria, assunto, numero_ticket, membro_id, email_lead',
          )
          .eq('empresa_id', currentMember.empresa_id)
          .eq('origem', 'EMAIL')
          .order('created_at', { ascending: false });

        if (currentMember.cargo !== 'ADMIN') {
          atendimentosQuery = atendimentosQuery.eq('membro_id', currentMember.membro_id);
        }

        const { data: atendimentosData, error: atendimentosError } = await atendimentosQuery;

        if (atendimentosError) {
          throw atendimentosError;
        }

        const rawAtendimentos = (atendimentosData ?? []) as AtendimentoRecord[];

        if (rawAtendimentos.length === 0) {
          if (!isMounted) {
            return;
          }

          setAtendimentos([]);
          setSelectedAtendimentoId('');
          setExpandedMessageIds([]);
          return;
        }

        const atendimentoIds = rawAtendimentos.map((item) => item.atendimento_id);
        const responsibleIds = Array.from(
          new Set(
            rawAtendimentos
              .map((item) => item.membro_id)
              .filter((memberId): memberId is string => Boolean(memberId)),
          ),
        );

        const [messagesResponse, membersResponse, companyResponse] = await Promise.all([
          supabase
            .from('sales_mensagens_v2')
            .select('mensagem_id, atendimento_id, created_at, origem, conteudo, metadata, anexos')
            .eq('empresa_id', currentMember.empresa_id)
            .in('atendimento_id', atendimentoIds)
            .order('created_at', { ascending: false }),
          responsibleIds.length > 0
            ? supabase
                .from('sales_membros_v2')
                .select('membro_id, nome')
                .eq('empresa_id', currentMember.empresa_id)
                .in('membro_id', responsibleIds)
            : Promise.resolve({ data: [], error: null }),
          currentMember.cargo === 'ADMIN'
            ? supabase
                .from('sales_empresas_v2')
                .select('razao_social')
                .eq('empresa_id', currentMember.empresa_id)
                .limit(1)
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (messagesResponse.error) {
          throw messagesResponse.error;
        }

        if (membersResponse.error) {
          throw membersResponse.error;
        }

        if (companyResponse.error) {
          throw companyResponse.error;
        }

        const responsibleById = new Map<string, string>();
        ((membersResponse.data ?? []) as MemberRecord[]).forEach((member) => {
          responsibleById.set(member.membro_id, member.nome || 'Membro não identificado');
        });
        const resolvedCompanyName = (
          (getFirstRow(companyResponse.data as EmpresaRecord[] | null)?.razao_social || '')
        ).trim();

        const emailLeadByAtendimento = new Map<string, string>();
        rawAtendimentos.forEach((atendimento) => {
          if (atendimento.email_lead) {
            emailLeadByAtendimento.set(atendimento.atendimento_id, atendimento.email_lead);
          }
        });

        const messagesByAtendimento = new Map<string, AtendimentoMessage[]>();
        const senderEmailByAtendimento = new Map<string, string>();
        const latestMessageAtByAtendimento = new Map<string, string>();

        ((messagesResponse.data ?? []) as MensagemRecord[]).forEach((message) => {
          const parsedMetadata = parseJsonObject(message.metadata);
          const rawContent = stripAttachmentAnalysisFromContent(
            message.conteudo || 'Sem conteúdo disponível.',
          );
          const contentText = stripHtmlToText(rawContent);
          const author = normalizeMessageAuthor(message.origem);
          const mappedMessage: AtendimentoMessage = {
            id: message.mensagem_id,
            author,
            senderEmail: buildMessageSenderEmail(
              author,
              parsedMetadata,
              resolvedCompanyName,
              emailLeadByAtendimento.get(message.atendimento_id) || '',
            ),
            time: formatDateTime(message.created_at),
            contentHtml: sanitizeHtmlContent(rawContent),
            contentText,
            attachments: parseAttachmentList(message.anexos),
          };

          const existingMessages = messagesByAtendimento.get(message.atendimento_id) ?? [];
          existingMessages.push(mappedMessage);
          messagesByAtendimento.set(message.atendimento_id, existingMessages);

          if (!latestMessageAtByAtendimento.has(message.atendimento_id)) {
            latestMessageAtByAtendimento.set(message.atendimento_id, message.created_at);
          }

          if (!senderEmailByAtendimento.has(message.atendimento_id)) {
            const senderEmail = extractSenderEmail(parsedMetadata);

            if (senderEmail) {
              senderEmailByAtendimento.set(message.atendimento_id, senderEmail);
            }
          }
        });

        const mappedAtendimentos = rawAtendimentos.map((atendimento) => {
          const messages = messagesByAtendimento.get(atendimento.atendimento_id) ?? [];
          const latestMessage = messages[0] ?? null;
          const orderedMessages = [...messages].reverse();
          const senderEmail =
            senderEmailByAtendimento.get(atendimento.atendimento_id) ||
            atendimento.email_lead ||
            '';
          const subject = atendimento.assunto || 'Atendimento sem assunto';
          const lastActivityAt = latestMessage
            ? latestMessageAtByAtendimento.get(atendimento.atendimento_id) || atendimento.created_at
            : atendimento.created_at;

          return {
            atendimentoId: atendimento.atendimento_id,
            ticketLabel: atendimento.numero_ticket ? `#${atendimento.numero_ticket}` : 'Sem ticket',
            subject,
            customer: buildCustomerLabel(senderEmail),
            email: senderEmail || 'E-mail não identificado',
            preview: latestMessage
              ? buildSummary(latestMessage.contentText)
              : 'Nenhuma mensagem vinculada.',
            categoryKey: atendimento.categoria || 'OUTROS',
            category: formatCategoryLabel(atendimento.categoria),
            tag: formatStatusLabel(atendimento.status),
            createdAt: formatInboxDate(lastActivityAt),
            lastActivityAt,
            responsible:
              (atendimento.membro_id && responsibleById.get(atendimento.membro_id)) ||
              'Membro não identificado',
            messages: orderedMessages,
          } satisfies AtendimentoItem;
        });

        mappedAtendimentos.sort((left, right) => {
          return new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime();
        });

        if (!isMounted) {
          return;
        }

        setAtendimentos(mappedAtendimentos);
        setCompanyName(resolvedCompanyName);
        setSelectedAtendimentoId((currentSelectedAtendimentoId) => {
          if (
            currentSelectedAtendimentoId &&
            mappedAtendimentos.some(
              (atendimento) => atendimento.atendimentoId === currentSelectedAtendimentoId,
            )
          ) {
            return currentSelectedAtendimentoId;
          }

          return '';
        });
      } catch (error: any) {
        console.error('Erro ao carregar e-mails:', error);

        if (!isMounted) {
          return;
        }

        setAtendimentos([]);
        setSelectedAtendimentoId('');
        setCompanyName('');
        setExpandedMessageIds([]);
        setLoadError(error?.message || 'Não foi possível carregar os e-mails.');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadAtendimentos();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredAtendimentos = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return atendimentos.filter((atendimento) => {
      const matchesCategory = selectedCategories.includes(
        atendimento.categoryKey as AtendimentoCategory,
      );
      const matchesSearch =
        !normalizedSearch ||
        [
        atendimento.subject,
        atendimento.customer,
        atendimento.email,
        atendimento.preview,
        atendimento.category,
        atendimento.tag,
        atendimento.responsible,
        atendimento.ticketLabel,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });
  }, [atendimentos, search, selectedCategories]);

  const selectedAtendimento =
    filteredAtendimentos.find((item) => item.atendimentoId === selectedAtendimentoId) ?? null;

  useEffect(() => {
    const defaultExpandedMessageId =
      selectedAtendimento?.messages[selectedAtendimento.messages.length - 1]?.id ?? '';

    setExpandedMessageIds((currentExpandedMessageIds) => {
      const validExpandedMessageIds = currentExpandedMessageIds.filter((messageId) =>
        selectedAtendimento?.messages.some((message) => message.id === messageId),
      );

      if (validExpandedMessageIds.length > 0) {
        return validExpandedMessageIds;
      }

      return defaultExpandedMessageId ? [defaultExpandedMessageId] : [];
    });
  }, [selectedAtendimento]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center font-sans">
        <div className="h-10 w-10 rounded-full border-2 border-ink/15 border-t-ink animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-full w-full font-sans">
        <div
          className="rounded-tile border border-red-100 bg-red-50 px-5 py-4 text-[13px] text-red-600"
          style={{ fontWeight: 500 }}
        >
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full font-sans">
      <div className="flex h-full min-h-0 flex-col gap-4">
        <section className="flex flex-wrap items-center justify-between gap-4 px-1 pt-1">
          <div className="space-y-1">
            <h1 className="text-[22px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.02em' }}>
              E-mail
            </h1>
            <p className="text-[13.5px] text-muted" style={{ fontWeight: 500 }}>
              Visualize sua caixa de entrada e acompanhe o histórico de cada e-mail.
            </p>
          </div>
        </section>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <aside
            className={`min-h-0 flex-col rounded-panel border border-line-soft bg-card lg:flex ${
              selectedAtendimento ? 'max-lg:hidden' : 'max-lg:flex'
            }`}
          >
            <div className="border-b border-line-soft px-4 py-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-ink">
                  <Mail size={15} className="text-muted-soft" />
                  <span className="text-[13px]" style={{ fontWeight: 800 }}>
                    Caixa de entrada
                  </span>
                </div>
                <span
                  className="rounded-pill bg-stone px-2.5 py-0.5 text-[11px] text-muted"
                  style={{ fontWeight: 700 }}
                >
                  {filteredAtendimentos.length}
                </span>
              </div>

              <div className="relative">
                <div className="flex items-center gap-2">
                  <label className="flex h-10 flex-1 items-center gap-2.5 rounded-pill border border-line bg-paper px-3.5">
                    <Search size={14} className="shrink-0 text-muted-soft" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar e-mail"
                      className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-muted-soft"
                      style={{ fontWeight: 500 }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setIsCategoryFilterOpen((currentValue) => !currentValue)}
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill border transition-colors ${
                      isCategoryFilterOpen || selectedCategories.length !== CATEGORY_OPTIONS.length
                        ? 'border-lime bg-lime text-ink'
                        : 'border-line bg-paper text-muted hover:text-ink'
                    }`}
                    style={{ transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
                    aria-label="Filtrar categorias"
                    aria-expanded={isCategoryFilterOpen}
                  >
                    <SlidersHorizontal size={15} />
                  </button>
                </div>

                {isCategoryFilterOpen ? (
                  <div
                    className="absolute right-0 top-full z-20 mt-2 w-full max-w-[290px] rounded-panel border border-line-soft bg-card p-3"
                    style={{ boxShadow: '0 18px 40px -18px rgba(20,20,20,.35)' }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[12px] text-ink" style={{ fontWeight: 700 }}>
                          Filtrar categorias
                        </p>
                        <p className="text-[10.5px] text-muted-soft" style={{ fontWeight: 500 }}>
                          Selecione uma ou mais categorias
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedCategories([...CATEGORY_OPTIONS])}
                        className="text-[11px] text-muted-soft transition-colors hover:text-ink"
                        style={{ fontWeight: 700, transitionDuration: '.22s' }}
                      >
                        Todas
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {CATEGORY_OPTIONS.map((category) => {
                        const isSelected = selectedCategories.includes(category);

                        return (
                          <button
                            key={category}
                            type="button"
                            onClick={() =>
                              setSelectedCategories((currentSelectedCategories) => {
                                if (currentSelectedCategories.includes(category)) {
                                  return currentSelectedCategories.filter(
                                    (item) => item !== category,
                                  );
                                }

                                return [...currentSelectedCategories, category];
                              })
                            }
                            className={`flex w-full items-center justify-between rounded-tile px-3 py-2 text-left text-[12px] transition-colors ${
                              isSelected ? 'bg-lime text-ink' : 'bg-paper text-muted hover:bg-stone'
                            }`}
                            style={{ fontWeight: 700, transitionDuration: '.22s' }}
                            aria-pressed={isSelected}
                          >
                            <span>{formatCategoryLabel(category)}</span>
                            {isSelected ? <Check size={14} /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-2">
                {filteredAtendimentos.map((atendimento) => {
                  const isActive = atendimento.atendimentoId === selectedAtendimento?.atendimentoId;

                  return (
                    <button
                      key={atendimento.atendimentoId}
                      type="button"
                      onClick={() => setSelectedAtendimentoId(atendimento.atendimentoId)}
                      className={`w-full rounded-tile border px-3.5 py-3 text-left transition-all ${
                        isActive
                          ? 'border-ink/15 bg-paper'
                          : 'border-line-soft bg-card hover:border-ink/15 hover:bg-paper'
                      }`}
                      style={{ transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
                      aria-pressed={isActive}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <p
                            className="min-w-0 truncate text-[12.5px] text-ink"
                            style={{ fontWeight: 700 }}
                          >
                            {atendimento.email}
                          </p>
                          <span
                            className="shrink-0 whitespace-nowrap text-[10.5px] text-muted-soft"
                            style={{ fontWeight: 600 }}
                          >
                            {atendimento.createdAt}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <h3
                            className="line-clamp-1 text-[13px] leading-5 text-ink"
                            style={{ fontWeight: 700 }}
                          >
                            {atendimento.subject}
                          </h3>
                          <p
                            className="line-clamp-1 text-[11.5px] leading-5 text-muted"
                            style={{ fontWeight: 500 }}
                          >
                            {atendimento.preview}
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-0.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[9.5px] ${
                              atendimento.categoryKey === 'COTACAO'
                                ? 'bg-lime text-ink'
                                : 'bg-stone text-muted'
                            }`}
                            style={{ fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' }}
                          >
                            {atendimento.categoryKey === 'COTACAO' ? <Zap size={10} /> : null}
                            {atendimento.category}
                          </span>
                          <span
                            className="shrink-0 text-[10.5px] text-muted-soft"
                            style={{ fontWeight: 700 }}
                          >
                            {atendimento.ticketLabel}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {filteredAtendimentos.length === 0 ? (
                  <div className="flex h-40 items-center justify-center rounded-tile border border-dashed border-line px-6 text-center">
                    <p className="text-[12px] text-muted-soft" style={{ fontWeight: 500 }}>
                      Nenhum e-mail encontrado para esta busca.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>

          <section
            className={`min-h-0 overflow-hidden rounded-panel border border-line-soft bg-card lg:block ${
              selectedAtendimento ? 'max-lg:block' : 'max-lg:hidden'
            }`}
          >
            {selectedAtendimento ? (
              <div className="flex h-full min-h-0 flex-col">
                <header className="border-b border-line-soft px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setSelectedAtendimentoId('')}
                    className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-muted lg:hidden"
                    style={{ fontWeight: 700 }}
                  >
                    <ChevronRight size={14} className="rotate-180" />
                    Voltar para a caixa de entrada
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-paper px-2.5 py-1 text-[10.5px] text-muted"
                      style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                    >
                      <Hash size={11} />
                      {selectedAtendimento.ticketLabel.replace(/^#/, '')}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[10.5px] ${
                        selectedAtendimento.categoryKey === 'COTACAO'
                          ? 'bg-lime text-ink'
                          : 'bg-stone text-muted'
                      }`}
                      style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                    >
                      {selectedAtendimento.categoryKey === 'COTACAO' ? (
                        <Zap size={11} />
                      ) : (
                        <Tag size={11} />
                      )}
                      {selectedAtendimento.category}
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-pill bg-stone px-2.5 py-1 text-[10.5px] text-muted"
                      style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                    >
                      <Tag size={11} />
                      {selectedAtendimento.tag}
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-pill bg-stone px-2.5 py-1 text-[10.5px] text-muted"
                      style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                    >
                      <User size={11} />
                      {selectedAtendimento.responsible}
                    </span>
                  </div>

                  <h2
                    className="mt-2.5 text-[19px] text-ink"
                    style={{ fontWeight: 800, letterSpacing: '-.01em' }}
                  >
                    {selectedAtendimento.subject}
                  </h2>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto bg-paper p-4">
                  <div className="space-y-2.5">
                    {selectedAtendimento.messages.length > 0 ? (
                      selectedAtendimento.messages.map((message) => {
                        const isExpanded = expandedMessageIds.includes(message.id);
                        const originBadge =
                          message.author === 'IA' ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-pill bg-lime px-2 py-0.5 text-[9.5px] text-ink"
                              style={{ fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}
                            >
                              <Zap size={10} />
                              IA
                            </span>
                          ) : message.author === 'HUMANO' ? (
                            <span
                              className="rounded-pill bg-stone px-2 py-0.5 text-[9.5px] text-muted"
                              style={{ fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}
                            >
                              Humano
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
                            className="w-full rounded-panel border border-line-soft bg-card text-left transition-all hover:border-ink/15"
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
                                    <span
                                      className="truncate text-[12px] text-muted"
                                      style={{ fontWeight: 500 }}
                                    >
                                      {message.senderEmail}
                                    </span>
                                  </div>
                                  {!isExpanded ? (
                                    <p
                                      className="line-clamp-1 text-[12.5px] text-muted"
                                      style={{ fontWeight: 500 }}
                                    >
                                      {buildSummary(message.contentText)}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                              <span
                                className="shrink-0 text-[11px] text-muted-soft"
                                style={{ fontWeight: 700 }}
                              >
                                {message.time}
                              </span>
                            </button>

                            {message.author === 'IA' ? (
                              <div className="px-4 pb-3">
                                <MelhorarResposta mensagemId={message.id} variante="lista" />
                              </div>
                            ) : null}

                            {isExpanded ? (
                              <div className="space-y-3 border-t border-line-soft px-4 pb-4 pt-3.5">
                                <div
                                  className={messageHtmlClassName}
                                  dangerouslySetInnerHTML={{ __html: message.contentHtml }}
                                />
                                {message.attachments.length > 0 ? (
                                  <div className="flex flex-wrap gap-2 pt-1">
                                    {message.attachments.map((attachment) => (
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
                      <div className="flex h-24 items-center justify-center rounded-panel border border-dashed border-line bg-card px-4 text-center">
                        <p className="text-[11px] text-muted-soft" style={{ fontWeight: 500 }}>
                          Nenhuma mensagem vinculada a este e-mail.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-6">
                <div className="max-w-md rounded-panel border border-dashed border-line bg-paper px-8 py-10 text-center">
                  <p className="text-[16px] text-ink" style={{ fontWeight: 800 }}>
                    Nenhum e-mail selecionado
                  </p>
                  <p className="mt-2 text-[13px] leading-6 text-muted" style={{ fontWeight: 500 }}>
                    Escolha um e-mail na caixa de entrada para visualizar a conversa.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default EmailPage;
