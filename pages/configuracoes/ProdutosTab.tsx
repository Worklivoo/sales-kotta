import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Package, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ProductRecord {
  produto_id: string;
  codigo_sku: string | null;
  nome: string | null;
  descricao: string | null;
  preco_venda: string | number | null;
  unidade_medida: string | null;
  estoque: string | number | null;
  categoria: string | null;
  moeda: string | null;
}

const ITEMS_PER_PAGE = 20;
const PRODUCTS_SYNC_WEBHOOK_URL =
  'https://primary-production-b86f1.up.railway.app/webhook/sincronizar-produtos-manual';

const normalizeSearchTerm = (value: string) => value.trim().replace(/[%(),]/g, ' ');

const formatCurrency = (value: string | number | null, currency: string | null) => {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : Number.NaN;

  if (Number.isNaN(numericValue)) {
    return '-';
  }

  const normalizedCurrency = currency?.trim() || 'BRL';

  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericValue);
  } catch {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericValue);
  }
};

const formatStock = (value: string | number | null, unit: string | null) => {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : Number.NaN;

  if (Number.isNaN(numericValue)) {
    return unit?.trim() ? `- ${unit.trim()}` : '-';
  }

  const formattedValue = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numericValue);

  return unit?.trim() ? `${formattedValue} ${unit.trim()}` : formattedValue;
};

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

const ProdutosTab: React.FC = () => {
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingScrollRef = useRef(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [isLoadingCompanyId, setIsLoadingCompanyId] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isSyncingProducts, setIsSyncingProducts] = useState(false);
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
          .from('sales_membros_v2')
          .select('empresa_id')
          .eq('user_id', session.user.id)
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
        console.error('Erro ao carregar empresa vinculada aos produtos:', error);

        if (!isMounted) {
          return;
        }

        setCompanyId(null);
        setProducts([]);
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

    const loadProducts = async () => {
      if (!companyId) {
        setProducts([]);
        setTotalCount(0);
        setIsLoadingProducts(false);
        return;
      }

      setIsLoadingProducts(true);
      setLoadError(null);

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      try {
        let query = supabase
          .from('sales_produtos_v2')
          .select(
            'produto_id, codigo_sku, nome, descricao, preco_venda, unidade_medida, estoque, categoria, moeda',
            { count: 'exact' },
          )
          .eq('empresa_id', companyId)
          .eq('ativo', true);

        if (debouncedSearchTerm) {
          query = query.or(
            `codigo_sku.ilike.%${debouncedSearchTerm}%,nome.ilike.%${debouncedSearchTerm}%,descricao.ilike.%${debouncedSearchTerm}%`,
          );
        }

        const { data, error, count } = await query
          .order('nome', { ascending: true })
          .order('produto_id', { ascending: true })
          .range(from, to);

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        setProducts((data as ProductRecord[] | null) ?? []);
        setTotalCount(count ?? 0);
      } catch (error: any) {
        console.error('Erro ao carregar produtos:', error);

        if (!isMounted) {
          return;
        }

        setProducts([]);
        setTotalCount(0);
        setLoadError(error?.message || 'Não foi possível carregar os produtos da empresa.');
      } finally {
        if (isMounted) {
          setIsLoadingProducts(false);
        }
      }
    };

    loadProducts();

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
  const isLoading = isLoadingCompanyId || isLoadingProducts;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleRetry = () => {
    setReloadKey((current) => current + 1);
  };

  const handleSyncProducts = async () => {
    if (!companyId) {
      setSyncError('Não foi possível identificar a empresa para sincronizar os produtos.');
      setSyncSuccess(null);
      return;
    }

    setIsSyncingProducts(true);
    setSyncError(null);
    setSyncSuccess(null);

    try {
      const syncResponse = await fetch(PRODUCTS_SYNC_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ empresa_id: companyId }),
      });

      if (!syncResponse.ok) {
        throw new Error('Não foi possível iniciar a sincronização dos produtos.');
      }

      setSyncSuccess('Sincronização iniciada. Os produtos serão atualizados em instantes.');
      window.setTimeout(() => handleRetry(), 8000);
    } catch (error: any) {
      console.error('Erro ao sincronizar produtos:', error);
      setSyncError(error?.message || 'Não foi possível sincronizar os produtos.');
      setSyncSuccess(null);
    } finally {
      setIsSyncingProducts(false);
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
      <section className="rounded-panel border border-line-soft bg-paper p-5 max-lg:p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-lime text-ink">
              <Package className="h-5 w-5" />
            </div>

            <div className="space-y-1">
              <h2 className="text-base font-semibold text-ink">Produtos</h2>
              <p className="max-w-2xl text-sm leading-6 text-muted">
                Visualize os produtos da empresa com carregamento paginado de 20 itens por página.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-1">
            <div className="rounded-panel border border-line-soft bg-card px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-soft">
                Total de produtos
              </p>
              <p className="mt-2 text-lg font-semibold text-ink">{totalCount}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-panel border border-line-soft bg-card shadow-[0_16px_50px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-3 border-b border-line-soft px-5 py-4 max-lg:px-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink">Lista de produtos</h3>
            <p className="mt-1 text-sm text-muted">
              Exibindo {showingFrom} a {showingTo} de {totalCount} produtos.
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative block lg:min-w-[420px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-soft" />
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Buscar por SKU, nome ou descrição"
                className="h-11 w-full rounded-tile border border-line bg-card pl-10 pr-4 text-sm text-ink outline-none transition-colors placeholder:text-muted-soft focus:border-ink/25"
              />
            </label>

            <button
              type="button"
              onClick={handleSyncProducts}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-tile border border-line px-4 text-sm font-medium text-ink transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading || isSyncingProducts}
            >
              <RefreshCw className={`h-4 w-4 ${isSyncingProducts ? 'animate-spin' : ''}`} />
              {isSyncingProducts ? 'Sincronizando...' : 'Sincronizar'}
            </button>
          </div>
        </div>

        {syncError ? (
          <div className="border-b border-line-soft px-5 py-4">
            <div className="rounded-panel border border-red-100 bg-red-50 px-4 py-4 text-sm text-red-700">
              {syncError}
            </div>
          </div>
        ) : null}

        {syncSuccess ? (
          <div className="border-b border-line-soft px-5 py-4">
            <div className="rounded-panel border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-700">
              {syncSuccess}
            </div>
          </div>
        ) : null}

        {loadError ? (
          <div className="px-5 py-10">
            <div className="rounded-panel border border-red-100 bg-red-50 px-4 py-4 text-sm text-red-700">
              {loadError}
            </div>
          </div>
        ) : isLoading ? (
          <div className="px-5 py-10 text-sm text-muted">Carregando produtos...</div>
        ) : products.length === 0 ? (
          <div className="px-5 py-10 text-sm text-muted">
            {debouncedSearchTerm
              ? 'Nenhum produto encontrado para a busca informada.'
              : 'Nenhum produto encontrado para esta empresa.'}
          </div>
        ) : (
          <>
            <div
              ref={topScrollRef}
              onScroll={(event) => syncHorizontalScroll(event, bottomScrollRef)}
              className="overflow-x-auto border-b border-line-soft"
              aria-label="Barra de rolagem horizontal superior da tabela de produtos"
            >
              <div className="h-4 w-full min-w-[1180px]" />
            </div>

            <div
              ref={bottomScrollRef}
              onScroll={(event) => syncHorizontalScroll(event, topScrollRef)}
              className="overflow-x-auto"
            >
              <table className="w-full min-w-[1180px] table-fixed border-collapse">
                <thead>
                  <tr className="border-b border-line-soft bg-paper text-left">
                    <th className="w-[16%] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-soft">
                      SKU
                    </th>
                    <th className="w-[36%] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-soft">
                      Produto
                    </th>
                    <th className="w-[22%] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-soft">
                      Categoria
                    </th>
                    <th className="w-[13%] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-soft">
                      Preço
                    </th>
                    <th className="w-[13%] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-soft">
                      Estoque
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {products.map((product) => (
                    <tr
                      key={product.produto_id}
                      className="border-b border-line-soft align-top last:border-b-0"
                    >
                      <td className="w-[16%] px-5 py-4 text-sm font-medium text-ink">
                        {product.codigo_sku?.trim() || '-'}
                      </td>

                      <td className="w-[36%] px-5 py-4">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-ink">
                            {product.nome?.trim() || 'Produto sem nome'}
                          </p>
                          <p className="text-xs leading-5 text-muted">
                            {product.descricao?.trim() || 'Sem descrição cadastrada.'}
                          </p>
                        </div>
                      </td>

                      <td className="w-[22%] px-5 py-4 text-xs text-muted">
                        {product.categoria?.trim() || '-'}
                      </td>

                      <td className="w-[13%] px-5 py-4 text-sm font-medium text-ink">
                        {formatCurrency(product.preco_venda, product.moeda)}
                      </td>

                      <td className="w-[13%] px-5 py-4 text-sm text-muted">
                        {formatStock(product.estoque, product.unidade_medida)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-line-soft px-5 py-4 max-lg:px-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">
                Página {currentPage} de {totalPages}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1 || isLoading}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-tile border border-line text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
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
                      className={`inline-flex h-10 min-w-10 items-center justify-center rounded-tile px-3 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-lime text-ink'
                          : 'border border-line text-muted hover:bg-paper'
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
                  className="inline-flex h-10 w-10 items-center justify-center rounded-tile border border-line text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
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

export default ProdutosTab;
