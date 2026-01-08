import React, { useState } from 'react';
import { Plus, X, Search, Globe, Database, Zap, Sparkles, Box, DollarSign, Ruler, FileText, CheckCircle } from 'lucide-react';
import { mockRequisitions, mockSuppliers } from '../services/mockData';
import { KanbanStatus, Requisition } from '../types';
import RequisitionCard from '../components/RequisitionCard';

const columns: KanbanStatus[] = [
  'Novas Requisições',
  'Em análise',
  'Recebendo Propostas',
  'Avaliação/Negociações'
];

const RequisitionsPage: React.FC = () => {
  const [requisitions, setRequisitions] = useState<Requisition[]>(mockRequisitions);
  const [isNewReqModalOpen, setIsNewReqModalOpen] = useState(false);
  const [selectedRequisition, setSelectedRequisition] = useState<Requisition | null>(null);

  // Calculate dynamic counts
  const suppliersCount = mockSuppliers.length;
  const itemsCount = mockSuppliers.reduce((total, supplier) => total + (supplier.items?.length || 0), 0);
  
  // Generate next requisition ID
  const nextRequisitionId = `#${Math.max(...mockRequisitions.map(r => parseInt(r.displayId.replace('#', '')))) + 1}`;

  const handleCreateClick = () => setIsNewReqModalOpen(true);
  const handleCloseModal = () => setIsNewReqModalOpen(false);
  const handleCardClick = (req: Requisition) => setSelectedRequisition(req);
  const handleCloseSlideOver = () => setSelectedRequisition(null);

  const handleSendToEvaluation = () => {
    if (!selectedRequisition) return;
    
    const updatedRequisitions = requisitions.map(req => 
      req.id === selectedRequisition.id 
        ? { ...req, status: 'Avaliação/Negociações' as KanbanStatus } 
        : req
    );
    
    setRequisitions(updatedRequisitions);
    setSelectedRequisition({ ...selectedRequisition, status: 'Avaliação/Negociações' });
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetStatus: KanbanStatus) => {
    e.preventDefault();
    const requisitionId = e.dataTransfer.getData('requisitionId');
    
    if (requisitionId) {
      const updatedRequisitions = requisitions.map(req => {
        if (req.id === requisitionId) {
          return { ...req, status: targetStatus };
        }
        return req;
      });
      setRequisitions(updatedRequisitions);
    }
  };

  const columnTheme = {
    dot: 'bg-gray-400',
    card: 'border-gray-200/80 bg-gradient-to-b from-gray-50/70 to-white',
    count: 'text-gray-600 border-gray-200/80 bg-white/80'
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Requisições</h1>
            <p className="text-gray-500 text-sm mt-1">Gerencie seu fluxo de cotação</p>
        </div>
        <button 
          onClick={handleCreateClick}
          className="bg-black text-white px-5 py-3 rounded-xl font-medium flex items-center gap-2 hover:bg-gray-800 transition-colors shadow-lg shadow-black/10 active:scale-95 transform duration-150 shrink-0 border-r-4 border-transparent"
        >
          <Plus size={20} />
          NOVA REQUISIÇÃO
        </button>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto pb-4 w-full min-w-0">
        <div className="flex gap-4 sm:gap-6 h-full w-full">
          {columns.map((column) => {
            const theme = columnTheme;
            return (
              <div
                key={column}
                className={`flex-1 flex flex-col min-w-[220px] rounded-3xl border shadow-sm ring-1 ring-black/5 p-3 sm:p-4 ${theme.card}`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column)}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wider flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${theme.dot}`} />
                    {column}
                  </h2>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-md shadow-sm border ${theme.count}`}>
                    {requisitions.filter(r => r.status === column).length}
                  </span>
                </div>

                <div className="flex-1 bg-white/70 rounded-2xl p-3 border border-gray-100/70 space-y-3 overflow-y-auto max-h-[calc(100vh-220px)] custom-scrollbar">
                  {requisitions
                    .filter(r => r.status === column)
                    .map(req => (
                      <RequisitionCard key={req.id} requisition={req} onClick={handleCardClick} />
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create Modal */}
      {isNewReqModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={handleCloseModal} />
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl relative overflow-hidden animate-in fade-in zoom-in duration-300">
            <button 
                onClick={handleCloseModal}
                className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
                <X size={24} />
            </button>
            
            <div className="p-10 text-center">
                <span className="inline-block px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-mono mb-4">
                    Nova Requisição {nextRequisitionId}
                </span>
                <h2 className="text-3xl font-bold mb-3">Como deseja iniciar esta cotação?</h2>
                <p className="text-gray-500 mb-10 max-w-lg mx-auto">Selecione o método dessa cotação.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Option 1 - Base de Custo IA */}
                    <button className="flex flex-col items-center p-8 rounded-2xl border-2 border-primary/50 bg-gradient-to-b from-primary/10 to-transparent hover:shadow-xl hover:shadow-primary/20 transition-all group text-center relative overflow-hidden ring-1 ring-primary">
                        <div className="absolute top-4 right-4 bg-black text-primary text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                            <Sparkles size={10} /> IA
                        </div>
                        <div className="w-16 h-16 rounded-2xl bg-primary text-black flex items-center justify-center mb-6 group-hover:rotate-12 transition-transform duration-300 shadow-md">
                            <Zap size={32} fill="currentColor" />
                        </div>
                        <h3 className="font-bold text-lg mb-2 text-gray-900">Base de Custo IA</h3>
                        <p className="text-sm text-gray-600 text-center leading-relaxed mb-4">Utilizar a IA para trazer itens já cadastrados</p>
                        <span className="text-xs font-semibold bg-black/10 text-gray-900 px-3 py-1 rounded-full">{itemsCount} Itens Encontrados</span>
                    </button>

                    {/* Option 2 - Fornecedores Cadastrados */}
                    <button className="flex flex-col items-center p-8 rounded-2xl border-2 border-gray-100 hover:border-primary hover:bg-primary/5 transition-all group text-center relative overflow-hidden">
                        <div className="absolute top-4 right-4 bg-black text-primary text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                            <Sparkles size={10} /> IA
                        </div>
                        <div className="w-16 h-16 rounded-2xl bg-gray-50 text-black flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                            <Database size={32} />
                        </div>
                        <h3 className="font-bold text-lg mb-2 text-gray-900">Fornecedores Cadastrados</h3>
                        <p className="text-sm text-gray-500 text-center leading-relaxed mb-4">Solicitar nova cotação para fornecedores homologados no sistema</p>
                        <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-3 py-1 rounded-full">{suppliersCount} Fornecedores Encontrados</span>
                        <div className="absolute bottom-0 left-0 w-full h-1 bg-primary scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
                    </button>

                    {/* Option 3 - Novos Fornecedores */}
                    <button className="flex flex-col items-center p-8 rounded-2xl border-2 border-gray-100 hover:border-blue-400 hover:bg-blue-50 transition-all group text-center relative overflow-hidden">
                        <div className="absolute top-4 right-4 bg-black text-primary text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                            <Sparkles size={10} /> IA
                        </div>
                        <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                            <Globe size={32} />
                        </div>
                        <h3 className="font-bold text-lg mb-2 text-gray-900">Novos Fornecedores</h3>
                        <p className="text-sm text-gray-500 text-center leading-relaxed">Expandir a busca para novos fornecedores</p>
                        <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
                    </button>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Slide Over */}
      <div 
        className={`fixed inset-y-0 right-0 w-full sm:w-[600px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-40 flex flex-col ${
            selectedRequisition ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedRequisition && (
            <>
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <span className="font-mono text-gray-400 text-sm">{selectedRequisition.displayId}</span>
                            <span className="bg-white border border-gray-200 text-xs font-semibold px-2 py-0.5 rounded-full">
                                {selectedRequisition.status}
                            </span>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">{selectedRequisition.title}</h2>
                    </div>
                    <button onClick={handleCloseSlideOver} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X size={24} className="text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="p-4 bg-gray-50 rounded-xl">
                            <span className="text-xs text-gray-400 font-medium uppercase">Solicitante</span>
                            <p className="font-medium mt-1">{selectedRequisition.requester}</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl">
                            <span className="text-xs text-gray-400 font-medium uppercase">Departamento</span>
                            <p className="font-medium mt-1">{selectedRequisition.department}</p>
                        </div>
                    </div>

                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Box size={20} /> Itens e Custos
                    </h3>

                    <div className="space-y-4">
                        {selectedRequisition.items.map(item => (
                            <div key={item.id} className="border border-gray-100 rounded-xl p-4 hover:border-primary/50 transition-colors">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <span className="text-xs font-semibold text-primary bg-black/80 px-2 py-0.5 rounded mb-2 inline-block">
                                            {item.type}
                                        </span>
                                        <h4 className="font-bold text-gray-900">{item.name}</h4>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-xs text-gray-400">Quantidade</span>
                                        <span className="font-bold text-lg">{item.quantity}</span>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-4">
                                    <div className="flex items-center gap-2">
                                        <Ruler size={16} className="text-gray-400" />
                                        <span>{item.dimensions}</span>
                                    </div>
                                    <div className="flex items-center gap-2 justify-end">
                                        <DollarSign size={16} className="text-gray-400" />
                                        <span>R$ {item.cost.toFixed(2)} / un</span>
                                    </div>
                                </div>

                                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Sparkles size={16} className="text-indigo-600" />
                                        <span className="text-xs font-semibold text-indigo-900">Última atualização da IA</span>
                                    </div>
                                    <span className="text-xs text-indigo-700 font-medium">{item.lastAiUpdate}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {selectedRequisition.status === 'Recebendo Propostas' && selectedRequisition.proposals && (
                        <div className="mt-8">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                                <FileText size={20} /> Propostas Recebidas
                            </h3>
                            <div className="space-y-3">
                                {selectedRequisition.proposals.map(proposal => (
                                    <div key={proposal.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors shadow-sm">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-gray-900">{proposal.supplierName}</h4>
                                            <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2 py-1 rounded-full border border-blue-100">
                                                Recebida
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mt-3">
                                            <div>
                                                <span className="text-xs text-gray-500 block">Valor Total</span>
                                                <span className="font-bold text-lg text-gray-900">
                                                    R$ {proposal.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-xs text-gray-500 block">Prazo de Entrega</span>
                                                <span className="font-medium text-gray-900">{proposal.deliveryDays} dias úteis</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="p-6 border-t border-gray-100 bg-gray-50/50">
                    {(selectedRequisition.status === 'Novas Requisições' || selectedRequisition.status === 'Em análise') && (
                        <button className="w-full bg-black text-primary font-bold py-4 rounded-xl hover:bg-gray-900 transition-colors flex justify-center items-center gap-2">
                            Aprovar Cotação
                        </button>
                    )}
                    
                    {selectedRequisition.status === 'Recebendo Propostas' && (
                        <button 
                            onClick={handleSendToEvaluation}
                            className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors flex justify-center items-center gap-2 shadow-lg shadow-blue-600/20"
                        >
                            <CheckCircle size={20} />
                            Enviar para Avaliação das Propostas
                        </button>
                    )}
                </div>
            </>
        )}
      </div>
    </div>
  );
};

export default RequisitionsPage;
