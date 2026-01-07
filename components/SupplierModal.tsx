import React from 'react';
import { X, MapPin, Mail, Sparkles, History, Phone, Building2, Globe, User } from 'lucide-react';
import { Supplier } from '../types';

interface SupplierModalProps {
  supplier: Supplier | null;
  isOpen: boolean;
  onClose: () => void;
}

const SupplierModal: React.FC<SupplierModalProps> = ({ supplier, isOpen, onClose }) => {
  if (!isOpen || !supplier) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 p-6 flex justify-between items-start z-10">
          <div className="flex gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center font-bold text-2xl text-gray-900 border border-gray-100">
              {supplier.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{supplier.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-gray-500">{supplier.category}</span>
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">
          {/* General Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Building2 size={18} /> Informações Empresariais
              </h3>
              <div className="space-y-3 text-sm text-gray-600">
                 <div className="flex items-center gap-3">
                  <span className="font-medium min-w-[80px]">CNPJ:</span>
                  <span>{supplier.cnpj}</span>
                </div>
                 <div className="flex items-center gap-3">
                  <span className="font-medium min-w-[80px]">Cidade:</span>
                  <span>{supplier.city} - {supplier.state}</span>
                </div>
              </div>
            </div>

             <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <User size={18} /> Contato
              </h3>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-center gap-3">
                  <User size={16} className="text-gray-400" />
                  <span>{supplier.contactName} (Representante)</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone size={16} className="text-gray-400" />
                  <span>{supplier.phone}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Mail size={16} className="text-gray-400" />
                  <span>{supplier.email}</span>
                </div>
              </div>
            </div>
          </div>



          {/* History */}
          <div>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-gray-900">
              <History size={20} /> Item/Custo
            </h3>
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Unidade de Medida</th>
                    <th className="px-4 py-3 text-right">Custo</th>
                    <th className="px-4 py-3 text-right">Data de Atualização</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {supplier.items.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                      <td className="px-4 py-3 text-gray-500">{item.type}</td>
                      <td className="px-4 py-3 text-gray-500">{item.unit}</td>
                      <td className="px-4 py-3 text-right">R$ {item.historicalCost.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{item.lastQuoteDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <div className="w-full mb-4">
            <div className="flex items-center gap-4 px-6 py-4 rounded-xl w-full shadow-sm" style={{ backgroundColor: '#EBF57D' }}>
              <div className="bg-black/5 p-2.5 rounded-lg shadow-sm backdrop-blur-sm">
                  <Sparkles size={20} className="text-black" />
              </div>
              <div>
                  <p className="text-xs font-bold text-black/70 uppercase tracking-wider mb-0.5">Atualização de Valores via IA</p>
                  <p className="text-base font-bold text-black">
                      Dados sincronizados em: {supplier.lastAiUpdate}
                  </p>
              </div>
            </div>
          </div>
          <a 
            href={supplier.website} 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-full py-3 bg-black text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors shadow-lg shadow-black/5 flex items-center justify-center gap-2"
          >
            <Globe size={18} />
            Ver Site
          </a>
        </div>
      </div>
    </div>
  );
};

export default SupplierModal;
