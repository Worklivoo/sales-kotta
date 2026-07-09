import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Paperclip } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CotacaoPageProps {
  atendimentoId: string;
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
  corpo: string;
  anexos: string[];
}

const kanbanStages = [
  'TRIAGEM',
  'COLETANDO_DADOS',
  'AGUARDANDO_APROVACAO',
  'ORCAMENTO_ENVIADO',
  'CONCLUIDO',
  'DESCARTADO',
] as const;

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

const formatKanbanLabel = (status: string) =>
  status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

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

const CotacaoPage: React.FC<CotacaoPageProps> = ({ atendimentoId }) => {
  const [cotacao, setCotacao] = useState<AtendimentoRecord | null>(null);
  const [responsibleName, setResponsibleName] = useState('Membro nao identificado');
  const [orderedConversationItems, setOrderedConversationItems] = useState<ConversationItem[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [emailsVinculados, setEmailsVinculados] = useState<string[]>([]);
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

        let atendimentoQuery = supabase
          .from('sales_atendimento')
          .select(
            'atendimento_id, empresa_id, created_at, status, categoria, assunto, numero_ticket, membro_id',
          )
          .eq('empresa_id', currentMember.empresa_id)
          .eq('atendimento_id', atendimentoId)
          .eq('categoria', 'COTACAO');

        if (currentMember.cargo !== 'ADMIN') {
          atendimentoQuery = atendimentoQuery.eq('membro_id', session.user.id);
        }

        const { data: atendimentoData, error: atendimentoError } =
          await atendimentoQuery.maybeSingle();

        if (atendimentoError) {
          throw atendimentoError;
        }

        const atendimento = atendimentoData as AtendimentoRecord | null;

        if (!atendimento) {
          throw new Error('Cotacao nao encontrada.');
        }

        const [messagesResponse, responsibleResponse] = await Promise.all([
          supabase
            .from('sales_mensagens')
            .select('mensagem_id, created_at, origem, conteudo, metadata, anexos')
            .eq('empresa_id', currentMember.empresa_id)
            .eq('atendimento_id', atendimento.atendimento_id)
            .order('created_at', { ascending: false }),
          atendimento.membro_id
            ? supabase
                .from('sales_membros_empresa')
                .select('nome')
                .eq('empresa_id', currentMember.empresa_id)
                .eq('membro_id', atendimento.membro_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (messagesResponse.error) {
          throw messagesResponse.error;
        }

        if (responsibleResponse.error) {
          throw responsibleResponse.error;
        }

        const resolvedResponsibleName =
          (responsibleResponse.data as ResponsibleMemberRecord | null)?.nome ||
          'Membro nao identificado';
        const cotacaoAssunto = atendimento.assunto || 'Cotacao sem assunto';
        const rawMessages = (messagesResponse.data ?? []) as MensagemRecord[];
        const metadataEmailBucket = new Set<string>();

        const mappedMessages = rawMessages.map((message) => {
          const parsedMetadata = parseJsonObject(message.metadata);
          const cleanContent = decodeHtmlContent(message.conteudo || 'Sem conteudo disponivel.');

          collectEmailsFromValue(parsedMetadata, metadataEmailBucket);

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
            resumo: buildSummary(cleanContent),
            corpo: cleanContent,
            anexos: parseAttachmentList(message.anexos),
          };
        });

        if (!isMounted) {
          return;
        }

        setCotacao(atendimento);
        setResponsibleName(resolvedResponsibleName);
        setOrderedConversationItems(mappedMessages);
        setSelectedMessageId((currentSelectedMessageId) => {
          if (
            currentSelectedMessageId &&
            mappedMessages.some((message) => message.id === currentSelectedMessageId)
          ) {
            return currentSelectedMessageId;
          }

          return mappedMessages[0]?.id ?? null;
        });
        setEmailsVinculados(Array.from(metadataEmailBucket));
      } catch (error: any) {
        console.error('Erro ao carregar cotacao:', error);

        if (!isMounted) {
          return;
        }

        setCotacao(null);
        setResponsibleName('Membro nao identificado');
        setOrderedConversationItems([]);
        setSelectedMessageId(null);
        setEmailsVinculados([]);
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
  }, [atendimentoId]);

  const highlightedMessage = useMemo(
    () =>
      orderedConversationItems.find((message) => message.id === selectedMessageId) ??
      orderedConversationItems[0] ??
      null,
    [orderedConversationItems, selectedMessageId],
  );

  const currentKanbanStage = useMemo(
    () => cotacao?.status ?? null,
    [cotacao],
  );

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
    <div className="h-full w-full overflow-y-auto" data-atendimento-id={atendimentoId}>
      <div className="flex min-h-full flex-col gap-4 pb-2">
        <section className="rounded-2xl border border-black/5 bg-white px-5 py-5 shadow-[0_6px_24px_rgba(15,23,42,0.04)] lg:px-6">
          <div className="space-y-2">
            <span className="inline-flex rounded-full border border-black/10 bg-[#F6F6F6] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              {cotacao.numero_ticket ? `#${cotacao.numero_ticket}` : 'Sem ticket'}
            </span>
            <h1 className="text-[28px] font-semibold tracking-tight text-gray-900">
              {cotacao.assunto || 'Cotacao sem assunto'}
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-gray-500">
              {formatDateTime(cotacao.created_at)}
            </p>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-gray-400">
              {responsibleName}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_6px_24px_rgba(15,23,42,0.035)] lg:p-5">
          <div className="mb-4 flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Status da Cotação</h2>
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-[980px] items-start gap-3">
              {kanbanStages.map((stage, index) => {
                const currentStageIndex = currentKanbanStage
                  ? kanbanStages.indexOf(currentKanbanStage)
                  : -1;
                const isCurrent = stage === currentKanbanStage;
                const isCompleted = currentStageIndex >= 0 && index < currentStageIndex;

                return (
                  <React.Fragment key={stage}>
                    <div
                      className={`min-w-[150px] flex-1 rounded-2xl border px-4 py-4 transition-all ${
                        isCurrent
                          ? 'border-[#EBF57D] bg-[#EBF57D] text-gray-900 shadow-[0_10px_24px_rgba(235,245,125,0.35)]'
                          : isCompleted
                            ? 'border-black/10 bg-[#F6F6F6] text-gray-800'
                            : 'border-black/5 bg-white text-gray-500'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                            isCurrent
                              ? 'bg-white/60 text-gray-900'
                              : isCompleted
                                ? 'bg-white text-gray-700'
                                : 'bg-[#F6F6F6] text-gray-400'
                          }`}
                        >
                          Etapa {index + 1}
                        </span>
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            isCurrent
                              ? 'bg-gray-900'
                              : isCompleted
                                ? 'bg-[#EBF57D]'
                                : 'bg-gray-300'
                          }`}
                        />
                      </div>

                      <p className="mt-4 text-sm font-semibold leading-5">
                        {formatKanbanLabel(stage)}
                      </p>
                    </div>

                    {index < kanbanStages.length - 1 ? (
                      <div className="flex items-center pt-7">
                        <div
                          className={`h-[2px] w-8 ${
                            currentStageIndex >= 0 && index < currentStageIndex
                              ? 'bg-[#EBF57D]'
                              : 'bg-black/10'
                          }`}
                        />
                      </div>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </section>

        <section>
          <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_6px_24px_rgba(15,23,42,0.035)] lg:p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="rounded-xl bg-[#F6F6F6] p-2 text-gray-600">
                <Mail size={18} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Emails vinculados</h2>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {emailsVinculados.length > 0 ? (
                emailsVinculados.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center rounded-xl border border-black/10 bg-[#FAFAFA] px-3 py-2 text-sm font-medium text-gray-700"
                  >
                    {email}
                  </span>
                ))
              ) : (
                <span className="inline-flex rounded-xl border border-dashed border-black/10 bg-[#FAFAFA] px-3 py-2 text-xs font-medium text-gray-400">
                  Nenhum email vinculado encontrado
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="min-h-0 flex-1 rounded-2xl border border-black/5 bg-white p-4 shadow-[0_6px_24px_rgba(15,23,42,0.035)] lg:p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Atendimento</h2>
            </div>
          </div>

          <div className="grid min-h-[640px] gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-black/5 bg-[#FAFAFA] p-3">
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <h3 className="text-sm font-semibold text-gray-800">Mensagens</h3>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-gray-500">
                  {orderedConversationItems.length}
                </span>
              </div>

              <div className="space-y-2">
                {orderedConversationItems.length > 0 ? (
                  orderedConversationItems.map((message) => {
                    const isSelected = message.id === highlightedMessage?.id;

                    return (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => setSelectedMessageId(message.id)}
                        className={`w-full rounded-2xl border px-4 py-4 text-left transition-all ${
                          isSelected
                            ? 'border-black/10 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.06)]'
                            : 'border-transparent bg-white/60 hover:border-black/10 hover:bg-white'
                        }`}
                        aria-pressed={isSelected}
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                              {message.origem}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-800">
                              {message.remetente}
                            </p>
                          </div>
                          <p className="text-[11px] font-medium text-gray-400">
                            {message.horario}
                          </p>
                        </div>

                        <p className="line-clamp-2 text-sm font-semibold leading-5 text-gray-800">
                          {message.assunto}
                        </p>
                        <p className="mt-2 line-clamp-3 text-xs leading-5 text-gray-500">
                          {message.resumo}
                        </p>
                      </button>
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
            </aside>

            <div className="flex min-h-[640px] flex-col rounded-2xl border border-black/5 bg-[#FAFAFA]">
              {highlightedMessage ? (
                <>
                  <div className="border-b border-black/5 px-5 py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                            Assunto
                          </p>
                          <h3 className="mt-1 text-lg font-semibold text-gray-900">
                            {highlightedMessage.assunto}
                          </h3>
                        </div>

                        <div className="grid gap-3 lg:grid-cols-2">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                              Remetente
                            </p>
                            <p className="mt-1 text-sm font-medium text-gray-700">
                              {highlightedMessage.remetente}
                            </p>
                          </div>

                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                              Copia
                            </p>
                            <p className="mt-1 text-sm font-medium text-gray-700">
                              {highlightedMessage.copia}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-black/5 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                          Recebido em
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-800">
                          {highlightedMessage.horario}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-4 px-5 py-5">
                    <div className="rounded-2xl border border-black/5 bg-white px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                        Conteudo do email
                      </p>
                      <div className="mt-3 whitespace-pre-line text-sm leading-7 text-gray-700">
                        {highlightedMessage.corpo}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-black/5 bg-white px-4 py-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Paperclip size={16} className="text-gray-500" />
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                          Anexos
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {highlightedMessage.anexos.length > 0 ? (
                          highlightedMessage.anexos.map((attachment) => (
                            <a
                              key={attachment}
                              href={attachment}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-[#FAFAFA] px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-black/20 hover:bg-white"
                            >
                              <Paperclip size={14} />
                              {getAttachmentLabel(attachment)}
                            </a>
                          ))
                        ) : (
                          <span className="inline-flex rounded-xl border border-dashed border-black/10 bg-[#FAFAFA] px-3 py-2 text-xs font-medium text-gray-400">
                            Nenhum anexo vinculado
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center px-6 text-center">
                  <p className="text-sm font-medium text-gray-400">
                    Nenhuma mensagem disponivel para exibir neste atendimento.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CotacaoPage;
