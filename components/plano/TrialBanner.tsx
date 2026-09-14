import React, { useEffect, useState } from 'react';
import { AlertCircle, Sparkles } from 'lucide-react';

interface TrialBannerProps {
  dataFinalTrial: string | null;
  qtdCotacoes: number;
}

/* Depois que o teste acaba o cartao continua na tela, vermelho, por este tempo
   (ou ate o cliente assinar - quem decide isso e a pagina, que deixa de
   renderizar o banner quando existe assinatura). */
export const DIAS_AVISO_TRIAL_EXPIRADO = 3;

const MS_DIA = 1000 * 60 * 60 * 24;

const formatarData = (valor: string | null) => {
  if (!valor) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(valor));
};

/* Saiu do teste ha menos de DIAS_AVISO_TRIAL_EXPIRADO dias. */
export const trialExpiradoRecente = (dataFinalTrial: string | null, agora = Date.now()) => {
  if (!dataFinalTrial) return false;
  const fim = new Date(dataFinalTrial).getTime();
  return fim <= agora && agora - fim < DIAS_AVISO_TRIAL_EXPIRADO * MS_DIA;
};

const doisDigitos = (n: number) => String(n).padStart(2, '0');

const partesRestantes = (ms: number) => {
  const totalSeg = Math.max(0, Math.floor(ms / 1000));
  return {
    dias: Math.floor(totalSeg / 86400),
    horas: Math.floor((totalSeg % 86400) / 3600),
    min: Math.floor((totalSeg % 3600) / 60),
    seg: totalSeg % 60,
  };
};

/* Relogio de 1 em 1 segundo, so enquanto o banner esta montado. */
const useAgora = () => {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return agora;
};

const Bloco: React.FC<{ valor: string; rotulo: string }> = ({ valor, rotulo }) => (
  <div className="min-w-[34px] text-center">
    <p
      className="text-[26px] leading-none"
      style={{ fontWeight: 800, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums' }}
    >
      {valor}
    </p>
    <p className="mt-1 text-[10.5px] uppercase text-white/50" style={{ fontWeight: 700, letterSpacing: '.08em' }}>
      {rotulo}
    </p>
  </div>
);

const Separador = () => (
  <span className="-mt-4 text-[22px] leading-none text-white/30" style={{ fontWeight: 700 }}>
    :
  </span>
);

const TrialBanner: React.FC<TrialBannerProps> = ({ dataFinalTrial, qtdCotacoes }) => {
  const agora = useAgora();
  const fim = dataFinalTrial ? new Date(dataFinalTrial).getTime() : agora;
  const expirado = fim <= agora;
  const { dias, horas, min, seg } = partesRestantes(fim - agora);

  if (expirado) {
    return (
      <div className="rounded-panel border border-red-200 bg-red-50 p-6 text-red-800">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-tile bg-red-500">
              <AlertCircle size={19} className="text-white" />
            </div>

            <div>
              <p className="text-[17px] leading-tight" style={{ fontWeight: 800 }}>
                Seu período de teste grátis expirou
              </p>
              <p className="mt-1 text-[13px] text-red-700/80" style={{ fontWeight: 500 }}>
                O teste terminou em {formatarData(dataFinalTrial)}. Escolha um plano abaixo para continuar
                usando o KOTTA IA.
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[26px] leading-none" style={{ fontWeight: 800, letterSpacing: '-.03em' }}>
              {qtdCotacoes}
            </p>
            <p
              className="mt-1 text-[11px] uppercase text-red-700/70"
              style={{ fontWeight: 700, letterSpacing: '.08em' }}
            >
              cotações no teste
            </p>
          </div>
        </div>
      </div>
    );
  }

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

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2" aria-label="Tempo restante do teste">
            <Bloco valor={String(dias)} rotulo={dias === 1 ? 'dia' : 'dias'} />
            <Separador />
            <Bloco valor={doisDigitos(horas)} rotulo="horas" />
            <Separador />
            <Bloco valor={doisDigitos(min)} rotulo="min" />
            <Separador />
            <Bloco valor={doisDigitos(seg)} rotulo="seg" />
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
