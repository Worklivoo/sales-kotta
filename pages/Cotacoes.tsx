import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Search, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';

type KanbanStatus =
  | 'TRIAGEM'
  | 'COLETANDO_DADOS'
  | 'AGUARDANDO_APROVACAO'
  | 'ORCAMENTO_ENVIADO'
  | 'CONCLUIDO'
  | 'DESCARTADO';

interface MockCotacao {
  id: string;
  atendimentoId: string;
  nome: string;
  membro: string;
  membroId: string;
  dataEntrada: string;
  status: KanbanStatus;
  cliente: string;
  valor: string;
}

const KANBAN_COLUMNS: Array<{
  key: KanbanStatus;
  label: string;
}> = [
  {
    key: 'TRIAGEM',
    label: 'Triagem',
  },
  {
    key: 'COLETANDO_DADOS',
    label: 'Coletando Dados',
  },
  {
    key: 'AGUARDANDO_APROVACAO',
    label: 'Aguardando Aprovacao',
  },
  {
    key: 'ORCAMENTO_ENVIADO',
    label: 'Orcamento Enviado',
  },
  {
    key: 'CONCLUIDO',
    label: 'Concluido',
  },
  {
    key: 'DESCARTADO',
    label: 'Descartado',
  },
];

interface MemberOption {
  membro_id: string;
  nome: string;
}

interface MemberRecord {
  empresa_id: string;
  cargo: string | null;
  nome: string | null;
}

interface AtendimentoRow {
  atendimento_id: string;
  assunto: string | null;
  status: KanbanStatus;
  categoria: string;
  created_at: string;
  numero_ticket: number | null;
  membro_id: string | null;
  cliente_id: string | null;
}

const formatDate = (value: string) => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR').format(parsedDate);
};

interface CotacoesPageProps {
  onOpenCotacao: (atendimentoId: string) => void;
}

const CotacoesPage: React.FC<CotacoesPageProps> = ({ onOpenCotacao }) => {
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedMember, setSelectedMember] = useState('Todos');
  const [cotacoes, setCotacoes] = useState<MockCotacao[]>([]);
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
          .from('sales_membros_empresa')
          .select('empresa_id, cargo, nome')
          .eq('membro_id', session.user.id)
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
          .from('sales_atendimento')
          .select(
            'atendimento_id, assunto, status, categoria, created_at, numero_ticket, membro_id, cliente_id',
          )
          .eq('empresa_id', currentMember.empresa_id)
          .eq('categoria', 'COTACAO')
          .order('created_at', { ascending: false });

        const scopedCotacoesQuery = adminAccess
          ? cotacoesQuery
          : cotacoesQuery.eq('membro_id', session.user.id);

        const [membersResponse, cotacoesResponse] = await Promise.all([
          adminAccess
            ? supabase
                .from('sales_membros_empresa')
                .select('membro_id, nome')
                .eq('empresa_id', currentMember.empresa_id)
                .order('nome', { ascending: true })
            : Promise.resolve({
                data: [
                  {
                    membro_id: session.user.id,
                    nome: currentMember.nome || 'Meu usuário',
                  },
                ],
                error: null,
              }),
          scopedCotacoesQuery,
        ]);

        if (membersResponse.error) {
          throw membersResponse.error;
        }

        if (cotacoesResponse.error) {
          throw cotacoesResponse.error;
        }

        const members = (membersResponse.data ?? []) as MemberOption[];
        const memberNameById = new Map(
          members.map((member) => [member.membro_id, member.nome || 'Sem nome']),
        );

        const mappedCotacoes: MockCotacao[] = ((cotacoesResponse.data ?? []) as AtendimentoRow[]).map((item) => {
          const ticketNumber = item.numero_ticket ? `#${item.numero_ticket}` : 'Sem ticket';
          const memberName = memberNameById.get(item.membro_id) || 'Membro nao identificado';

          return {
            id: ticketNumber,
            atendimentoId: item.atendimento_id,
            nome: item.assunto || 'Cotacao sem assunto',
            membro: memberName,
            membroId: item.membro_id || '',
            dataEntrada: item.created_at,
            status: item.status as KanbanStatus,
            cliente: item.cliente_id ? `Cliente ${item.cliente_id}` : 'Cliente nao vinculado',
            valor: ticketNumber,
          };
        });

        if (!isMounted) {
          return;
        }

        setMemberOptions(members);
        setCotacoes(mappedCotacoes);
        setIsAdmin(adminAccess);
      } catch (error: any) {
        console.error('Erro ao carregar cotacoes:', error);

        if (!isMounted) {
          return;
        }

        setLoadError(error?.message || 'Nao foi possivel carregar as cotacoes.');
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
      const matchesSearch = cotacao.nome.toLowerCase().includes(search.toLowerCase());
      const matchesMember =
        selectedMember === 'Todos' || cotacao.membroId === selectedMember;
      const cotacaoDate = cotacao.dataEntrada.slice(0, 10);
      const matchesStartDate = !startDate || cotacaoDate >= startDate;
      const matchesEndDate = !endDate || cotacaoDate <= endDate;

      return matchesSearch && matchesMember && matchesStartDate && matchesEndDate;
    });
  }, [cotacoes, endDate, search, selectedMember, startDate]);

  return (
    <div className="h-full w-full overflow-hidden">
      <div className="flex h-full flex-col gap-4">
        <section className="rounded-2xl border border-black/5 bg-white px-5 py-4 shadow-[0_6px_24px_rgba(15,23,42,0.04)] lg:px-6">
          <div className="space-y-1">
            <h1 className="text-[28px] font-semibold tracking-tight text-gray-900">
              Funil de Cotações
            </h1>
            <p className="text-sm text-gray-500">
              Gerencie suas cotações e oportunidades de vendas.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-black/5 bg-white px-4 py-3 shadow-[0_6px_24px_rgba(15,23,42,0.035)]">
          <div
            className={`grid gap-3 ${
              isAdmin ? 'xl:grid-cols-[1.9fr_1.2fr_0.95fr]' : 'xl:grid-cols-[2fr_1.3fr]'
            }`}
          >
            <label className="flex h-12 items-center gap-3 rounded-xl border border-gray-200 bg-[#FAFAFA] px-4 transition-colors focus-within:border-gray-300">
              <Search size={16} className="text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar pelo nome da cotação"
                className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
              />
            </label>

            <label className="flex h-12 items-center gap-3 rounded-xl border border-gray-200 bg-[#FAFAFA] px-4">
              <CalendarRange size={16} className="text-gray-400" />
              <div className="grid w-full grid-cols-2 gap-3">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-transparent text-sm text-gray-700 outline-none"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-transparent text-sm text-gray-700 outline-none"
                />
              </div>
            </label>

            {isAdmin ? (
              <label className="flex h-12 items-center gap-3 rounded-xl border border-gray-200 bg-[#FAFAFA] px-4">
                <UserRound size={16} className="text-gray-400" />
                <select
                  value={selectedMember}
                  onChange={(e) => setSelectedMember(e.target.value)}
                  className="w-full bg-transparent text-sm text-gray-800 outline-none"
                >
                  <option value="Todos">Todos</option>
                  {memberOptions.map((member) => (
                    <option key={member.membro_id} value={member.membro_id}>
                      {member.nome}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-hidden">
          {loadError ? (
            <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {loadError}
            </div>
          ) : null}

          <div className="h-full overflow-x-auto overflow-y-hidden pb-2">
            <div className="grid h-full min-w-[1920px] grid-cols-6 gap-4">
              {KANBAN_COLUMNS.map((column) => {
                const columnItems = filteredCotacoes.filter(
                  (cotacao) => cotacao.status === column.key,
                );

                return (
                  <div
                    key={column.key}
                    className="flex h-full min-h-[560px] min-w-[300px] flex-col rounded-2xl border border-black/5 bg-[#F3F3F3] p-3"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3 px-1 py-1">
                      <div className="min-w-0">
                        <h3 className="truncate text-[12px] font-semibold uppercase tracking-[0.12em] text-gray-700">
                          {column.label}
                        </h3>
                      </div>
                      <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-gray-500">
                        {columnItems.length}
                      </span>
                    </div>

                    <div className="flex-1 space-y-2 overflow-y-auto">
                      {isLoading ? (
                        Array.from({ length: 2 }).map((_, index) => (
                          <div
                            key={`${column.key}-loading-${index}`}
                            className="rounded-xl border border-black/5 bg-white p-3 shadow-[0_2px_8px_rgba(15,23,42,0.04)]"
                          >
                            <div className="animate-pulse space-y-3">
                              <div className="h-3 w-20 rounded bg-gray-200" />
                              <div className="h-4 w-3/4 rounded bg-gray-200" />
                              <div className="h-3 w-1/2 rounded bg-gray-100" />
                              <div className="h-3 w-2/3 rounded bg-gray-100" />
                            </div>
                          </div>
                        ))
                      ) : columnItems.length > 0 ? (
                        columnItems.map((cotacao) => (
                          <button
                            key={cotacao.atendimentoId}
                            type="button"
                            onClick={() => onOpenCotacao(cotacao.atendimentoId)}
                            className="w-full rounded-xl border border-black/5 bg-white p-3 text-left shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition-all hover:border-black/10 hover:shadow-[0_6px_18px_rgba(15,23,42,0.08)]"
                          >
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className="rounded-md bg-gray-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                                  Ticket
                                </span>
                                <span className="text-[12px] font-semibold text-gray-700">
                                  {cotacao.valor}
                                </span>
                              </div>

                              <div className="space-y-1">
                                <h4 className="line-clamp-2 text-[13px] font-semibold leading-5 text-gray-800">
                                  {cotacao.nome}
                                </h4>
                              </div>

                              <div className="space-y-2 border-t border-gray-100 pt-3 text-[11px] text-gray-500">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-medium text-gray-400">Responsável</span>
                                  <span className="truncate text-right font-semibold text-gray-700">
                                    {cotacao.membro}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-medium text-gray-400">Criado em</span>
                                  <span className="font-semibold text-gray-700">
                                    {formatDate(cotacao.dataEntrada)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white/70 px-4 text-center">
                          <p className="text-xs font-medium leading-5 text-gray-400">
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
