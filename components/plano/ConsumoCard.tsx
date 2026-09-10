import React from 'react';
import { AlertTriangle, Infinity as InfinityIcon, Plus } from 'lucide-react';
import type { ConsumoResposta } from '../../lib/planoApi';

interface ConsumoCardProps {
  consumo: ConsumoResposta['consumoCiclo'];
  isSubmitting: boolean;
  onUpgrade: () => void;
  onComprarCreditos: () => void;
}

export const LIMIAR_ALERTA_PCT = 80;

const formatarPeriodo = (inicio: string | null, fim: string | null) => {
  if (!inicio || !fim) return null;

  const formatador = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
  const dataFim = new Date(fim);
  dataFim.setUTCDate(dataFim.getUTCDate() - 1);

  return `${formatador.format(new Date(inicio))} — ${formatador.format(dataFim)}`;
};

const diasRestantes = (fim: string | null) => {
  if (!fim) return null;
  const diff = new Date(fim).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

const ConsumoCard: React.FC<ConsumoCardProps> = ({
  consumo,
  isSubmitting,
  onUpgrade,
  onComprarCreditos,
}) => {
  const percentual =
    consumo.limiteEfetivo > 0 ? Math.min(100, (consumo.qtdCotacoes / consumo.limiteEfetivo) * 100) : 0;
  const proximoDoLimite = !consumo.limiteAtingido && percentual >= LIMIAR_ALERTA_PCT;
  const periodo = formatarPeriodo(consumo.cicloInicio, consumo.cicloFim);
  const dias = diasRestantes(consumo.cicloFim);

  const corBarra = consumo.limiteAtingido ? 'bg-red-400' : proximoDoLimite ? 'bg-orange-400' : 'bg-ink';

  return (
    <div className="flex flex-col rounded-panel border border-line-soft bg-card p-6">
      <div className="flex items-start justify-between gap-3">
        <p
          className="text-[12px] uppercase text-muted-soft"
          style={{ fontWeight: 700, letterSpacing: '.08em' }}
        >
          Consumo do ciclo
        </p>
        {periodo ? (
          <span className="rounded-pill bg-stone px-2.5 py-1 text-[10.5px] text-muted" style={{ fontWeight: 700 }}>
            {periodo}
          </span>
        ) : null}
      </div>

      {consumo.semLimite ? (
        <>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-[34px] leading-none text-ink" style={{ fontWeight: 800, letterSpacing: '-.03em' }}>
              {consumo.qtdCotacoes}
            </span>
            <span className="inline-flex items-center gap-1 pb-1.5 text-[13px] text-muted" style={{ fontWeight: 600 }}>
              / <InfinityIcon size={16} /> cotações
            </span>
          </div>
          <p className="mt-2 text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
            Durante o período de teste não existe limite de cotações.
          </p>
        </>
      ) : (
        <>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="flex items-end gap-1.5">
              <span
                className="text-[34px] leading-none text-ink"
                style={{ fontWeight: 800, letterSpacing: '-.03em' }}
              >
                {consumo.qtdCotacoes}
              </span>
              <span className="pb-1.5 text-[13px] text-muted" style={{ fontWeight: 600 }}>
                / {consumo.limiteEfetivo} cotações
              </span>
            </div>
            <span className="text-[13px] text-ink" style={{ fontWeight: 800 }}>
              {Math.round(percentual)}%
            </span>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-stone">
            <div
              className={`h-full rounded-pill transition-all ${corBarra}`}
              style={{ width: `${percentual}%`, transitionDuration: '.4s', transitionTimingFunction: 'var(--ease)' }}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted" style={{ fontWeight: 500 }}>
            {dias !== null ? <span>Renova em {dias} {dias === 1 ? 'dia' : 'dias'}</span> : null}
            {consumo.creditosExtras > 0 ? (
              <span className="text-ink" style={{ fontWeight: 700 }}>
                +{consumo.creditosExtras} extras neste ciclo
              </span>
            ) : null}
          </div>
        </>
      )}

      {consumo.limiteAtingido || proximoDoLimite ? (
        <div
          className={`mt-5 rounded-tile p-4 ${
            consumo.limiteAtingido ? 'bg-red-50' : 'bg-orange-50'
          }`}
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle
              size={17}
              className={`mt-0.5 shrink-0 ${consumo.limiteAtingido ? 'text-red-600' : 'text-orange-600'}`}
            />
            <div className="flex-1">
              <p
                className={`text-[12.5px] ${consumo.limiteAtingido ? 'text-red-800' : 'text-orange-800'}`}
                style={{ fontWeight: 700 }}
              >
                {consumo.limiteAtingido
                  ? 'Limite do ciclo esgotado'
                  : `Você já usou ${Math.round(percentual)}% do limite`}
              </p>
              <p
                className={`mt-0.5 text-[12px] ${consumo.limiteAtingido ? 'text-red-700' : 'text-orange-700'}`}
                style={{ fontWeight: 500 }}
              >
                {consumo.limiteAtingido
                  ? 'Novas cotações ficam pausadas até você liberar mais espaço.'
                  : 'Garanta espaço antes de esgotar para não pausar o atendimento.'}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 pl-7">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onUpgrade}
              className="rounded-pill bg-ink px-3.5 py-2 text-[12px] text-white disabled:opacity-60"
              style={{ fontWeight: 700 }}
            >
              Aumentar plano
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onComprarCreditos}
              className="inline-flex items-center gap-1 rounded-pill bg-card px-3.5 py-2 text-[12px] text-ink disabled:opacity-60"
              style={{ fontWeight: 700 }}
            >
              <Plus size={13} /> Cotações extras
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={isSubmitting || consumo.semLimite}
          onClick={onComprarCreditos}
          className="mt-auto inline-flex w-fit items-center gap-1.5 pt-5 text-[12.5px] text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          style={{ fontWeight: 600 }}
        >
          <Plus size={14} /> Comprar cotações extras
        </button>
      )}
    </div>
  );
};

export default ConsumoCard;
