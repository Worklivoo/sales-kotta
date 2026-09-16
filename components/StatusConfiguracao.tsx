import React from 'react';
import { AlertCircle, Check } from 'lucide-react';

/* Pilula de status das configuracoes: verde quando esta pronto, vermelha
   enquanto falta. O vermelho e proposital - "pendente" tem que incomodar,
   senao o cliente acha que terminou a configuracao e nao terminou. */
export const Pilula: React.FC<{ pronto: boolean; rotuloPronto?: string; rotuloPendente?: string }> = ({
  pronto,
  rotuloPronto = 'Configurado',
  rotuloPendente = 'Pendente',
}) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
      pronto
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-red-200 bg-red-50 text-red-600'
    }`}
  >
    {pronto ? <Check size={12} /> : <AlertCircle size={12} />}
    {pronto ? rotuloPronto : rotuloPendente}
  </span>
);

/* So a pilula vermelha: onde "Configurado" nao acrescenta nada, basta nao
   mostrar nada quando esta pronto. */
export const PilulaPendente: React.FC<{ pendente: boolean }> = ({ pendente }) =>
  pendente ? <Pilula pronto={false} /> : null;

/* Versao compacta, so o icone, para menus (abas e barra lateral). */
export const IconePendente: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 13 }) => (
  <span
    className={`inline-flex items-center justify-center rounded-full bg-red-50 text-red-600 ring-1 ring-red-200 ${className}`}
    title="Configuração pendente"
    aria-label="Configuração pendente"
  >
    <AlertCircle size={size} />
  </span>
);
