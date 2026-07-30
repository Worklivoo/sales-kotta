import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ClientRecord {
  cliente_id: string;
  email: string | null;
  nome: string | null;
  cnpj: string | null;
  telefone: string | null;
  ativo: boolean | null;
  whatsapp: string | null;
}

const ITEMS_PER_PAGE = 20;
const CLIENTS_SYNC_WEBHOOK_URL =
  'https://primary-systec.up.railway.app/webhook/86a03848-ee79-4224-ba6e-af3ee8d19949';

const normalizeSearchTerm = (value: string) => value.trim().replace(/[%(),]/g, ' ');

const buildVisiblePages = (currentPage: number, totalPages: number) => {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, 5];
  }

  if (currentPage >= totalPages - 2) {
    return Array.from({ length: 5 }, (_, index) => totalPages - 4 + index);
  }

  return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
};

const formatOptionalValue = (value: string | null) => {
  const trimmedValue = value?.trim();
  return trimmedValue || '-';
};

const formatActiveStatus = (value: boolean | null) => {
  if (value === null) {
    return '-';
  }

  return value ? 'Ativo' : 'Inativo';
};

const ClientesTab: React.FC = () => {
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingScrollRef = useRef(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [isLoadingCompanyId, setIsLoadingCompanyId] = useState(true);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isSyncingClients, setIsSyncingClients] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(normalizeSearchTerm(searchInput));
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm]);

  useEffect(() => {
    let isMounted = true;

    const loadCompanyId = async () => {
      setIsLoadingCompanyId(true);
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

        const { data: currentMember, error: currentMemberError } = await supabase
          .from('sales_membros_empresa')
          .select('empresa_id')
          .eq('membro_id', session.user.id)
          .maybeSingle();

        if (currentMemberError) {
          throw currentMemberError;
        }

        if (!currentMember?.empresa_id) {
          throw new Error('Não foi possível identificar a empresa vinculada ao usuário.');
        }

        if (!isMounted) {
          return;
        }

        setCompanyId(currentMember.empresa_id);
      } catch (error: any) {
        console.error('Erro ao carregar empresa vinculada aos clientes:', error);

        if (!isMounted) {
          return;
        }

        setCompanyId(null);
        setClients([]);
        setTotalCount(0);
        setLoadError(error?.message || 'Não foi possível identificar a empresa do usuário.');
      } finally {
        if (isMounted) {
          setIsLoadingCompanyId(false);
        }
      }
    };

    loadCompanyId();

    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    let isMounted = true;

    const loadClients = async () => {
      if (!companyId) {
        setClients([]);
        setTotalCount(0);
        setIsLoadingClients(false);
        return;
      }

      setIsLoadingClients(true);
      setLoadError(null);

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      try {
        let query = supabase
          .from('sales_clientes_finais')
          .select('cliente_id, email, nome, cnpj, telefone, ativo, whatsapp', {
            count: 'exact',
          })
          .eq('empresa_id', companyId);

        if (debouncedSearchTerm) {
          query = query.or(
            `email.ilike.%${debouncedSearchTerm}%,nome.ilike.%${debouncedSearchTerm}%,cnpj.ilike.%${debouncedSearchTerm}%,telefone.ilike.%${debouncedSearchTerm}%,whatsapp.ilike.%${debouncedSearchTerm}%`,
          );
        }

        const { data, error, count } = await query
          .order('nome', { ascending: true })
          .order('cliente_id', { ascending: true })
          .range(from, to);

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        setClients((data as ClientRecord[] | null) ?? []);
        setTotalCount(count ?? 0);
      } catch (error: any) {
        console.error('Erro ao carregar clientes:', error);

        if (!isMounted) {
          return;
        }

        setClients([]);
        setTotalCount(0);
        setLoadError(error?.message || 'Não foi possível carregar os clientes da empresa.');
      } finally {
        if (isMounted) {
          setIsLoadingClients(false);
        }
      }
    };

    loadClients();

    return () => {
      isMounted = false;
    };
  }, [companyId, currentPage, debouncedSearchTerm, reloadKey]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE)),
    [totalCount],
  );

  const visiblePages = useMemo(
    () => buildVisiblePages(currentPage, totalPages),
    [currentPage, totalPages],
  );

  const showingFrom = totalCount === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const showingTo = totalCount === 0 ? 0 : Math.min(currentPage * ITEMS_PER_PAGE, totalCount);
  const isLoading = isLoadingCompanyId || isLoadingClients;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleRetry = () => {
    setReloadKey((current) => current + 1);
  };

  const handleSyncClients = async () => {
    if (!companyId) {
      setSyncError('Não foi possível identificar a empresa para sincronizar os clientes.');
      setSyncSuccess(null);
      return;
    }

    setIsSyncingClients(true);
    setSyncError(null);
    setSyncSuccess(null);

    try {
      const { data: companyData, error: companyError } = await supabase
        .from('sales_empresa')
        .select('*')
        .eq('empresa_id', companyId)
        .maybeSingle();

      if (companyError) {
        throw companyError;
      }

      if (!companyData) {
        throw new Error('Não foi possível localizar os dados da empresa para sincronização.');
      }

      const syncResponse = await fetch(CLIENTS_SYNC_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(companyData),
      });

      const syncResponseText = await syncResponse.text();
      let syncResponseBody: unknown = null;

      try {
        syncResponseBody = syncResponseText ? JSON.parse(syncResponseText) : null;
      } catch {
        syncResponseBody = syncResponseText || null;
      }

      if (!syncResponse.ok) {
        const errorMessage =
          typeof syncResponseBody === 'string' && syncResponseBody.trim()
            ? syncResponseBody
            : 'Não foi possível iniciar a sincronização dos clientes.';

        throw new Error(errorMessage);
      }

      setSyncSuccess('Sincronização enviada com sucesso.');
      handleRetry();
    } catch (error: any) {
      console.error('Erro ao sincronizar clientes:', error);
      setSyncError(error?.message || 'Não foi possível sincronizar os clientes.');
      setSyncSuccess(null);
    } finally {
      setIsSyncingClients(false);
    }
  };

  const syncHorizontalScroll = (
    source: React.UIEvent<HTMLDivElement>,
    targetRef: React.RefObject<HTMLDivElement | null>,
  ) => {
    if (isSyncingScrollRef.current || !targetRef.current) {
      return;
    }

    isSyncingScrollRef.current = true;
    targetRef.current.scrollLeft = source.currentTarget.scrollLeft;

    window.requestAnimationFrame(() => {
      isSyncingScrollRef.current = false;
    });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-black/5 bg-[#FAFAFA] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EBF57D] text-gray-900">
              <Users className="h-5 w-5" />
            </div>

            <div className="space-y-1">
              <h2 className="text-base font-semibold text-gray-900">Clientes</h2>
              <p className="max-w-2xl text-sm leading-6 text-gray-500">
                Todos os clientes da sua empresa.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-1">
            <div className="rounded-2xl border border-black/5 bg-white px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400">
                Total de clientes
              </p>
              <p className="mt-2 text-lg font-semibold text-gray-900">{totalCount}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-black/5 bg-white shadow-[0_16px_50px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-3 border-b border-black/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Lista de clientes</h3>
            <p className="mt-1 text-sm text-gray-500">
              Exibindo {showingFrom} a {showingTo} de {totalCount} clientes.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block min-w-[420px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Buscar por nome, e-mail, CNPJ, telefone ou WhatsApp"
                className="h-11 w-full rounded-xl border border-black/10 bg-white pl-10 pr-4 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300"
              />
            </label>

            <button
              type="button"
              onClick={handleSyncClients}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-black/10 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading || isSyncingClients}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingClients ? 'animate-spin' : ''}`} />
              {isSyncingClients ? 'Sincronizando...' : 'Sincronizar'}
            </button>
          </div>
        </div>

        {syncError ? (
          <div className="border-b border-black/5 px-5 py-4">
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-4 text-sm text-red-700">
              {syncError}
            </div>
          </div>
        ) : null}

        {syncSuccess ? (
          <div className="border-b border-black/5 px-5 py-4">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-700">
              {syncSuccess}
            </div>
          </div>
        ) : null}

        {loadError ? (
          <div className="px-5 py-10">
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-4 text-sm text-red-700">
              {loadError}
            </div>
          </div>
        ) : isLoading ? (
          <div className="px-5 py-10 text-sm text-gray-500">Carregando clientes...</div>
        ) : clients.length === 0 ? (
          <div className="px-5 py-10 text-sm text-gray-500">
            {debouncedSearchTerm
              ? 'Nenhum cliente encontrado para a busca informada.'
              : 'Nenhum cliente encontrado para esta empresa.'}
          </div>
        ) : (
          <>
            <div
              ref={topScrollRef}
              onScroll={(event) => syncHorizontalScroll(event, bottomScrollRef)}
              className="overflow-x-auto border-b border-black/5"
              aria-label="Barra de rolagem horizontal superior da tabela de clientes"
            >
              <div className="h-4 w-full min-w-[1320px]" />
            </div>

            <div
              ref={bottomScrollRef}
              onScroll={(event) => syncHorizontalScroll(event, topScrollRef)}
              className="overflow-x-auto"
            >
              <table className="w-full min-w-[1320px] table-fixed border-collapse">
                <thead>
                  <tr className="border-b border-black/5 bg-[#FAFAFA] text-left">
                    <th className="w-[20%] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                      Nome
                    </th>
                    <th className="w-[20%] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                      CNPJ
                    </th>
                    <th className="w-[16%] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                      E-mail
                    </th>
                    <th className="w-[16%] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                      Telefone
                    </th>
                    <th className="w-[12%] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                      WhatsApp
                    </th>
                    <th className="w-[16%] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {clients.map((client) => (
                    <tr
                      key={client.cliente_id}
                      className="border-b border-black/5 align-top last:border-b-0"
                    >
                      <td className="w-[20%] px-5 py-4 text-sm font-medium text-gray-900">
                        {formatOptionalValue(client.nome)}
                      </td>
                      <td className="w-[20%] px-5 py-4 text-sm text-gray-700">
                        {formatOptionalValue(client.cnpj)}
                      </td>
                      <td className="w-[16%] px-5 py-4 text-sm text-gray-700">
                        {formatOptionalValue(client.email)}
                      </td>
                      <td className="w-[16%] px-5 py-4 text-sm text-gray-700">
                        {formatOptionalValue(client.telefone)}
                      </td>
                      <td className="w-[16%] px-5 py-4 text-sm text-gray-700">
                        {formatOptionalValue(client.whatsapp)}
                      </td>
                      <td className="w-[12%] px-5 py-4 text-sm text-gray-700">
                        {formatActiveStatus(client.ativo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-black/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500">
                Página {currentPage} de {totalPages}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1 || isLoading}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {visiblePages.map((page) => {
                  const isActive = page === currentPage;

                  return (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      disabled={isLoading}
                      className={`inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-3 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-[#EBF57D] text-gray-900'
                          : 'border border-black/10 text-gray-600 hover:bg-gray-50'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {page}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages || isLoading}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Próxima página"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default ClientesTab;
