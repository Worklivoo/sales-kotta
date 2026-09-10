import React, { useState } from 'react';
import { X } from 'lucide-react';

interface ResgatarTrialModalProps {
  onResgatar: (codigo: string) => Promise<void>;
}

const ResgatarTrialModal: React.FC<ResgatarTrialModalProps> = ({ onResgatar }) => {
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const fechar = () => {
    if (enviando) return;
    setAberto(false);
    setCodigo('');
    setErro(null);
  };

  const enviar = async () => {
    if (!codigo.trim()) return;

    setEnviando(true);
    setErro(null);

    try {
      await onResgatar(codigo.trim());
      fechar();
    } catch (error: any) {
      setErro(error?.message || 'Não foi possível resgatar o código.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-[12px] text-muted-soft transition-colors hover:text-muted"
        style={{ fontWeight: 500 }}
      >
        Tenho um código de período grátis
      </button>

      {aberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-panel bg-card p-6 text-left">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] text-ink" style={{ fontWeight: 800 }}>
                  Resgatar período grátis
                </h3>
                <p className="mt-0.5 text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
                  Informe o código fornecido pelo time da Worklivoo.
                </p>
              </div>

              <button
                type="button"
                onClick={fechar}
                aria-label="Fechar"
                className="rounded-pill p-1.5 text-muted transition-colors hover:bg-paper hover:text-ink"
              >
                <X size={17} />
              </button>
            </div>

            <input
              type="text"
              value={codigo}
              onChange={(event) => setCodigo(event.target.value.toUpperCase())}
              placeholder="CÓDIGO"
              autoFocus
              className="mt-4 w-full rounded-tile border border-line-soft bg-paper px-3.5 py-3 text-center text-[15px] text-ink outline-none transition-colors focus:border-ink"
              style={{ fontWeight: 700, letterSpacing: '.1em' }}
            />

            {erro ? (
              <p className="mt-2 text-[12px] text-red-600" style={{ fontWeight: 600 }}>
                {erro}
              </p>
            ) : null}

            <button
              type="button"
              onClick={enviar}
              disabled={enviando || !codigo.trim()}
              className="mt-4 w-full rounded-pill bg-lime px-4 py-3 text-[13px] text-ink transition-colors hover:bg-lime-deep disabled:opacity-40"
              style={{ fontWeight: 700 }}
            >
              {enviando ? 'Resgatando...' : 'Ativar período grátis'}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default ResgatarTrialModal;
