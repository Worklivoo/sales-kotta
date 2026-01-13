import React from 'react';
import { X, Building2, Calendar, DollarSign, Truck, FileText, Package, Download } from 'lucide-react';
import { Proposal } from '../types';

interface ProposalDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposal: Proposal | null;
}

const ProposalDetailModal: React.FC<ProposalDetailModalProps> = ({ isOpen, onClose, proposal }) => {
  if (!isOpen || !proposal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] relative overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Building2 size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{proposal.supplierName}</h2>
              <p className="text-sm text-gray-500">Detalhes da Cotação</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <X size={24} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-8 custom-scrollbar">
          
          {/* Main Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
              <div className="flex items-center gap-2 text-gray-500 mb-2 text-sm font-medium uppercase tracking-wider">
                <DollarSign size={16} /> Valor Total
              </div>
              <p className="text-2xl font-bold text-gray-900">
                R$ {proposal.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            
            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
              <div className="flex items-center gap-2 text-gray-500 mb-2 text-sm font-medium uppercase tracking-wider">
                <Truck size={16} /> Prazo de Entrega
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {proposal.deliveryDays} dias úteis
              </p>
            </div>

            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
              <div className="flex items-center gap-2 text-gray-500 mb-2 text-sm font-medium uppercase tracking-wider">
                <Calendar size={16} /> Validade
              </div>
              <p className="text-lg font-bold text-gray-900">
                {proposal.proposalValidity ? new Date(proposal.proposalValidity).toLocaleDateString('pt-BR') : '-'}
              </p>
            </div>
          </div>

          {/* Payment Conditions */}
          {proposal.paymentConditions && (
            <div className="mb-8">
              <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <FileText size={18} className="text-gray-400" />
                Condições de Pagamento
              </h3>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-gray-700">
                {proposal.paymentConditions}
              </div>
            </div>
          )}

          {/* Attachments */}
          {proposal.attachments && proposal.attachments.length > 0 && (
            <div className="mb-8">
              <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <FileText size={18} className="text-gray-400" />
                Anexos da Proposta
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {proposal.attachments.map((url, index) => (
                  <a 
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-white hover:shadow-sm transition-all group"
                  >
                    <div className="p-2 bg-white rounded-lg border border-gray-200 group-hover:border-blue-100 transition-colors">
                      <Download size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
                    </div>
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 truncate">
                      Anexo {index + 1}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Items Table */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Package size={18} className="text-gray-400" />
              Itens Cotados
            </h3>
            <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Item</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Qtd</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Unitário</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {proposal.items && proposal.items.length > 0 ? (
                    proposal.items.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-4">
                          <p className="font-medium text-gray-900">{item.nome_item}</p>
                          {item.marca && <p className="text-xs text-gray-500 mt-0.5">Marca: {item.marca}</p>}
                        </td>
                        <td className="p-4 text-gray-600">
                          {item.quantidade} {item.unidade_medida}
                        </td>
                        <td className="p-4 text-gray-600">
                          R$ {(Number(item.preco_total_item) / item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-4 text-right font-medium text-gray-900">
                          R$ {Number(item.preco_total_item).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-gray-400 italic">
                        Nenhum item encontrado nesta cotação.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
        
        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 font-semibold text-gray-700 hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 rounded-xl transition-all"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};

export default ProposalDetailModal;
