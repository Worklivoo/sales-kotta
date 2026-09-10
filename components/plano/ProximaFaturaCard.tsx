import React from 'react';
import type { ConsumoResposta } from '../../lib/planoApi';

interface ProximaFaturaCardProps {
  empresa: ConsumoResposta['empresa'];
}

const CICLO_LABEL: Record<string, string> = {
  MENSAL: 'Mensal',
  TRIMESTRAL: 'Trimestral',
  ANUAL: 'Anual',
};

const MESES_POR_CICLO: Record<string, number> = { MENSAL: 1, TRIMESTRAL: 3, ANUAL: 12 };

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

const formatarData = (valor: string | null) => {
  if (!valor) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(
    new Date(valor),
  );
};

const ProximaFaturaCard: React.FC<ProximaFaturaCardProps> = ({ empresa }) => {
  const meses = MESES_POR_CICLO[empresa.planoCiclo || ''] || 1;
  const valorCiclo = (empresa.valorMensal || 0) * meses;
  const cancelado = empresa.planoStatus === 'CANCELADO';

  return (
    <div className="flex flex-col rounded-panel border border-line-soft bg-card p-6">
      <p
        className="text-[12px] uppercase text-muted-soft"
        style={{ fontWeight: 700, letterSpacing: '.08em' }}
      >
        {cancelado ? 'Assinatura cancelada' : 'Próxima fatura'}
      </p>

      <div className="mt-3 flex items-end gap-1.5">
        <span className="text-[34px] leading-none text-ink" style={{ fontWeight: 800, letterSpacing: '-.03em' }}>
          {cancelado ? '—' : formatarMoeda(valorCiclo)}
        </span>
        {!cancelado && meses > 1 ? (
          <span className="pb-1.5 text-[13px] text-muted" style={{ fontWeight: 600 }}>
            /{meses} meses
          </span>
        ) : null}
      </div>

      <div className="mt-5 space-y-2.5 border-t border-line-soft pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
            Ciclo de cobrança
          </span>
          <span className="text-[12.5px] text-ink" style={{ fontWeight: 700 }}>
            {CICLO_LABEL[empresa.planoCiclo || ''] || '—'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
            {cancelado ? 'Acesso até' : 'Vence em'}
          </span>
          <span className="text-[12.5px] text-ink" style={{ fontWeight: 700 }}>
            {formatarData(empresa.assinaturaPeriodoFim)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ProximaFaturaCard;
