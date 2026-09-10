import React from 'react';
import { Sparkles } from 'lucide-react';

interface TrialBannerProps {
  dataFinalTrial: string | null;
  qtdCotacoes: number;
}

const formatarData = (valor: string | null) => {
  if (!valor) return null;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(new Date(valor));
};

const diasRestantes = (valor: string | null) => {
  if (!valor) return null;
  const diff = new Date(valor).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

const TrialBanner: React.FC<TrialBannerProps> = ({ dataFinalTrial, qtdCotacoes }) => {
  const dias = diasRestantes(dataFinalTrial);

  return (
    <div className="rounded-panel bg-ink p-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-tile bg-lime">
            <Sparkles size={19} className="text-ink" />
          </div>

          <div>
            <p className="text-[17px] leading-tight" style={{ fontWeight: 800 }}>
              Você está no período de teste grátis
            </p>
            <p className="mt-1 text-[13px] text-white/60" style={{ fontWeight: 500 }}>
              Acesso liberado sem limite de cotações até {formatarData(dataFinalTrial)}. Escolha um plano
              abaixo quando quiser continuar depois dessa data.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[26px] leading-none" style={{ fontWeight: 800, letterSpacing: '-.03em' }}>
              {dias}
            </p>
            <p className="mt-1 text-[11px] uppercase text-white/50" style={{ fontWeight: 700, letterSpacing: '.08em' }}>
              {dias === 1 ? 'dia restante' : 'dias restantes'}
            </p>
          </div>

          <div className="h-10 w-px bg-white/10" />

          <div className="text-right">
            <p className="text-[26px] leading-none" style={{ fontWeight: 800, letterSpacing: '-.03em' }}>
              {qtdCotacoes}
            </p>
            <p className="mt-1 text-[11px] uppercase text-white/50" style={{ fontWeight: 700, letterSpacing: '.08em' }}>
              cotações no teste
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrialBanner;
