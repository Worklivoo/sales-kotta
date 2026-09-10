import React from 'react';
import { QrCode } from 'lucide-react';
import type { ConsumoResposta } from '../../lib/planoApi';

interface FormaPagamentoCardProps {
  empresa: ConsumoResposta['empresa'];
}

const FormaPagamentoCard: React.FC<FormaPagamentoCardProps> = ({ empresa }) => {
  const isCartao = empresa.formaPagamento === 'CREDIT_CARD';

  return (
    <div className="flex flex-col rounded-panel border border-line-soft bg-card p-6">
      <p
        className="text-[12px] uppercase text-muted-soft"
        style={{ fontWeight: 700, letterSpacing: '.08em' }}
      >
        Forma de pagamento
      </p>

      {isCartao ? (
        <>
          {/* Cartao mascarado: so bandeira e ultimos 4 digitos, que e o que o
              Asaas devolve. Numero completo nunca fica no nosso banco. */}
          <div className="mt-4 rounded-tile bg-ink p-4 text-white">
            <div className="flex items-start justify-between">
              <div className="h-7 w-10 rounded-[5px] bg-gradient-to-br from-lime to-lime-deep opacity-90" />
              <span className="text-[11px] uppercase text-white/60" style={{ fontWeight: 800, letterSpacing: '.1em' }}>
                {empresa.cartao?.bandeira || 'CARTÃO'}
              </span>
            </div>

            <p className="mt-5 text-[17px]" style={{ fontWeight: 700, letterSpacing: '.14em' }}>
              •••• •••• •••• {empresa.cartao?.final4}
            </p>

            <p className="mt-3 text-[10.5px] uppercase text-white/50" style={{ fontWeight: 700, letterSpacing: '.08em' }}>
              Titular
            </p>
            <p className="text-[12.5px] text-white/90" style={{ fontWeight: 600 }}>
              {empresa.nomeResponsavel}
            </p>
          </div>

          <p className="mt-4 text-[11.5px] text-muted-soft" style={{ fontWeight: 500 }}>
            Para trocar o cartão, cancele a assinatura e assine novamente com o novo cartão.
          </p>
        </>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3 rounded-tile bg-paper p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-tile bg-card">
              <QrCode size={20} className="text-ink" />
            </div>
            <div>
              <p className="text-[15px] text-ink" style={{ fontWeight: 800 }}>
                Pix
              </p>
              <p className="text-[12px] text-muted" style={{ fontWeight: 500 }}>
                {empresa.formaPagamento ? 'Cobrança gerada a cada ciclo' : 'Nenhuma forma definida ainda'}
              </p>
            </div>
          </div>

          <p className="mt-4 text-[11.5px] text-muted-soft" style={{ fontWeight: 500 }}>
            A cada renovação geramos um novo QR Code. Você recebe o aviso e paga pelo app do banco.
          </p>
        </>
      )}
    </div>
  );
};

export default FormaPagamentoCard;
