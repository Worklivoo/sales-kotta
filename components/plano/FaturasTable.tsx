import React, { useMemo, useState } from 'react';
import { Check, Download, ExternalLink, FileText, Receipt } from 'lucide-react';
import type { Fatura } from '../../lib/planoApi';

interface FaturasTableProps {
  faturas: Fatura[];
  onConfirmarPagamento?: (paymentId: string) => Promise<void>;
}

type Aba = 'TODAS' | 'PAGAS' | 'PENDENTES';

const STATUS_PAGO = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']);

const statusInfo = (status: string) => {
  if (STATUS_PAGO.has(status)) return { label: 'Paga', className: 'bg-lime text-ink' };
  if (status === 'OVERDUE') return { label: 'Atrasada', className: 'bg-red-100 text-red-700' };
  if (status === 'REFUNDED') return { label: 'Estornada', className: 'bg-stone text-muted' };
  return { label: 'Aguardando', className: 'bg-orange-50 text-orange-700' };
};

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

const formatarData = (valor: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(valor),
  );

const ABAS: Array<{ chave: Aba; label: string }> = [
  { chave: 'TODAS', label: 'Todas' },
  { chave: 'PAGAS', label: 'Pagas' },
  { chave: 'PENDENTES', label: 'Pendentes' },
];

const FaturasTable: React.FC<FaturasTableProps> = ({ faturas, onConfirmarPagamento }) => {
  const [aba, setAba] = useState<Aba>('TODAS');
  const [verificando, setVerificando] = useState<string | null>(null);

  const confirmar = async (paymentId: string) => {
    if (!onConfirmarPagamento || verificando) return;

    setVerificando(paymentId);

    try {
      await onConfirmarPagamento(paymentId);
    } finally {
      setVerificando(null);
    }
  };

  const lista = useMemo(() => {
    const filtradas =
      aba === 'PAGAS'
        ? faturas.filter((fatura) => STATUS_PAGO.has(fatura.status))
        : aba === 'PENDENTES'
          ? faturas.filter((fatura) => !STATUS_PAGO.has(fatura.status))
          : faturas;

    return [...filtradas].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [faturas, aba]);

  return (
    <div className="rounded-panel border border-line-soft bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] text-ink" style={{ fontWeight: 800 }}>
            Histórico de faturas
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
            Todas as cobranças da sua conta, com recibo para download.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 rounded-pill bg-stone p-1">
          {ABAS.map((item) => (
            <button
              key={item.chave}
              type="button"
              onClick={() => setAba(item.chave)}
              className={`rounded-pill px-3.5 py-1.5 text-[12px] transition-all ${
                aba === item.chave ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'
              }`}
              style={{ fontWeight: 700, transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {!lista.length ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-tile bg-paper py-12 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-tile bg-card">
            <Receipt size={19} className="text-muted-soft" />
          </div>
          <p className="mt-3 text-[13px] text-ink" style={{ fontWeight: 700 }}>
            Nenhuma fatura {aba === 'PAGAS' ? 'paga' : aba === 'PENDENTES' ? 'pendente' : ''} por aqui
          </p>
          <p className="mt-0.5 text-[12px] text-muted" style={{ fontWeight: 500 }}>
            As cobranças aparecem aqui automaticamente.
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left">
            <thead>
              <tr>
                {['Fatura', 'Data', 'Valor', 'Status', ''].map((titulo, indice) => (
                  <th
                    key={titulo || indice}
                    className={`border-b border-line-soft pb-2.5 text-[11px] uppercase text-muted-soft ${
                      indice === 4 ? 'text-right' : ''
                    }`}
                    style={{ fontWeight: 700, letterSpacing: '.06em' }}
                  >
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((fatura) => {
                const status = statusInfo(fatura.status);
                const isCredito = fatura.tipo === 'CREDITO_EXTRA';

                return (
                  <tr key={fatura.id} className="border-b border-line-soft last:border-0">
                    <td className="py-3.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-tile bg-paper">
                          <FileText size={14} className="text-muted" />
                        </div>
                        <div>
                          <p className="text-[13px] text-ink" style={{ fontWeight: 700 }}>
                            {isCredito ? 'Cotações extras' : 'Assinatura'}
                          </p>
                          {isCredito && fatura.creditos_quantidade ? (
                            <p className="text-[11.5px] text-muted" style={{ fontWeight: 500 }}>
                              {fatura.creditos_quantidade} cotações
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 pr-3 text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
                      {formatarData(fatura.created_at)}
                    </td>

                    <td className="py-3.5 pr-3 text-[13px] text-ink" style={{ fontWeight: 700 }}>
                      {formatarMoeda(fatura.valor)}
                    </td>

                    <td className="py-3.5 pr-3">
                      <span
                        className={`inline-block rounded-pill px-2.5 py-1 text-[10.5px] ${status.className}`}
                        style={{ fontWeight: 800 }}
                      >
                        {status.label.toUpperCase()}
                      </span>
                    </td>

                    <td className="py-3.5 text-right">
                      {!STATUS_PAGO.has(fatura.status) ? (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {fatura.invoice_url ? (
                            <a
                              href={fatura.invoice_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-3 py-1.5 text-[12px] text-white transition-opacity hover:opacity-85"
                              style={{ fontWeight: 700 }}
                            >
                              <ExternalLink size={13} /> Pagar
                            </a>
                          ) : null}

                          {onConfirmarPagamento ? (
                            <button
                              type="button"
                              onClick={() => confirmar(fatura.asaas_payment_id)}
                              disabled={Boolean(verificando)}
                              className="inline-flex items-center gap-1.5 rounded-pill bg-paper px-3 py-1.5 text-[12px] text-ink transition-colors hover:bg-stone disabled:opacity-40"
                              style={{ fontWeight: 700 }}
                            >
                              <Check size={13} />
                              {verificando === fatura.asaas_payment_id ? 'Verificando...' : 'Já paguei'}
                            </button>
                          ) : null}
                        </div>
                      ) : fatura.invoice_url ? (
                        <a
                          href={fatura.invoice_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-pill bg-paper px-3 py-1.5 text-[12px] text-ink transition-colors hover:bg-stone"
                          style={{ fontWeight: 700 }}
                        >
                          <Download size={13} /> Recibo
                        </a>
                      ) : (
                        <span className="text-[12px] text-muted-soft" style={{ fontWeight: 500 }}>
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default FaturasTable;
