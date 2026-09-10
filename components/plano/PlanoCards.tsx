import React, { useMemo, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import type { CatalogoOpcao } from '../../lib/planoApi';

interface PlanoCardsProps {
  opcoes: CatalogoOpcao[];
  planoAtualCodigo: string | null;
  cicloAtual: string | null;
  isSubmitting: boolean;
  onEscolher: (planoCodigo: string, ciclo: string) => void;
  variante?: 'pagina' | 'modal';
}

const CICLO_ORDEM = ['MENSAL', 'TRIMESTRAL', 'ANUAL'];
const PLANO_DESTAQUE = 'PLANO_300';

const BENEFICIOS = [
  'Triagem de cotações por IA',
  'WhatsApp e e-mail integrados',
  'Orçamento em PDF automático',
  'Membros da equipe ilimitados',
];

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

const PlanoCards: React.FC<PlanoCardsProps> = ({
  opcoes,
  planoAtualCodigo,
  cicloAtual,
  isSubmitting,
  onEscolher,
  variante = 'pagina',
}) => {
  const [cicloSelecionado, setCicloSelecionado] = useState<string>(cicloAtual || 'MENSAL');
  const isPagina = variante === 'pagina';

  const ciclos = useMemo(() => {
    const unicos = new Map<string, { codigo: string; label: string; descontoPct: number }>();
    for (const opcao of opcoes) {
      if (!unicos.has(opcao.ciclo)) {
        unicos.set(opcao.ciclo, {
          codigo: opcao.ciclo,
          label: opcao.cicloLabel,
          descontoPct: opcao.descontoPct,
        });
      }
    }
    return CICLO_ORDEM.map((codigo) => unicos.get(codigo)).filter(Boolean) as Array<{
      codigo: string;
      label: string;
      descontoPct: number;
    }>;
  }, [opcoes]);

  const opcoesDoCiclo = useMemo(
    () => opcoes.filter((opcao) => opcao.ciclo === cicloSelecionado),
    [opcoes, cicloSelecionado],
  );

  return (
    <div className="space-y-6">
      <div className={`flex flex-col items-center gap-4 ${isPagina ? '' : 'gap-3'}`}>
        {isPagina ? (
          <div className="text-center">
            <h2
              className="text-[26px] leading-tight text-ink"
              style={{ fontWeight: 800, letterSpacing: '-.03em' }}
            >
              Escolha o plano da sua operação
            </h2>
            <p className="mt-1.5 text-[13.5px] text-muted" style={{ fontWeight: 500 }}>
              Você paga por volume de cotações atendidas. Sem taxa de setup, cancele quando quiser.
            </p>
          </div>
        ) : null}

        <div
          role="tablist"
          aria-label="Ciclo de cobrança"
          className="inline-flex items-center gap-1 rounded-pill bg-stone p-1"
        >
          {ciclos.map((ciclo) => {
            const isActive = ciclo.codigo === cicloSelecionado;

            return (
              <button
                key={ciclo.codigo}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setCicloSelecionado(ciclo.codigo)}
                className={`inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[12.5px] transition-all ${
                  isActive ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'
                }`}
                style={{ fontWeight: 700, transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
              >
                {ciclo.label}
                {ciclo.descontoPct > 0 ? (
                  <span
                    className="rounded-pill bg-lime px-1.5 py-0.5 text-[10.5px] text-ink"
                    style={{ fontWeight: 800 }}
                  >
                    -{ciclo.descontoPct}%
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {opcoesDoCiclo.map((opcao) => {
          const isPlanoAtual = opcao.planoCodigo === planoAtualCodigo && opcao.ciclo === cicloAtual;
          const isDestaque = opcao.planoCodigo === PLANO_DESTAQUE;
          const porDiaUtil = Math.round(opcao.limiteAtendimentosMes / 22);

          return (
            <div
              key={opcao.planoCodigo}
              className={`relative flex flex-col rounded-panel p-6 transition-transform ${
                isDestaque
                  ? 'bg-ink text-white lg:-mt-2 lg:mb-[-8px]'
                  : 'border border-line-soft bg-card text-ink'
              }`}
              style={{ transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p
                    className={`text-[12px] uppercase tracking-wide ${isDestaque ? 'text-white/60' : 'text-muted-soft'}`}
                    style={{ fontWeight: 700, letterSpacing: '.08em' }}
                  >
                    {opcao.limiteAtendimentosMes} cotações/mês
                  </p>
                  <p
                    className={`mt-1 text-[17px] ${isDestaque ? 'text-white' : 'text-ink'}`}
                    style={{ fontWeight: 800 }}
                  >
                    {opcao.nome}
                  </p>
                </div>

                {isDestaque ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-lime px-2.5 py-1 text-[10.5px] text-ink"
                    style={{ fontWeight: 800 }}
                  >
                    <Sparkles size={11} /> POPULAR
                  </span>
                ) : isPlanoAtual ? (
                  <span
                    className="shrink-0 rounded-pill bg-lime px-2.5 py-1 text-[10.5px] text-ink"
                    style={{ fontWeight: 800 }}
                  >
                    SEU PLANO
                  </span>
                ) : null}
              </div>

              <div className="mt-5">
                <div className="flex items-end gap-1.5">
                  <span
                    className={`text-[34px] leading-none ${isDestaque ? 'text-white' : 'text-ink'}`}
                    style={{ fontWeight: 800, letterSpacing: '-.03em' }}
                  >
                    {formatarMoeda(opcao.precoMesEquivalente)}
                  </span>
                  <span
                    className={`pb-1 text-[13px] ${isDestaque ? 'text-white/60' : 'text-muted'}`}
                    style={{ fontWeight: 600 }}
                  >
                    /mês
                  </span>
                </div>

                <p
                  className={`mt-1.5 text-[12px] ${isDestaque ? 'text-white/60' : 'text-muted'}`}
                  style={{ fontWeight: 500 }}
                >
                  {opcao.meses > 1
                    ? `${formatarMoeda(opcao.precoCicloTotal)} cobrado a cada ${opcao.meses} meses`
                    : 'cobrado todo mês'}
                </p>
              </div>

              <button
                type="button"
                disabled={isSubmitting || isPlanoAtual}
                onClick={() => onEscolher(opcao.planoCodigo, opcao.ciclo)}
                className={`mt-5 inline-flex items-center justify-center rounded-pill px-4 py-3 text-[13px] transition-all disabled:cursor-not-allowed ${
                  isPlanoAtual
                    ? isDestaque
                      ? 'bg-white/10 text-white/50'
                      : 'bg-stone text-muted'
                    : 'bg-lime text-ink hover:bg-lime-deep'
                }`}
                style={{ fontWeight: 700, transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
              >
                {isPlanoAtual ? 'Plano atual' : planoAtualCodigo ? 'Trocar para este' : 'Assinar plano'}
              </button>

              <ul
                className={`mt-6 space-y-2.5 border-t pt-5 ${isDestaque ? 'border-white/10' : 'border-line-soft'}`}
              >
                <li className="flex items-start gap-2">
                  <Check
                    size={15}
                    className={`mt-0.5 shrink-0 ${isDestaque ? 'text-lime' : 'text-ink'}`}
                    strokeWidth={2.5}
                  />
                  <span
                    className={`text-[12.5px] ${isDestaque ? 'text-white' : 'text-ink'}`}
                    style={{ fontWeight: 700 }}
                  >
                    Até {opcao.limiteAtendimentosMes} cotações/mês
                    <span
                      className={`ml-1 ${isDestaque ? 'text-white/50' : 'text-muted'}`}
                      style={{ fontWeight: 500 }}
                    >
                      (~{porDiaUtil}/dia útil)
                    </span>
                  </span>
                </li>

                {BENEFICIOS.map((beneficio) => (
                  <li key={beneficio} className="flex items-start gap-2">
                    <Check
                      size={15}
                      className={`mt-0.5 shrink-0 ${isDestaque ? 'text-lime' : 'text-ink'}`}
                      strokeWidth={2.5}
                    />
                    <span
                      className={`text-[12.5px] ${isDestaque ? 'text-white/80' : 'text-muted'}`}
                      style={{ fontWeight: 500 }}
                    >
                      {beneficio}
                    </span>
                  </li>
                ))}

                <li className="flex items-start gap-2">
                  <Check
                    size={15}
                    className={`mt-0.5 shrink-0 ${isDestaque ? 'text-lime' : 'text-ink'}`}
                    strokeWidth={2.5}
                  />
                  <span
                    className={`text-[12.5px] ${isDestaque ? 'text-white/80' : 'text-muted'}`}
                    style={{ fontWeight: 500 }}
                  >
                    Cotações extras avulsas quando precisar
                  </span>
                </li>
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PlanoCards;
