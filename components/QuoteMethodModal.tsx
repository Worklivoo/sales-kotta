import React from 'react';
import { X, Zap, Database, Globe, Lock } from 'lucide-react';

interface QuoteMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMethod: (method: 'ai-cost-base' | 'registered-suppliers' | 'new-suppliers') => void;
  requisitionId: string;
}

const QuoteMethodModal: React.FC<QuoteMethodModalProps> = ({ isOpen, onClose, onSelectMethod, requisitionId }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl relative overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 z-10"
        >
          <X size={24} />
        </button>

        {/* Header */}
        <div className="pt-12 pb-8 px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-3 tracking-tight">
            Como deseja iniciar esta cotação?
          </h2>
          <p className="text-gray-500 text-lg">
            Selecione o método dessa cotação.
          </p>
        </div>

        {/* Options Grid */}
        <div className="px-12 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Option 1: AI Cost Base */}
            <button
              disabled
              className="group relative flex flex-col items-center p-8 rounded-3xl border-2 border-gray-100 bg-gray-50/50 cursor-not-allowed opacity-75 text-center h-full"
            >
              <div className="absolute top-4 right-4 bg-gray-200 text-gray-500 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                <Lock size={10} /> Em breve
              </div>
              
              <div className="w-16 h-16 rounded-2xl bg-gray-200 flex items-center justify-center mb-6 grayscale opacity-50">
                <Zap size={32} className="text-gray-500" fill="currentColor" />
              </div>
              
              <h3 className="text-lg font-bold text-gray-400 mb-3">Base de Custo IA</h3>
              <p className="text-sm text-gray-400 leading-relaxed mb-6">
                Utilizar a IA para trazer itens já cadastrados
              </p>
              
              <div className="mt-auto px-4 py-1.5 bg-gray-200/50 rounded-full text-xs font-semibold text-gray-400">
                13 Itens Encontrados
              </div>
            </button>

            {/* Option 2: Registered Suppliers */}
            <button
              disabled
              className="group relative flex flex-col items-center p-8 rounded-3xl border border-gray-100 bg-gray-50/50 cursor-not-allowed opacity-75 text-center h-full"
            >
              <div className="absolute top-4 right-4 bg-gray-200 text-gray-500 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                <Lock size={10} /> Em breve
              </div>

              <div className="w-16 h-16 rounded-2xl bg-gray-200 flex items-center justify-center mb-6 grayscale opacity-50">
                <Database size={32} className="text-gray-500" />
              </div>
              
              <h3 className="text-lg font-bold text-gray-400 mb-3">Fornecedores Cadastrados</h3>
              <p className="text-sm text-gray-400 leading-relaxed mb-6">
                Solicitar nova cotação para fornecedores homologados no sistema
              </p>

              <div className="mt-auto px-4 py-1.5 bg-gray-100 rounded-full text-xs font-semibold text-gray-400">
                6 Fornecedores Encontrados
              </div>
            </button>

            {/* Option 3: New Suppliers */}
            <button
              onClick={() => onSelectMethod('new-suppliers')}
              className="group relative flex flex-col items-center p-8 rounded-3xl border-2 border-[#EBF57D] bg-white shadow-xl shadow-[#EBF57D]/40 hover:shadow-[#EBF57D]/60 transition-all duration-300 hover:-translate-y-1 text-center h-full ring-4 ring-[#EBF57D]/20"
            >
              <div className="absolute top-4 right-4 bg-black text-[#EBF57D] text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                <Zap size={10} fill="currentColor" /> IA
              </div>

              <div className="w-16 h-16 rounded-2xl bg-[#EBF57D] flex items-center justify-center mb-6 shadow-lg shadow-[#EBF57D]/30 group-hover:scale-110 transition-transform duration-300">
                <Globe size={32} className="text-black" />
              </div>
              
              <h3 className="text-lg font-bold text-gray-900 mb-3">Novos Fornecedores</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-6">
                Expandir a busca para novos fornecedores
              </p>
            </button>

          </div>
        </div>

      </div>
    </div>
  );
};

export default QuoteMethodModal;
