import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Lock, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { PipelineEtapa } from '../lib/pipeline';

interface EditarFunilModalProps {
  empresaId: string;
  etapas: PipelineEtapa[];
  onClose: () => void;
  onEtapasChange: (etapas: PipelineEtapa[]) => void;
}

const refetchEtapas = async (empresaId: string) => {
  const { data, error } = await supabase
    .from('sales_pipeline_etapas_v2')
    .select('etapa_id, nome, codigo, ordem, is_fixed, is_ai_stage')
    .eq('empresa_id', empresaId)
    .order('ordem', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as PipelineEtapa[];
};

const EditarFunilModal: React.FC<EditarFunilModalProps> = ({
  empresaId,
  etapas,
  onClose,
  onEtapasChange,
}) => {
  const [localEtapas, setLocalEtapas] = useState<PipelineEtapa[]>(etapas);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newEtapaNome, setNewEtapaNome] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const sync = async () => {
    const fresh = await refetchEtapas(empresaId);
    setLocalEtapas(fresh);
    onEtapasChange(fresh);
  };

  const etapasFixas = localEtapas.filter((etapa) => etapa.is_fixed);
  const etapasCustom = localEtapas.filter((etapa) => !etapa.is_fixed);

  const handleMove = async (etapaId: string, direcao: 'up' | 'down') => {
    setActionError(null);

    const { error } = await supabase.rpc('sales_v2_mover_etapa', {
      p_etapa_id: etapaId,
      p_direcao: direcao,
    });

    if (error) {
      setActionError(error.message || 'Não foi possível mover a etapa.');
      return;
    }

    try {
      await sync();
    } catch (error: any) {
      setActionError(error?.message || 'Não foi possível atualizar a lista de etapas.');
    }
  };

  const handleDelete = async (etapa: PipelineEtapa) => {
    if (!window.confirm(`Excluir a etapa "${etapa.nome}"? Essa ação não pode ser desfeita.`)) {
      return;
    }

    setActionError(null);

    const { error } = await supabase
      .from('sales_pipeline_etapas_v2')
      .delete()
      .eq('etapa_id', etapa.etapa_id);

    if (error) {
      setActionError(error.message || 'Não foi possível excluir a etapa.');
      return;
    }

    try {
      await sync();
    } catch (error: any) {
      setActionError(error?.message || 'Não foi possível atualizar a lista de etapas.');
    }
  };

  const handleAdd = async () => {
    const nome = newEtapaNome.trim();
    if (!nome || isSaving) {
      return;
    }

    setIsSaving(true);
    setActionError(null);

    const proximaOrdem = localEtapas.reduce((max, etapa) => Math.max(max, etapa.ordem), 0) + 1;

    const { error } = await supabase
      .from('sales_pipeline_etapas_v2')
      .insert({ empresa_id: empresaId, nome, ordem: proximaOrdem, is_fixed: false, is_ai_stage: false });

    setIsSaving(false);

    if (error) {
      setActionError(error.message || 'Não foi possível criar a etapa.');
      return;
    }

    setNewEtapaNome('');

    try {
      await sync();
    } catch (error: any) {
      setActionError(error?.message || 'Não foi possível atualizar a lista de etapas.');
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-4">
      <div
        className="w-full max-w-md rounded-panel border border-line-soft bg-card p-6"
        style={{ boxShadow: '0 28px 80px -34px rgba(20,20,20,.45)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[19px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.02em' }}>
            Editar Funil
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-pill text-muted hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-5 text-muted" style={{ fontWeight: 500 }}>
          As 4 etapas fixas conduzem o fluxo da IA e não podem ser reordenadas nem excluídas. Etapas
          personalizadas vêm sempre depois delas e você pode reordenar, criar ou excluir.
        </p>

        {actionError ? (
          <div
            className="mt-4 rounded-tile border border-red-100 bg-red-50 px-4 py-3 text-[12.5px] text-red-600"
            style={{ fontWeight: 500 }}
          >
            {actionError}
          </div>
        ) : null}

        <div className="mt-5 space-y-1.5">
          {etapasFixas.map((etapa) => (
            <div
              key={etapa.etapa_id}
              className="flex items-center gap-2.5 rounded-tile border border-line-soft bg-paper px-3 py-2.5"
            >
              <Lock size={13} className="shrink-0 text-muted-soft" />
              <span className="flex-1 truncate text-[13px] text-ink" style={{ fontWeight: 700 }}>
                {etapa.nome}
              </span>
              <span
                className="rounded-[6px] bg-stone px-1.5 py-0.5 text-[9px] text-muted"
                style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}
              >
                Fixa
              </span>
            </div>
          ))}
        </div>

        {etapasCustom.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            {etapasCustom.map((etapa, index) => (
              <div
                key={etapa.etapa_id}
                className="flex items-center gap-2 rounded-tile border border-line-soft bg-card px-3 py-2.5"
              >
                <span className="flex-1 truncate text-[13px] text-ink" style={{ fontWeight: 700 }}>
                  {etapa.nome}
                </span>
                <button
                  type="button"
                  onClick={() => handleMove(etapa.etapa_id, 'up')}
                  disabled={index === 0}
                  aria-label={`Mover ${etapa.nome} para cima`}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-soft hover:bg-stone hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(etapa.etapa_id, 'down')}
                  disabled={index === etapasCustom.length - 1}
                  aria-label={`Mover ${etapa.nome} para baixo`}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-soft hover:bg-stone hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(etapa)}
                  aria-label={`Excluir ${etapa.nome}`}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-soft hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          <input
            type="text"
            value={newEtapaNome}
            onChange={(e) => setNewEtapaNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAdd();
              }
            }}
            placeholder="Nome da nova etapa"
            className="h-10 flex-1 rounded-tile border border-line bg-paper px-3 text-[13px] text-ink outline-none placeholder:text-muted-soft"
            style={{ fontWeight: 600 }}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={isSaving || !newEtapaNome.trim()}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-tile bg-lime px-3.5 text-[12.5px] text-ink disabled:opacity-50"
            style={{ fontWeight: 700 }}
          >
            <Plus size={14} />
            Adicionar
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-[9px] border border-line bg-card px-5 text-[13px] text-ink transition-colors hover:bg-stone"
            style={{ fontWeight: 700, transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditarFunilModal;
