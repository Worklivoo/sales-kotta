import React, { useState } from 'react';
import { Check, Copy, CreditCard, QrCode, X } from 'lucide-react';
import {
  comprarCreditosExtra,
  verificarStatusPagamento,
  type ConsumoResposta,
  type CreditosExtraResultado,
  type FormaPagamento,
  type PacoteExtra,
} from '../../lib/planoApi';

interface CreditosExtraModalProps {
  pacotes: PacoteExtra[];
  empresa: ConsumoResposta['empresa'];
  onSucesso: () => void;
  onFechar: () => void;
}

type Etapa = 'pacote' | 'pagamento' | 'pix' | 'cartao';

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

const CreditosExtraModal: React.FC<CreditosExtraModalProps> = ({
  pacotes,
  empresa,
  onSucesso,
  onFechar,
}) => {
  const [etapa, setEtapa] = useState<Etapa>('pacote');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CreditosExtraResultado | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // O pacote do meio ja vem marcado - e a escolha mais comum.
  const [pacoteCodigo, setPacoteCodigo] = useState(
    pacotes[Math.floor(pacotes.length / 2)]?.codigo || pacotes[0]?.codigo || '',
  );
  const [forma, setForma] = useState<FormaPagamento>(empresa.temCartaoSalvo ? 'CREDIT_CARD' : 'PIX');

  const pacote = pacotes.find((item) => item.codigo === pacoteCodigo) || null;

  const comprar = async () => {
    if (!pacote) return;

    setEnviando(true);
    setErro(null);

    try {
      const resposta = await comprarCreditosExtra({ pacoteCodigo: pacote.codigo, forma });
      setResultado(resposta);
      setEtapa(resposta.tipo === 'PIX' ? 'pix' : 'cartao');
    } catch (error: any) {
      setErro(error?.message || 'Não foi possível criar a cobrança das cotações extras.');
    } finally {
      setEnviando(false);
    }
  };

  const copiarPix = async () => {
    if (!resultado?.pix?.copiaCola) return;

    try {
      await navigator.clipboard.writeText(resultado.pix.copiaCola);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // area de transferencia indisponivel: o QR Code continua servindo
    }
  };

  const verificarPagamento = async () => {
    if (!resultado?.paymentId) return;

    setVerificando(true);
    setErro(null);

    try {
      const status = await verificarStatusPagamento(resultado.paymentId);

      if (status.pago) {
        onSucesso();
      } else {
        setErro('Ainda não identificamos o pagamento. Se você acabou de pagar, aguarde alguns segundos.');
      }
    } catch (error: any) {
      setErro(error?.message || 'Não foi possível verificar o pagamento.');
    } finally {
      setVerificando(false);
    }
  };

  const titulo =
    etapa === 'pacote'
      ? 'Comprar cotações extras'
      : etapa === 'pagamento'
        ? 'Forma de pagamento'
        : etapa === 'pix'
          ? 'Pague com Pix para liberar'
          : resultado?.aprovado
            ? 'Cotações liberadas'
            : 'Pagamento não aprovado';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-panel bg-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[17px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.02em' }}>
              {titulo}
            </h3>
            <p className="mt-0.5 text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
              Valem só neste ciclo e entram no limite quando o pagamento for confirmado.
            </p>
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

        {/* Resumo do pacote escolhido, presente em todas as etapas. */}
        {pacote ? (
          <div className="mt-4 flex items-end justify-between gap-3 rounded-tile bg-paper p-4">
            <div>
              <p
                className="text-[11.5px] uppercase text-muted-soft"
                style={{ fontWeight: 700, letterSpacing: '.06em' }}
              >
                {pacote.cotacoes} cotações extras
              </p>
              <p
                className="mt-1 text-[26px] leading-none text-ink"
                style={{ fontWeight: 800, letterSpacing: '-.03em' }}
              >
                {formatarMoeda(pacote.valorTotal)}
              </p>
            </div>
            <span className="text-[11.5px] text-muted" style={{ fontWeight: 500 }}>
              {formatarMoeda(pacote.precoPorCotacao)} por cotação
            </span>
          </div>
        ) : null}

        {etapa === 'pacote' ? (
          <>
            <div className="mt-5 flex flex-col gap-2">
              {pacotes.map((item) => {
                const ativo = item.codigo === pacoteCodigo;

                return (
                  <button
                    key={item.codigo}
                    type="button"
                    onClick={() => setPacoteCodigo(item.codigo)}
                    className={`flex items-center justify-between gap-3 rounded-tile border p-3.5 text-left transition-colors ${
                      ativo ? 'border-ink bg-paper' : 'border-line-soft bg-card hover:border-line'
                    }`}
                    style={{ transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-pill border ${
                          ativo ? 'border-ink bg-ink' : 'border-line'
                        }`}
                      >
                        {ativo ? <Check size={10} className="text-white" strokeWidth={3.5} /> : null}
                      </span>
                      <span>
                        <span className="block text-[13.5px] text-ink" style={{ fontWeight: 700 }}>
                          {item.cotacoes} cotações
                        </span>
                        <span className="block text-[11.5px] text-muted" style={{ fontWeight: 500 }}>
                          {formatarMoeda(item.precoPorCotacao)} cada
                        </span>
                      </span>
                    </span>

                    <span className="text-[14px] text-ink" style={{ fontWeight: 800 }}>
                      {formatarMoeda(item.valorTotal)}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setEtapa('pagamento')}
              disabled={!pacote}
              className="mt-5 w-full rounded-pill bg-lime px-4 py-3 text-[13px] text-ink transition-colors hover:bg-lime-deep disabled:opacity-40"
              style={{ fontWeight: 700 }}
            >
              Continuar
            </button>
          </>
        ) : null}

        {etapa === 'pagamento' ? (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setForma('PIX')}
                className={`flex flex-col items-start gap-2 rounded-tile border p-4 text-left transition-colors ${
                  forma === 'PIX' ? 'border-ink bg-paper' : 'border-line-soft bg-card hover:border-line'
                }`}
                style={{ transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
              >
                <QrCode size={19} className="text-ink" />
                <span>
                  <span className="block text-[13px] text-ink" style={{ fontWeight: 700 }}>
                    Pix
                  </span>
                  <span className="block text-[11px] text-muted" style={{ fontWeight: 500 }}>
                    QR Code na hora
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setForma('CREDIT_CARD')}
                disabled={!empresa.temCartaoSalvo}
                className={`flex flex-col items-start gap-2 rounded-tile border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  forma === 'CREDIT_CARD'
                    ? 'border-ink bg-paper'
                    : 'border-line-soft bg-card hover:border-line'
                }`}
                style={{ transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
              >
                <CreditCard size={19} className="text-ink" />
                <span>
                  <span className="block text-[13px] text-ink" style={{ fontWeight: 700 }}>
                    Cartão
                  </span>
                  <span className="block text-[11px] text-muted" style={{ fontWeight: 500 }}>
                    {empresa.temCartaoSalvo && empresa.cartao
                      ? `•••• ${empresa.cartao.final4}`
                      : 'Nenhum cartão salvo'}
                  </span>
                </span>
              </button>
            </div>

            <p className="mt-4 rounded-tile bg-paper p-3.5 text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
              {forma === 'PIX'
                ? 'Ao confirmar, mostramos o QR Code aqui mesmo. As cotações entram no limite assim que o pagamento cair.'
                : `Cobramos ${empresa.cartao ? `no cartão •••• ${empresa.cartao.final4}` : 'no cartão da assinatura'} agora, sem precisar digitar os dados de novo.`}
            </p>

            {erro ? (
              <p className="mt-4 rounded-tile bg-red-50 p-3 text-[12px] text-red-700" style={{ fontWeight: 600 }}>
                {erro}
              </p>
            ) : null}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setEtapa('pacote')}
                disabled={enviando}
                className="rounded-pill bg-paper px-4 py-3 text-[13px] text-ink disabled:opacity-40"
                style={{ fontWeight: 700 }}
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={comprar}
                disabled={enviando}
                className="flex-1 rounded-pill bg-lime px-4 py-3 text-[13px] text-ink transition-colors hover:bg-lime-deep disabled:opacity-40"
                style={{ fontWeight: 700 }}
              >
                {enviando ? 'Processando...' : `Pagar ${pacote ? formatarMoeda(pacote.valorTotal) : ''}`}
              </button>
            </div>
          </>
        ) : null}

        {etapa === 'pix' && resultado?.pix ? (
          <>
            <div className="mt-5 flex flex-col items-center gap-4 rounded-tile bg-paper p-5">
              <img
                src={`data:image/png;base64,${resultado.pix.qrCodeBase64}`}
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
              Escaneie o QR Code ou cole o código no app do banco. Depois de pagar, clique em "Já paguei" —
              a cobrança também fica no histórico de faturas se você preferir pagar depois.
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
          </>
        ) : null}

        {etapa === 'cartao' ? (
          <>
            <div
              className={`mt-5 rounded-tile p-5 text-center ${
                resultado?.aprovado ? 'bg-lime/20' : 'bg-red-50'
              }`}
            >
              <div
                className={`mx-auto flex h-11 w-11 items-center justify-center rounded-tile ${
                  resultado?.aprovado ? 'bg-lime' : 'bg-red-100'
                }`}
              >
                {resultado?.aprovado ? (
                  <Check size={20} className="text-ink" strokeWidth={2.5} />
                ) : (
                  <X size={20} className="text-red-600" strokeWidth={2.5} />
                )}
              </div>

              <p className="mt-3 text-[13.5px] text-ink" style={{ fontWeight: 700 }}>
                {resultado?.aprovado
                  ? `${resultado.cotacoes} cotações já entraram no seu limite`
                  : 'O pagamento não foi aprovado'}
              </p>

              <p className="mt-1 text-[12px] text-muted" style={{ fontWeight: 500 }}>
                {resultado?.aprovado
                  ? `Cobrado no cartão ${resultado.cartao?.bandeira || ''} •••• ${resultado.cartao?.final4 || ''}.`
                  : 'A cobrança ficou no histórico de faturas. Você pode tentar de novo ou pagar por Pix.'}
              </p>
            </div>

            <div className="mt-5 flex gap-2">
              {resultado?.aprovado ? (
                <button
                  type="button"
                  onClick={onSucesso}
                  className="w-full rounded-pill bg-lime px-4 py-3 text-[13px] text-ink"
                  style={{ fontWeight: 700 }}
                >
                  Concluir
                </button>
              ) : (
                <>
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
                    onClick={() => setEtapa('pagamento')}
                    className="flex-1 rounded-pill bg-lime px-4 py-3 text-[13px] text-ink"
                    style={{ fontWeight: 700 }}
                  >
                    Tentar de novo
                  </button>
                </>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default CreditosExtraModal;
