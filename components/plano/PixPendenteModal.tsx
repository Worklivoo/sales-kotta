import React, { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { verificarStatusPagamento, type PixPendente } from '../../lib/planoApi';

interface PixPendenteModalProps {
  pendente: PixPendente;
  onPago: () => void;
  onFechar: () => void;
}

const CICLO_LABEL: Record<string, string> = {
  MENSAL: 'mensal',
  TRIMESTRAL: 'trimestral',
  ANUAL: 'anual',
};

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

/* Reabre o Pix da primeira cobranca de quem assinou e ainda nao pagou.
   Mesmo visual da etapa Pix do AssinarModal, para o cliente reconhecer que e
   a mesma cobranca que ele gerou. */
const PixPendenteModal: React.FC<PixPendenteModalProps> = ({ pendente, onPago, onFechar }) => {
  const [verificando, setVerificando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const copiarPix = async () => {
    try {
      await navigator.clipboard.writeText(pendente.pix.copiaCola);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // area de transferencia indisponivel: o QR Code continua servindo
    }
  };

  const verificarPagamento = async () => {
    setVerificando(true);
    setErro(null);

    try {
      const status = await verificarStatusPagamento(pendente.paymentId);
      if (status.pago) {
        onPago();
      } else {
        setErro('Ainda não identificamos o pagamento. Se você acabou de pagar, aguarde alguns segundos.');
      }
    } catch (error: any) {
      setErro(error?.message || 'Não foi possível verificar o pagamento.');
    } finally {
      setVerificando(false);
    }
  };

  const subtitulo = [pendente.planoNome, CICLO_LABEL[pendente.planoCiclo || ''] || pendente.planoCiclo]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,20,0.55)] p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-panel bg-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[17px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.02em' }}>
              Pague com Pix para ativar
            </h3>
            {subtitulo ? (
              <p className="mt-0.5 text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
                {subtitulo}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-pill p-1.5 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <X size={17} />
          </button>
        </div>

        <div className="mt-4 rounded-tile bg-paper p-4">
          <p className="text-[11.5px] uppercase text-muted-soft" style={{ fontWeight: 700, letterSpacing: '.06em' }}>
            Primeiro pagamento
          </p>
          <p className="mt-1 text-[26px] leading-none text-ink" style={{ fontWeight: 800, letterSpacing: '-.03em' }}>
            {formatarMoeda(pendente.valor)}
          </p>
          <p className="mt-2 text-[12px] text-muted" style={{ fontWeight: 500 }}>
            Seu plano só é ativado depois que este Pix for pago.
          </p>
        </div>

        <div className="mt-5 flex flex-col items-center gap-4 rounded-tile bg-paper p-5">
          <img
            src={`data:image/png;base64,${pendente.pix.qrCodeBase64}`}
            alt="QR Code Pix"
            className="h-44 w-44 rounded-tile bg-white p-2"
          />

          <button
            type="button"
            onClick={copiarPix}
            className="inline-flex items-center gap-1.5 rounded-pill bg-card px-4 py-2.5 text-[12.5px] text-ink transition-colors hover:bg-stone"
            style={{ fontWeight: 700 }}
          >
            {copiado ? <Check size={14} /> : <Copy size={14} />}
            {copiado ? 'Código copiado' : 'Copiar código Pix'}
          </button>
        </div>

        <p className="mt-3 text-[12px] text-muted" style={{ fontWeight: 500 }}>
          Escaneie o QR Code ou cole o código no app do banco. Depois de pagar, clique em "Já paguei" — se o
          pagamento demorar a cair, seu plano é ativado sozinho quando o banco confirmar.
        </p>

        {erro ? (
          <p className="mt-3 rounded-tile bg-orange-50 p-3 text-[12px] text-orange-700" style={{ fontWeight: 600 }}>
            {erro}
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-pill bg-paper px-4 py-3 text-[13px] text-ink"
            style={{ fontWeight: 700 }}
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={verificarPagamento}
            disabled={verificando}
            className="flex-1 rounded-pill bg-lime px-4 py-3 text-[13px] text-ink transition-colors hover:bg-lime-deep disabled:opacity-40"
            style={{ fontWeight: 700 }}
          >
            {verificando ? 'Verificando...' : 'Já paguei'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PixPendenteModal;
