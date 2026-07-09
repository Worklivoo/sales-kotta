import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Hash,
  Paperclip,
  Search,
  SlidersHorizontal,
  Tag,
  User,
  Zap,
} from 'lucide-react';
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
] as const;

type AtendimentoCategory = (typeof CATEGORY_OPTIONS)[number];

interface CurrentMemberRecord {
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
  content: string;
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

const decodeHtmlContent = (value: string) =>
  value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<\/?[^>]+>/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();

const normalizeAttachmentList = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) =>
      String(item)
        .replace(/`/g, '')
        .trim(),
    )
    .filter(Boolean);
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
    return 'Sem conteudo disponivel.';
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
    return `Hoje, as ${timeLabel}`;
  }

  if (diffInDays === 1) {
    return `Ontem, as ${timeLabel}`;
  }

  if (diffInDays > 1 && diffInDays < 7) {
    const weekdayLabel = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
    }).format(parsedDate);

    return `${weekdayLabel.charAt(0).toUpperCase() + weekdayLabel.slice(1)}, as ${timeLabel}`;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(parsedDate);
};

const normalizeMessageAuthor = (value: string | null): MessageAuthor => {
  const normalized = (value || 'HUMANO').toUpperCase();

  if (normalized === 'CLIENTE' || normalized === 'IA') {
    return normalized;
  }

  return 'HUMANO';
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
) => {
  const senderEmail = extractSenderEmail(metadata);

  if (senderEmail) {
    return senderEmail;
  }

  if (author === 'IA') {
    return 'IA';
  }

  if (author === 'HUMANO' && companyName) {
    return companyName;
  }

  return 'Email nao identificado';
};

const AtendimentosPage: React.FC = () => {
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
          throw new Error('Nao foi possivel identificar o usuario autenticado.');
        }

        const { data: currentMemberData, error: currentMemberError } = await supabase
          .from('sales_membros_empresa')
          .select('empresa_id, cargo')
          .eq('membro_id', session.user.id)
          .maybeSingle();

        if (currentMemberError) {
          throw currentMemberError;
        }

        const currentMember = currentMemberData as CurrentMemberRecord | null;

        if (!currentMember?.empresa_id) {
          throw new Error('Nao foi possivel identificar a empresa do usuario.');
        }

        let atendimentosQuery = supabase
          .from('sales_atendimento')
          .select(
            'atendimento_id, empresa_id, created_at, updated_at, status, categoria, assunto, numero_ticket, membro_id',
          )
          .eq('empresa_id', currentMember.empresa_id)
          .order('created_at', { ascending: false });

        if (currentMember.cargo !== 'ADMIN') {
          atendimentosQuery = atendimentosQuery.eq('membro_id', session.user.id);
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
            .from('sales_mensagens')
            .select('mensagem_id, atendimento_id, created_at, origem, conteudo, metadata, anexos')
            .eq('empresa_id', currentMember.empresa_id)
            .in('atendimento_id', atendimentoIds)
            .order('created_at', { ascending: false }),
          responsibleIds.length > 0
            ? supabase
                .from('sales_membros_empresa')
                .select('membro_id, nome')
                .eq('empresa_id', currentMember.empresa_id)
                .in('membro_id', responsibleIds)
            : Promise.resolve({ data: [], error: null }),
          currentMember.cargo === 'ADMIN'
            ? supabase
                .from('sales_empresa')
                .select('razao_social')
                .eq('empresa_id', currentMember.empresa_id)
                .maybeSingle()
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
          responsibleById.set(member.membro_id, member.nome || 'Membro nao identificado');
        });
        const resolvedCompanyName =
          ((companyResponse.data as EmpresaRecord | null)?.razao_social || '').trim();

        const messagesByAtendimento = new Map<string, AtendimentoMessage[]>();
        const senderEmailByAtendimento = new Map<string, string>();
        const latestMessageAtByAtendimento = new Map<string, string>();

        ((messagesResponse.data ?? []) as MensagemRecord[]).forEach((message) => {
          const parsedMetadata = parseJsonObject(message.metadata);
          const cleanContent = decodeHtmlContent(message.conteudo || 'Sem conteudo disponivel.');
          const author = normalizeMessageAuthor(message.origem);
          const mappedMessage: AtendimentoMessage = {
            id: message.mensagem_id,
            author,
            senderEmail: buildMessageSenderEmail(author, parsedMetadata, resolvedCompanyName),
            time: formatDateTime(message.created_at),
            content: cleanContent,
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
          const senderEmail = senderEmailByAtendimento.get(atendimento.atendimento_id) || '';
          const subject = atendimento.assunto || 'Atendimento sem assunto';
          const lastActivityAt = latestMessage
            ? latestMessageAtByAtendimento.get(atendimento.atendimento_id) || atendimento.created_at
            : atendimento.created_at;

          return {
            atendimentoId: atendimento.atendimento_id,
            ticketLabel: atendimento.numero_ticket ? `#${atendimento.numero_ticket}` : 'Sem ticket',
            subject,
            customer: buildCustomerLabel(senderEmail),
            email: senderEmail || 'Email nao identificado',
            preview: latestMessage ? buildSummary(latestMessage.content) : 'Nenhuma mensagem vinculada.',
            categoryKey: atendimento.categoria || 'OUTROS',
            category: formatCategoryLabel(atendimento.categoria),
            tag: formatStatusLabel(atendimento.status),
            createdAt: formatInboxDate(lastActivityAt),
            lastActivityAt,
            responsible:
              (atendimento.membro_id && responsibleById.get(atendimento.membro_id)) ||
              'Membro nao identificado',
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
        console.error('Erro ao carregar atendimentos:', error);

        if (!isMounted) {
          return;
        }

        setAtendimentos([]);
        setSelectedAtendimentoId('');
        setCompanyName('');
        setExpandedMessageIds([]);
        setLoadError(error?.message || 'Nao foi possivel carregar os atendimentos.');
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
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-black/10 border-t-black animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-full w-full">
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-medium text-red-600">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto xl:overflow-hidden">
      <div className="flex h-full min-h-full flex-col gap-4">
        <section className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-black/5 bg-white shadow-[0_16px_50px_rgba(15,23,42,0.06)] xl:overflow-hidden">
          <div className="grid min-h-0 grid-cols-1 xl:h-full xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col border-b border-black/5 xl:border-b-0 xl:border-r">
              <div className="border-b border-black/5 px-5 py-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <h1 className="text-sm font-semibold tracking-tight text-gray-900 sm:text-base">
                      Atendimentos
                    </h1>
                    <p className="text-xs text-gray-500">
                      Visualize sua caixa de entrada e acompanhe o historico de cada atendimento.
                    </p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                    {filteredAtendimentos.length}
                  </span>
                </div>

                <div className="relative">
                  <div className="flex items-center gap-2">
                    <label className="flex h-10 flex-1 items-center gap-3 rounded-xl border border-gray-200 bg-[#FAFAFA] px-3 transition-colors focus-within:border-gray-300">
                      <Search size={15} className="text-gray-400" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar atendimento"
                        className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => setIsCategoryFilterOpen((currentValue) => !currentValue)}
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                        isCategoryFilterOpen || selectedCategories.length !== CATEGORY_OPTIONS.length
                          ? 'border-[#EBF57D] bg-[#EBF57D] text-gray-900'
                          : 'border-gray-200 bg-[#FAFAFA] text-gray-500 hover:border-gray-300 hover:text-gray-700'
                      }`}
                      aria-label="Filtrar categorias"
                      aria-expanded={isCategoryFilterOpen}
                    >
                      <SlidersHorizontal size={16} />
                    </button>
                  </div>

                  {isCategoryFilterOpen ? (
                    <div className="absolute right-0 top-full z-20 mt-2 w-full max-w-[290px] rounded-2xl border border-black/10 bg-white p-3 shadow-[0_14px_40px_rgba(15,23,42,0.10)]">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-gray-900">Filtrar categorias</p>
                          <p className="text-[11px] text-gray-500">
                            Selecione uma ou mais categorias
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedCategories([...CATEGORY_OPTIONS])}
                          className="text-[11px] font-semibold text-gray-500 transition-colors hover:text-gray-800"
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
                              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors ${
                                isSelected
                                  ? 'bg-[#EBF57D] text-gray-900'
                                  : 'bg-[#FAFAFA] text-gray-600 hover:bg-gray-100'
                              }`}
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

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                <div className="space-y-2">
                  {filteredAtendimentos.map((atendimento) => {
                    const isActive = atendimento.atendimentoId === selectedAtendimento?.atendimentoId;

                    return (
                      <button
                        key={atendimento.atendimentoId}
                        type="button"
                        onClick={() => setSelectedAtendimentoId(atendimento.atendimentoId)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                          isActive
                            ? 'border-black/10 bg-[#F5F5F5] shadow-[0_8px_20px_rgba(15,23,42,0.06)]'
                            : 'border-transparent bg-white hover:border-black/5 hover:bg-[#FAFAFA]'
                        }`}
                        aria-pressed={isActive}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-semibold text-gray-900 sm:truncate">
                                {atendimento.email}
                              </p>
                            </div>

                            <span className="shrink-0 whitespace-nowrap text-[11px] font-medium text-gray-400">
                              {atendimento.createdAt}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <h3 className="line-clamp-1 text-[13px] font-semibold leading-5 text-gray-800">
                              {atendimento.subject}
                            </h3>
                            <p className="line-clamp-1 text-[12px] leading-5 text-gray-500">
                              {atendimento.preview}
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-3 pt-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex max-w-full items-center gap-1.5 break-words rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                                  atendimento.categoryKey === 'COTACAO'
                                    ? 'bg-[#EBF57D] text-gray-900'
                                    : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {atendimento.categoryKey === 'COTACAO' ? <Zap size={10} /> : null}
                                {atendimento.category}
                              </span>
                            </div>
                            <span className="shrink-0 text-[11px] font-medium text-gray-400">
                              {atendimento.ticketLabel}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {filteredAtendimentos.length === 0 ? (
                    <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-[#FAFAFA] px-6 text-center">
                      <p className="text-sm font-medium text-gray-400">
                        Nenhum atendimento encontrado para esta busca.
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </aside>

            <section className="min-h-0 bg-[#FCFCFC]">
              {selectedAtendimento ? (
                <div className="flex h-full min-h-0 flex-col">
                  <header className="border-b border-black/5 bg-white px-4 py-4 sm:px-6 sm:py-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">
                            <Hash size={12} />
                            {selectedAtendimento.ticketLabel.replace(/^#/, '')}
                          </span>
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ${
                              selectedAtendimento.categoryKey === 'COTACAO'
                                ? 'bg-[#EBF57D] text-gray-900'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {selectedAtendimento.categoryKey === 'COTACAO' ? (
                              <Zap size={12} />
                            ) : (
                              <Tag size={12} />
                            )}
                            {selectedAtendimento.category}
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-500">
                            <Tag size={12} />
                            {selectedAtendimento.tag}
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-500">
                            <User size={12} />
                            {selectedAtendimento.responsible}
                          </span>
                        </div>

                        <div>
                          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
                            {selectedAtendimento.subject}
                          </h2>
                        </div>
                      </div>
                    </div>
                  </header>

                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
                    <div className="w-full">
                      <div className="min-w-0 space-y-4">
                        {selectedAtendimento.messages.length > 0 ? (
                          selectedAtendimento.messages.map((message) => {
                            const isExpanded = expandedMessageIds.includes(message.id);

                            return (
                              <div
                                key={message.id}
                                className={`w-full rounded-2xl border border-black/5 bg-white text-left shadow-[0_10px_32px_rgba(15,23,42,0.04)] transition-all ${
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
                                                  {message.author}
                                                </span>
                                                <span className="mt-0.5 block break-all text-sm text-gray-500 sm:mt-0 sm:inline sm:break-all sm:pl-2">
                                                  {message.senderEmail}
                                                </span>
                                              </div>
                                            </div>
                                          </div>

                                          <p className="shrink-0 text-xs font-medium text-gray-400">
                                            {message.time}
                                          </p>
                                        </button>

                                        {isExpanded ? (
                                          <div className="mt-5 space-y-3">
                                            <p className="overflow-hidden break-words whitespace-pre-line text-sm leading-7 text-gray-600">
                                              {message.content}
                                            </p>
                                            {message.attachments.length > 0 ? (
                                              <div className="flex flex-wrap gap-2 pt-1">
                                                {message.attachments.map((attachment) => (
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
                                            {buildSummary(message.content)}
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
                          <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                            <p className="text-sm font-medium text-gray-400">
                              Nenhuma mensagem vinculada a este atendimento.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center px-6">
                  <div className="max-w-md rounded-3xl border border-dashed border-gray-200 bg-white px-8 py-10 text-center shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                    <p className="text-lg font-semibold text-gray-800">
                      Nenhum atendimento selecionado
                    </p>
                    <p className="mt-2 text-sm leading-6 text-gray-500">
                      Escolha um atendimento na caixa de entrada para visualizar a conversa.
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AtendimentosPage;
