import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarRange,
  Mail,
  MessageCircle,
  Search,
  SlidersHorizontal,
  TrendingUp,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type KanbanStatus =
  | 'TRIAGEM'
  | 'COLETANDO_DADOS'
  | 'AGUARDANDO_APROVACAO'
  | 'ORCAMENTO_ENVIADO'
  | 'CONCLUIDO'
  | 'DESCARTADO';

interface CardCotacao {
  atendimentoId: string;
  empresaId: string;
  numeroTicket: string;
  isNovoCliente: boolean;
  titulo: string;
  membro: string;
  membroId: string;
  dataEntrada: string;
  status: KanbanStatus;
  valorFormatado: string | null;
  valorNumerico: number;
  origem: 'EMAIL' | 'WHATSAPP' | null;
}

const KANBAN_COLUMNS: Array<{
  key: KanbanStatus;
  label: string;
  isAiStage?: boolean;
}> = [
  { key: 'TRIAGEM', label: 'Triagem', isAiStage: true },
  { key: 'COLETANDO_DADOS', label: 'Coletando Dados', isAiStage: true },
  { key: 'AGUARDANDO_APROVACAO', label: 'Aguardando Aprovação' },
  { key: 'ORCAMENTO_ENVIADO', label: 'Orçamento Enviado' },
  { key: 'CONCLUIDO', label: 'Concluído' },
  { key: 'DESCARTADO', label: 'Descartado' },
];

interface MemberOption {
  membro_id: string;
  nome: string;
}

interface MemberRecord {
  membro_id: string;
  empresa_id: string;
  cargo: string | null;
  nome: string | null;
}

interface AtendimentoRow {
  atendimento_id: string;
  empresa_id: string;
  assunto: string | null;
  status: KanbanStatus;
  categoria: string;
  created_at: string;
  numero_ticket: number | null;
  membro_id: string | null;
  cliente_id: string | null;
  origem: 'EMAIL' | 'WHATSAPP' | null;
  email_lead: string | null;
  telefone_lead: string | null;
}

interface OrcamentoValorRow {
  atendimento_id: string;
  valor_total: number | null;
}

interface NotificationUnreadRow {
  atendimento_id: string | null;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatDate = (value: string) => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR').format(parsedDate);
};

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10) {
    return value;
  }
  const ddd = digits.slice(-11, -9);
  const rest = digits.slice(-9);
  const middle = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
  const end = rest.length === 9 ? rest.slice(5) : rest.slice(4);
  return `(${ddd}) ${middle}-${end}`;
};

const tituloDoAtendimento = (item: AtendimentoRow) => {
  if (item.assunto) {
    return item.assunto;
  }
  if (item.origem === 'WHATSAPP' && item.telefone_lead) {
    return formatPhone(item.telefone_lead);
  }
  if (item.email_lead) {
    return item.email_lead;
  }
  return 'Cotação sem identificação';
};

interface CotacoesPageProps {
  onOpenCotacao: (empresaId: string, numeroTicket: string) => void;
}

const CotacoesPage: React.FC<CotacoesPageProps> = ({ onOpenCotacao }) => {
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedMember, setSelectedMember] = useState('Todos');
  const [cotacoes, setCotacoes] = useState<CardCotacao[]>([]);
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
  const [unreadNotificationsByAtendimento, setUnreadNotificationsByAtendimento] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadCotacoes = async () => {
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

        const { data: memberRecord, error: memberRecordError } = await supabase
          .from('sales_membros_v2')
          .select('membro_id, empresa_id, cargo, nome')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (memberRecordError) {
          throw memberRecordError;
        }

        const currentMember = memberRecord as MemberRecord | null;

        if (!currentMember?.empresa_id) {
          throw new Error('Nao foi possivel identificar a empresa do usuario.');
        }

        const adminAccess = currentMember.cargo === 'ADMIN';

        const cotacoesQuery = supabase
          .from('sales_atendimentos_v2')
          .select(
            'atendimento_id, empresa_id, assunto, status, categoria, created_at, numero_ticket, membro_id, cliente_id, origem, email_lead, telefone_lead',
          )
          .eq('empresa_id', currentMember.empresa_id)
          .in('categoria', ['COTACAO', 'PEDIDO_COMPRA'])
          .order('created_at', { ascending: false });

        const scopedCotacoesQuery = adminAccess
          ? cotacoesQuery
          : cotacoesQuery.eq('membro_id', currentMember.membro_id);

        const [membersResponse, cotacoesResponse, notificationsResponse] = await Promise.all([
          adminAccess
            ? supabase
                .from('sales_membros_v2')
                .select('membro_id, nome')
                .eq('empresa_id', currentMember.empresa_id)
                .order('nome', { ascending: true })
            : Promise.resolve({
                data: [
                  {
                    membro_id: currentMember.membro_id,
                    nome: currentMember.nome || 'Meu usuário',
                  },
                ],
                error: null,
              }),
          scopedCotacoesQuery,
          supabase
            .from('sales_notificacoes_v2')
            .select('atendimento_id')
            .eq('membro_id', currentMember.membro_id)
            .eq('lida', false)
            .neq('tipo', 'ERRO_AUTOMACAO'),
        ]);

        if (membersResponse.error) {
          throw membersResponse.error;
        }

        if (cotacoesResponse.error) {
          throw cotacoesResponse.error;
        }

        if (notificationsResponse.error) {
          throw notificationsResponse.error;
        }

        const atendimentos = (cotacoesResponse.data ?? []) as AtendimentoRow[];
        const atendimentoIds = atendimentos.map((item) => item.atendimento_id);

        const { data: orcamentosData, error: orcamentosError } = atendimentoIds.length
          ? await supabase
              .from('sales_orcamentos_v2')
              .select('atendimento_id, valor_total')
              .in('atendimento_id', atendimentoIds)
          : { data: [] as OrcamentoValorRow[], error: null };

        if (orcamentosError) {
          throw orcamentosError;
        }

        const valorPorAtendimento = new Map(
          ((orcamentosData ?? []) as OrcamentoValorRow[]).map((item) => [item.atendimento_id, item.valor_total]),
        );

        const members = (membersResponse.data ?? []) as MemberOption[];
        const memberNameById = new Map(
          members.map((member) => [member.membro_id, member.nome || 'Sem nome']),
        );
        const unreadNotificationsMap = ((notificationsResponse.data ?? []) as NotificationUnreadRow[]).reduce(
          (bucket, notification) => {
            if (!notification.atendimento_id) {
              return bucket;
            }

            bucket[notification.atendimento_id] = (bucket[notification.atendimento_id] ?? 0) + 1;
            return bucket;
          },
          {} as Record<string, number>,
        );

        const mappedCotacoes: CardCotacao[] = atendimentos.map((item) => {
          const ticketNumber = item.numero_ticket ? `#${item.numero_ticket}` : 'Sem ticket';
          const memberName = memberNameById.get(item.membro_id || '') || 'Membro não identificado';
          const valor = valorPorAtendimento.get(item.atendimento_id);

          return {
            atendimentoId: item.atendimento_id,
            empresaId: item.empresa_id,
            numeroTicket: item.numero_ticket ? String(item.numero_ticket) : '',
            isNovoCliente: !item.cliente_id,
            titulo: tituloDoAtendimento(item),
            membro: memberName,
            membroId: item.membro_id || '',
            dataEntrada: item.created_at,
            status: item.status,
            valorFormatado: valor != null ? currencyFormatter.format(valor) : ticketNumber,
            valorNumerico: valor ?? 0,
            origem: item.origem,
          };
        });

        if (!isMounted) {
          return;
        }

        setMemberOptions(members);
        setCotacoes(mappedCotacoes);
        setUnreadNotificationsByAtendimento(unreadNotificationsMap);
        setIsAdmin(adminAccess);
      } catch (error: any) {
        console.error('Erro ao carregar cotacoes:', error);

        if (!isMounted) {
          return;
        }

        setLoadError(error?.message || 'Nao foi possivel carregar as cotacoes.');
        setUnreadNotificationsByAtendimento({});
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadCotacoes();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredCotacoes = useMemo(() => {
    return cotacoes.filter((cotacao) => {
      const matchesSearch = cotacao.titulo.toLowerCase().includes(search.toLowerCase());
      const matchesMember =
        selectedMember === 'Todos' || cotacao.membroId === selectedMember;
      const cotacaoDate = cotacao.dataEntrada.slice(0, 10);
      const matchesStartDate = !startDate || cotacaoDate >= startDate;
      const matchesEndDate = !endDate || cotacaoDate <= endDate;

      return matchesSearch && matchesMember && matchesStartDate && matchesEndDate;
    });
  }, [cotacoes, endDate, search, selectedMember, startDate]);

  const pipelineStat = useMemo(() => {
    const cotacoesAbertas = cotacoes.filter(
      (cotacao) => cotacao.status !== 'CONCLUIDO' && cotacao.status !== 'DESCARTADO',
    );
    const total = cotacoesAbertas.reduce((sum, cotacao) => sum + cotacao.valorNumerico, 0);

    return {
      count: cotacoesAbertas.length,
      valorFormatado: currencyFormatter.format(total),
    };
  }, [cotacoes]);

  const hasActiveFilters = Boolean(search || startDate || endDate || selectedMember !== 'Todos');

  const clearFilters = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
    setSelectedMember('Todos');
  };

  return (
    <div className="h-full min-h-0 w-full font-sans">
      <div className="flex h-full min-h-0 flex-col gap-4 max-lg:gap-2">
        <section className="flex flex-wrap items-end justify-between gap-4 px-1 pt-1 max-lg:items-center max-lg:gap-2">
          <div className="space-y-1 max-lg:space-y-0">
            <h1 className="text-[23px] text-ink max-lg:text-[18px]" style={{ fontWeight: 800, letterSpacing: '-.025em' }}>
              Funil de Cotações
            </h1>
            <p className="text-[13.5px] text-muted max-lg:hidden" style={{ fontWeight: 500 }}>
              Gerencie suas cotações e oportunidades de vendas.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-panel bg-ink px-5 py-3 max-lg:gap-2 max-lg:px-3 max-lg:py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-tile bg-lime max-lg:h-7 max-lg:w-7">
              <TrendingUp size={16} className="text-ink max-lg:hidden" strokeWidth={2.25} />
              <TrendingUp size={13} className="hidden text-ink max-lg:block" strokeWidth={2.25} />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] text-white/55 max-lg:hidden" style={{ fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                Em aberto no funil
              </p>
              <p className="text-[15px] text-white max-lg:text-[12.5px]" style={{ fontWeight: 800 }}>
                {pipelineStat.valorFormatado}
                <span className="ml-1.5 text-white/55" style={{ fontWeight: 500 }}>
                  · {pipelineStat.count} {pipelineStat.count === 1 ? 'cotação' : 'cotações'}
                </span>
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-2 px-1">
          <div className="flex h-10 min-w-[240px] flex-1 items-center gap-2.5 rounded-pill border border-line bg-card px-4 max-lg:min-w-0">
            <Search size={14} className="text-muted-soft shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pelo nome da cotação"
              className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted-soft"
              style={{ fontWeight: 500 }}
            />
          </div>

          <button
            type="button"
            onClick={() => setIsMobileFiltersOpen((current) => !current)}
            aria-expanded={isMobileFiltersOpen}
            aria-label="Mostrar filtros"
            className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-pill border transition-colors max-lg:flex ${
              isMobileFiltersOpen || hasActiveFilters
                ? 'border-lime bg-lime text-ink'
                : 'border-line bg-card text-muted'
            }`}
            style={{ transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
          >
            <SlidersHorizontal size={15} />
          </button>

          <div
            className={`flex w-full flex-wrap items-center gap-2 max-lg:mt-2 lg:contents ${
              isMobileFiltersOpen ? '' : 'max-lg:hidden'
            }`}
          >
            <div className="flex h-10 items-center gap-2 rounded-pill border border-line bg-card pl-4 pr-3.5 max-lg:w-full">
              <CalendarRange size={14} className="text-muted-soft shrink-0" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[112px] bg-transparent text-[12.5px] text-ink outline-none max-lg:w-full"
                style={{ fontWeight: 500 }}
              />
              <span className="text-muted-soft">–</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[112px] bg-transparent text-[12.5px] text-ink outline-none max-lg:w-full"
                style={{ fontWeight: 500 }}
              />
            </div>

            {isAdmin ? (
              <div className="flex h-10 items-center gap-2 rounded-pill border border-line bg-card pl-4 pr-3.5 max-lg:w-full">
                <UserRound size={14} className="text-muted-soft shrink-0" />
                <select
                  value={selectedMember}
                  onChange={(e) => setSelectedMember(e.target.value)}
                  className="bg-transparent text-[13px] text-ink outline-none max-lg:w-full"
                  style={{ fontWeight: 500 }}
                >
                  <option value="Todos">Todos</option>
                  {memberOptions.map((member) => (
                    <option key={member.membro_id} value={member.membro_id}>
                      {member.nome}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="flex h-10 items-center gap-1.5 rounded-pill px-3.5 text-[12.5px] text-muted hover:text-ink"
                style={{ fontWeight: 700, transition: 'color .22s var(--ease)' }}
              >
                <X size={13} />
                Limpar
              </button>
            ) : null}
          </div>
        </section>

        <section className="min-h-0 flex flex-1 flex-col overflow-hidden">
          {loadError ? (
            <div className="mb-4 shrink-0 rounded-tile border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-600" style={{ fontWeight: 500 }}>
              {loadError}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-2">
            <div className="grid h-full min-h-0 min-w-max grid-flow-col auto-cols-[85vw] gap-3 pr-2 sm:auto-cols-[280px] sm:gap-4 md:auto-cols-[320px] xl:auto-cols-[340px]">
              {KANBAN_COLUMNS.map((column) => {
                const columnItems = filteredCotacoes.filter(
                  (cotacao) => cotacao.status === column.key,
                );

                return (
                  <div
                    key={column.key}
                    className="flex h-full min-h-0 min-w-0 flex-col rounded-panel border border-line-soft bg-paper p-3"
                  >
                    <div className="mb-3 flex shrink-0 items-center justify-between gap-3 px-1 py-1">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3
                            className="truncate text-[11.5px] text-muted"
                            style={{ fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}
                          >
                            {column.label}
                          </h3>
                          {column.isAiStage ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-pill bg-lime px-2 py-[3px] text-[9.5px] text-ink"
                              style={{ fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}
                            >
                              <Zap size={10} />
                              IA
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span
                        className="rounded-[6px] bg-card px-2 py-0.5 text-[11.5px] text-muted"
                        style={{ fontWeight: 700 }}
                      >
                        {columnItems.length}
                      </span>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-3 pr-1">
                      {isLoading ? (
                        Array.from({ length: 2 }).map((_, index) => (
                          <div
                            key={`${column.key}-loading-${index}`}
                            className="rounded-[11px] border border-line-soft bg-card p-3"
                          >
                            <div className="animate-pulse space-y-3">
                              <div className="h-3 w-20 rounded bg-stone-deep" />
                              <div className="h-4 w-3/4 rounded bg-stone-deep" />
                              <div className="h-3 w-1/2 rounded bg-stone" />
                              <div className="h-3 w-2/3 rounded bg-stone" />
                            </div>
                          </div>
                        ))
                      ) : columnItems.length > 0 ? (
                        columnItems.map((cotacao) => {
                          const unreadNotificationCount =
                            unreadNotificationsByAtendimento[cotacao.atendimentoId] ?? 0;
                          const showClientBadge =
                            cotacao.status !== 'TRIAGEM' &&
                            cotacao.status !== 'COLETANDO_DADOS';
                          const OrigemIcon = cotacao.origem === 'WHATSAPP' ? MessageCircle : Mail;

                          return (
                            <button
                              key={cotacao.atendimentoId}
                              type="button"
                              onClick={() => onOpenCotacao(cotacao.empresaId, cotacao.numeroTicket)}
                              className="w-full rounded-[11px] border border-line-soft bg-card p-3 text-left transition-all hover:border-ink/15"
                              style={{ transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
                            >
                              <div className="space-y-3">
                                {showClientBadge ? (
                                  <>
                                    <div className="flex items-center justify-between gap-3">
                                      {cotacao.isNovoCliente ? (
                                        <span
                                          className="rounded-[6px] bg-lime px-1.5 py-0.5 text-[9px] text-ink"
                                          style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}
                                        >
                                          Novo Cliente
                                        </span>
                                      ) : (
                                        <span
                                          className="rounded-[6px] bg-stone px-1.5 py-0.5 text-[9px] text-muted"
                                          style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}
                                        >
                                          Cliente
                                        </span>
                                      )}

                                      <div className="ml-auto flex items-center gap-2">
                                        {unreadNotificationCount > 0 ? (
                                          <span className="flex min-w-[20px] items-center justify-center rounded-pill bg-red-600 px-1.5 py-0.5 text-[10px] leading-none text-white" style={{ fontWeight: 700 }}>
                                            {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                                          </span>
                                        ) : null}

                                        <div className="flex items-center gap-1.5">
                                          <OrigemIcon size={13} className="text-muted-soft" />
                                          <span className="text-[12px] text-ink" style={{ fontWeight: 700 }}>
                                            {cotacao.valorFormatado}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    <h4 className="line-clamp-2 text-[13px] leading-5 text-ink" style={{ fontWeight: 700 }}>
                                      {cotacao.titulo}
                                    </h4>
                                  </>
                                ) : (
                                  <div className="flex items-start justify-between gap-3">
                                    <h4 className="line-clamp-2 flex-1 text-[13px] leading-5 text-ink" style={{ fontWeight: 700 }}>
                                      {cotacao.titulo}
                                    </h4>

                                    <div className="flex shrink-0 items-center gap-2 pl-2">
                                      {unreadNotificationCount > 0 ? (
                                        <span className="flex min-w-[20px] items-center justify-center rounded-pill bg-red-600 px-1.5 py-0.5 text-[10px] leading-none text-white" style={{ fontWeight: 700 }}>
                                          {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                                        </span>
                                      ) : null}

                                      <div className="flex items-center gap-1.5">
                                        <OrigemIcon size={13} className="text-muted-soft" />
                                        <span className="text-[12px] text-ink" style={{ fontWeight: 700 }}>
                                          {cotacao.valorFormatado}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                <div className="space-y-1.5 border-t border-line-soft pt-3">
                                  <div className="flex items-center justify-between gap-3 text-[11px]">
                                    <span className="text-muted-soft" style={{ fontWeight: 500 }}>Responsável</span>
                                    <span className="truncate text-right text-muted" style={{ fontWeight: 700 }}>
                                      {cotacao.membro}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 text-[11px]">
                                    <span className="text-muted-soft" style={{ fontWeight: 500 }}>Criado em</span>
                                    <span className="text-muted" style={{ fontWeight: 700 }}>
                                      {formatDate(cotacao.dataEntrada)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="flex h-24 items-center justify-center rounded-[11px] border border-dashed border-line px-4 text-center">
                          <p className="text-[11px] leading-5 text-muted-soft" style={{ fontWeight: 500 }}>
                            Nenhuma cotação encontrada nesta etapa.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CotacoesPage;
