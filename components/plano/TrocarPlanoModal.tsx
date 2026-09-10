import React from 'react';
import { X } from 'lucide-react';
import PlanoCards from './PlanoCards';
import type { CatalogoOpcao } from '../../lib/planoApi';

interface TrocarPlanoModalProps {
  opcoes: CatalogoOpcao[];
  planoAtualCodigo: string | null;
  cicloAtual: string | null;
  onEscolher: (planoCodigo: string, ciclo: string) => void;
  onFechar: () => void;
}

const TrocarPlanoModal: React.FC<TrocarPlanoModalProps> = ({
  opcoes,
  planoAtualCodigo,
  cicloAtual,
  onEscolher,
  onFechar,
}) => (
  <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm sm:items-center">
    <div className="my-auto w-full max-w-4xl rounded-panel bg-paper p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.02em' }}>
            Trocar de plano
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
            A troca vale na hora e o ciclo de consumo reinicia a partir de hoje.
          </p>
        </div>

        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="rounded-pill p-1.5 text-muted transition-colors hover:bg-card hover:text-ink"
        >
          <X size={18} />
        </button>
      </div>

      <div className="mt-6">
        <PlanoCards
          opcoes={opcoes}
          planoAtualCodigo={planoAtualCodigo}
          cicloAtual={cicloAtual}
          isSubmitting={false}
          onEscolher={onEscolher}
          variante="modal"
        />
      </div>
    </div>
  </div>
);

export default TrocarPlanoModal;
