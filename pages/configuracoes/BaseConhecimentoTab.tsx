import React, { useEffect, useState } from 'react';
import { BookOpen, Pencil, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface KnowledgeItem {
  item_id: string;
  pergunta: string;
  resposta: string;
  ativo: boolean;
  created_at: string;
}

interface ItemFormState {
  pergunta: string;
  resposta: string;
  ativo: boolean;
}

const INITIAL_FORM: ItemFormState = { pergunta: '', resposta: '', ativo: true };

const BaseConhecimentoTab: React.FC = () => {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [isLoadingCompanyId, setIsLoadingCompanyId] = useState(true);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);
  const [form, setForm] = useState<ItemFormState>(INITIAL_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

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
        console.error('Erro ao carregar empresa vinculada à base de conhecimento:', error);

        if (!isMounted) {
          return;
        }

        setCompanyId(null);
        setItems([]);
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

    const loadItems = async () => {
      if (!companyId) {
        setItems([]);
        setIsLoadingItems(false);
        return;
      }

      setIsLoadingItems(true);
      setLoadError(null);

      try {
        const { data, error } = await supabase
          .from('sales_base_conhecimento_v2')
          .select('item_id, pergunta, resposta, ativo, created_at')
          .eq('empresa_id', companyId)
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        setItems((data as KnowledgeItem[] | null) ?? []);
      } catch (error: any) {
        console.error('Erro ao carregar base de conhecimento:', error);

        if (!isMounted) {
          return;
        }

        setItems([]);
        setLoadError(error?.message || 'Não foi possível carregar a base de conhecimento.');
      } finally {
        if (isMounted) {
          setIsLoadingItems(false);
        }
      }
    };

    loadItems();

    return () => {
      isMounted = false;
    };
  }, [companyId, reloadKey]);

  const handleRetry = () => {
    setReloadKey((current) => current + 1);
  };

  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setForm(INITIAL_FORM);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: KnowledgeItem) => {
    setEditingItem(item);
    setForm({ pergunta: item.pergunta, resposta: item.resposta, ativo: item.ativo });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isSaving) {
      return;
    }

    setIsModalOpen(false);
    setEditingItem(null);
    setForm(INITIAL_FORM);
    setFormError(null);
  };

  const handleSave = async () => {
    if (!companyId) {
      setFormError('Não foi possível identificar a empresa do usuário.');
      return;
    }

    const pergunta = form.pergunta.trim();
    const resposta = form.resposta.trim();

    if (!pergunta || !resposta) {
      setFormError('Preencha a pergunta e a resposta.');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      if (editingItem) {
        const { error } = await supabase
          .from('sales_base_conhecimento_v2')
          .update({ pergunta, resposta, ativo: form.ativo })
          .eq('item_id', editingItem.item_id);

        if (error) {
          throw error;
        }

        setFeedback({ type: 'success', message: 'Pergunta atualizada com sucesso.' });
      } else {
        const { error } = await supabase
          .from('sales_base_conhecimento_v2')
          .insert({ empresa_id: companyId, pergunta, resposta, ativo: form.ativo });

        if (error) {
          throw error;
        }

        setFeedback({ type: 'success', message: 'Pergunta adicionada com sucesso.' });
      }

      setIsModalOpen(false);
      setEditingItem(null);
      setForm(INITIAL_FORM);
      handleRetry();
    } catch (error: any) {
      console.error('Erro ao salvar item da base de conhecimento:', error);
      setFormError(error?.message || 'Não foi possível salvar a pergunta.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (item: KnowledgeItem) => {
    setFeedback(null);

    try {
      const { error } = await supabase
        .from('sales_base_conhecimento_v2')
        .update({ ativo: !item.ativo })
        .eq('item_id', item.item_id);

      if (error) {
        throw error;
      }

      setItems((current) =>
        current.map((entry) =>
          entry.item_id === item.item_id ? { ...entry, ativo: !entry.ativo } : entry,
        ),
      );
    } catch (error: any) {
      console.error('Erro ao alternar status da pergunta:', error);
      setFeedback({
        type: 'error',
        message: error?.message || 'Não foi possível alterar o status da pergunta.',
      });
    }
  };

  const handleDelete = async (item: KnowledgeItem) => {
    const confirmed = window.confirm(`Excluir a pergunta "${item.pergunta}"?`);

    if (!confirmed) {
      return;
    }

    setDeletingId(item.item_id);
    setFeedback(null);

    try {
      const { error } = await supabase
        .from('sales_base_conhecimento_v2')
        .delete()
        .eq('item_id', item.item_id);

      if (error) {
        throw error;
      }

      setItems((current) => current.filter((entry) => entry.item_id !== item.item_id));
      setFeedback({ type: 'success', message: 'Pergunta excluída com sucesso.' });
    } catch (error: any) {
      console.error('Erro ao excluir item da base de conhecimento:', error);
      setFeedback({
        type: 'error',
        message: error?.message || 'Não foi possível excluir a pergunta.',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const isLoading = isLoadingCompanyId || isLoadingItems;

  return (
    <div className="space-y-5">
      <section className="rounded-panel border border-line-soft bg-paper p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-lime text-ink">
              <BookOpen className="h-5 w-5" />
            </div>

            <div className="space-y-1">
              <h2 className="text-base font-semibold text-ink">Base de Conhecimento</h2>
              <p className="max-w-2xl text-sm leading-6 text-muted">
                Cadastre perguntas e respostas frequentes (prazo de entrega, pagamento, garantia,
                etc). Durante uma cotação, se o lead perguntar algo que bata com uma dessas
                respostas, a IA já responde junto com o orçamento. Se não encontrar nada
                relacionado, ela avisa que o responsável vai esclarecer depois.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-tile bg-lime px-5 text-sm font-semibold text-ink transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
          >
            <Plus className="h-4 w-4" />
            Adicionar pergunta
          </button>
        </div>
      </section>

      {feedback ? (
        <div
          className={`rounded-panel border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
              : 'border-red-100 bg-red-50 text-red-700'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <section className="rounded-panel border border-line-soft bg-card shadow-[0_16px_50px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-1 border-b border-line-soft px-5 py-4">
          <h3 className="text-sm font-semibold text-ink">Perguntas cadastradas</h3>
          <p className="text-sm text-muted">{items.length} pergunta(s) na base desta empresa.</p>
        </div>

        {loadError ? (
          <div className="px-5 py-10">
            <div className="rounded-panel border border-red-100 bg-red-50 px-4 py-4 text-sm text-red-700">
              {loadError}
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-3 rounded-tile border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper"
            >
              Tentar novamente
            </button>
          </div>
        ) : isLoading ? (
          <div className="px-5 py-10 text-sm text-muted">Carregando base de conhecimento...</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-10 text-sm text-muted">
            Nenhuma pergunta cadastrada ainda. Clique em "Adicionar pergunta" para começar.
          </div>
        ) : (
          <ul className="divide-y divide-line-soft">
            {items.map((item) => (
              <li key={item.item_id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{item.pergunta}</p>
                    {!item.ativo ? (
                      <span className="rounded-pill bg-stone px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-soft">
                        Inativa
                      </span>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-line text-sm leading-6 text-muted">
                    {item.resposta}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(item)}
                    className="rounded-tile border border-line px-3 py-2 text-xs font-semibold text-muted transition-colors hover:bg-paper hover:text-ink"
                  >
                    {item.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(item)}
                    className="flex h-9 w-9 items-center justify-center rounded-tile bg-paper text-muted transition-colors hover:bg-stone hover:text-ink"
                    aria-label={`Editar pergunta "${item.pergunta}"`}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    disabled={deletingId === item.item_id}
                    className="flex h-9 w-9 items-center justify-center rounded-tile bg-paper text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={`Excluir pergunta "${item.pergunta}"`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="absolute inset-0" aria-hidden="true" onClick={handleCloseModal} />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="base-conhecimento-modal-title"
            className="relative z-10 w-full max-w-lg rounded-card border border-line-soft bg-card p-6 shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 id="base-conhecimento-modal-title" className="text-base font-semibold tracking-tight text-ink">
                  {editingItem ? 'Editar pergunta' : 'Adicionar pergunta'}
                </h2>
                <p className="mt-1 text-sm leading-5 text-muted">
                  A resposta é usada pela IA quando um lead perguntar algo parecido durante uma
                  cotação.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseModal}
                className="flex h-9 w-9 items-center justify-center rounded-tile bg-paper text-muted transition-colors hover:bg-stone hover:text-ink"
                aria-label="Fechar popup"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {formError ? (
                <div className="rounded-panel border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                  {formError}
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="kb-pergunta"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft"
                >
                  Pergunta
                </label>
                <input
                  id="kb-pergunta"
                  type="text"
                  value={form.pergunta}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, pergunta: event.target.value }))
                  }
                  className="mt-2 w-full rounded-panel border border-line bg-paper px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25"
                  placeholder="Ex: Qual o prazo de entrega?"
                />
              </div>

              <div>
                <label
                  htmlFor="kb-resposta"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft"
                >
                  Resposta
                </label>
                <textarea
                  id="kb-resposta"
                  value={form.resposta}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, resposta: event.target.value }))
                  }
                  rows={5}
                  className="mt-2 w-full resize-none rounded-panel border border-line bg-paper px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25"
                  placeholder="Digite a resposta que a IA deve usar"
                />
              </div>

              <label className="flex items-center gap-2.5 text-sm font-medium text-ink">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, ativo: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-line text-ink accent-lime"
                />
                Pergunta ativa (a IA pode usá-la)
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSaving}
                className="rounded-panel border border-line bg-card px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="rounded-panel bg-lime px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default BaseConhecimentoTab;
