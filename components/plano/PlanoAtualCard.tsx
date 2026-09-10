import React, { useState } from 'react';
import { ArrowUpRight, Ticket } from 'lucide-react';
import type { ConsumoResposta } from '../../lib/planoApi';

interface PlanoAtualCardProps {
  empresa: ConsumoResposta['empresa'];
  isSubmitting: boolean;
  onCancelar: () => void;
  onUpgrade: () => void;
}

const CICLO_LABEL: Record<string, string> = {
  MENSAL: 'Mensal',
  TRIMESTRAL: 'Trimestral',
  ANUAL: 'Anual',
};

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

const STATUS: Record<string, { label: string; className: string }> = {
  ATIVO: { label: 'Ativo', className: 'bg-lime text-ink' },
  EM_ATRASO: { label: 'Pagamento em atraso', className: 'bg-orange-100 text-orange-800' },
  CANCELADO: { label: 'Cancelado', className: 'bg-stone text-muted' },
};

const PlanoAtualCard: React.FC<PlanoAtualCardProps> = ({
  empresa,
  isSubmitting,
  onCancelar,
  onUpgrade,
}) => {
  const [confirmando, setConfirmando] = useState(false);
  const status = STATUS[empresa.planoStatus || ''] || {
    label: 'Aguardando pagamento',
    className: 'bg-stone text-muted',
  };

  return (
    <div className="flex flex-col rounded-panel bg-ink p-6 text-white">
      <div className="flex items-start justify-between gap-3">
        <p
          className="text-[12px] uppercase text-white/50"
          style={{ fontWeight: 700, letterSpacing: '.08em' }}
        >
          Plano atual
        </p>
        <span
          className={`rounded-pill px-2.5 py-1 text-[10.5px] ${status.className}`}
          style={{ fontWeight: 800 }}
        >
          {status.label.toUpperCase()}
        </span>
      </div>

      <p className="mt-2 text-[20px] leading-tight" style={{ fontWeight: 800 }}>
        {empresa.planoNome}
      </p>

      <div className="mt-4 flex items-end gap-1.5">
        <span className="text-[34px] leading-none" style={{ fontWeight: 800, letterSpacing: '-.03em' }}>
          {formatarMoeda(empresa.valorMensal || 0)}
        </span>
        <span className="pb-1 text-[13px] text-white/60" style={{ fontWeight: 600 }}>
          /mês · {CICLO_LABEL[empresa.planoCiclo || ''] || empresa.planoCiclo}
        </span>
      </div>

      {empresa.cupom ? (
        <div className="mt-4 inline-flex w-fit items-center gap-2 rounded-pill bg-lime/15 px-3 py-1.5">
          <Ticket size={13} className="text-lime" />
          <span className="text-[11.5px] text-lime" style={{ fontWeight: 700 }}>
            Cupom {empresa.cupom.codigo} ·{' '}
            {empresa.cupom.descontoPct
              ? `${empresa.cupom.descontoPct}% off`
              : `${formatarMoeda(empresa.cupom.descontoValor || 0)} off`}
          </span>
        </div>
      ) : null}

      {confirmando ? (
        <div className="mt-auto space-y-3 pt-6">
          <p className="text-[12.5px] text-white/70" style={{ fontWeight: 500 }}>
            Cancelar a assinatura? O acesso continua até o fim do período já pago.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="flex-1 rounded-pill bg-white/10 px-4 py-2.5 text-[12.5px] text-white"
              style={{ fontWeight: 700 }}
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                onCancelar();
                setConfirmando(false);
              }}
              className="flex-1 rounded-pill bg-red-500 px-4 py-2.5 text-[12.5px] text-white disabled:opacity-60"
              style={{ fontWeight: 700 }}
            >
              Confirmar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
          <button
            type="button"
            onClick={onUpgrade}
            className="inline-flex items-center gap-1.5 rounded-pill bg-lime px-4 py-2.5 text-[12.5px] text-ink transition-colors hover:bg-lime-deep"
            style={{ fontWeight: 700, transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
          >
            Trocar de plano <ArrowUpRight size={14} />
          </button>

          {empresa.planoStatus !== 'CANCELADO' ? (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="text-[12.5px] text-white/50 transition-colors hover:text-white/80"
              style={{ fontWeight: 600 }}
            >
              Cancelar assinatura
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default PlanoAtualCard;
