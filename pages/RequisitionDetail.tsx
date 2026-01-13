import React, { useState, useEffect } from 'react';
import QuoteMethodModal from '../components/QuoteMethodModal';
import LocationTargetingModal from '../components/LocationTargetingModal';
import { supabase } from '../lib/supabase';
import { 
  ArrowLeft, 
  FileText, 
  Calendar, 
  User, 
  Building2, 
  AlertCircle, 
  Download, 
  CheckCircle, 
  XCircle, 
  Sparkles,
  Pencil,
  Check,
  X,
  Clock,
  DollarSign,
  Truck
} from 'lucide-react';
import { Requisition, RequisitionItem, KanbanStatus, Proposal } from '../types';
import CategoryInput from '../components/CategoryInput';
import TypeInput from '../components/TypeInput';
import ProposalDetailModal from '../components/ProposalDetailModal';

interface RequisitionDetailProps {
  requisition: Requisition;
  onBack: () => void;
  onUpdateStatus: (status: KanbanStatus) => void;
  onDeny: () => void;
  onFinalize: () => void;
  onUpdateItem: (itemId: string, data: Partial<RequisitionItem>) => Promise<void>;
}

const RequisitionDetail: React.FC<RequisitionDetailProps> = ({ 
  requisition, 
  onBack, 
  onUpdateStatus,
  onDeny,
  onFinalize,
  onUpdateItem
}) => {
  const [editingItemId, setEditingItemId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState<Partial<RequisitionItem>>({});
  const [isSavingItem, setIsSavingItem] = React.useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoadingProposals, setIsLoadingProposals] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);

  useEffect(() => {
    const fetchProposals = async () => {
      if (!requisition.id) return;
      
      setIsLoadingProposals(true);
      try {
        const { data, error } = await supabase
          .from('cotacao')
          .select(`
            *,
            cotacao_itens (*)
          `)
          .eq('requisicao_id', requisition.id)
          .not('recebido_em', 'is', null);

        if (error) throw error;

        if (data) {
          const mappedProposals = data.map((cot: any) => {
            const totalValue = (cot.cotacao_itens || []).reduce((sum: number, item: any) => {
              return sum + (Number(item.preco_total_item) || 0);
            }, 0);

            return {
              id: cot.cotacao_id,
              supplierName: cot.fornecedor_nome,
              value: totalValue,
              deliveryDays: cot.prazo_entrega_geral || 0,
              paymentConditions: cot.condicao_pagamento,
              proposalValidity: cot.validade_proposta,
              items: cot.cotacao_itens,
              attachments: cot.anexos
            };
          });
          setProposals(mappedProposals);
        }
      } catch (err) {
        console.error('Error fetching proposals:', err);
      } finally {
        setIsLoadingProposals(false);
      }
    };

    fetchProposals();
  }, [requisition.id]);

  const handleEditClick = (item: RequisitionItem) => {
    setEditingItemId(item.id);
    setEditForm({
      name: item.name,
      quantity: item.quantity,
      dimensions: item.dimensions,
      category: item.category,
      type: item.type
    });
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditForm({});
  };

  const handleSaveItem = async (itemId: string) => {
    try {
      setIsSavingItem(true);
      await onUpdateItem(itemId, editForm);
      setEditingItemId(null);
      setEditForm({});
    } catch (error) {
      console.error('Failed to save item:', error);
    } finally {
      setIsSavingItem(false);
    }
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Novas Requisições': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Em análise': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'Recebendo Propostas': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Avaliação/Negociações': return 'bg-green-50 text-green-700 border-green-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Alta': return 'text-red-600 bg-red-50 border-red-100';
      case 'Média': return 'text-orange-600 bg-orange-50 border-orange-100';
      case 'Baixa': return 'text-green-600 bg-green-50 border-green-100';
      default: return 'text-gray-600 bg-gray-50 border-gray-100';
    }
  };

  const showProposals = requisition.status === 'Recebendo Propostas' || requisition.status === 'Avaliação/Negociações';
  const showAiQuote = requisition.status === 'Em análise' || requisition.status === 'Novas Requisições';

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100">
      {/* Top Bar / Header */}
      <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
        <div className="flex items-center gap-6">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-gray-50 rounded-full transition-colors text-gray-400 hover:text-gray-700"
          >
            <ArrowLeft size={24} />
          </button>
          
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="font-mono text-sm text-gray-400 font-medium tracking-wide">{requisition.displayId}</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(requisition.status)}`}>
                {requisition.status}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getPriorityColor(requisition.priority)}`}>
                {requisition.priority}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{requisition.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={onDeny}
            className="px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl border border-red-100 transition-colors flex items-center gap-2"
          >
            <XCircle size={18} />
            Negar Requisição
          </button>
          <button 
            onClick={onFinalize}
            className="px-4 py-2 text-sm font-semibold text-white bg-black hover:bg-gray-800 rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-black/10"
          >
            <CheckCircle size={18} />
            Finalizar Requisição
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-6xl mx-auto p-8 space-y-8">
          
          {/* Main Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Requester Info */}
            <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <User size={16} /> Solicitante
              </h3>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 font-bold">
                  {requisition.requester.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{requisition.requester}</p>
                  <p className="text-sm text-gray-500">{requisition.department}</p>
                </div>
              </div>
            </div>

            {/* Date Info */}
            <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Calendar size={16} /> Data da Solicitação
              </h3>
              <p className="font-mono text-lg text-gray-900">{requisition.createdAt}</p>
              <p className="text-sm text-gray-500 mt-1">Criado há {Math.floor((new Date().getTime() - new Date(requisition.createdAt.split('/').reverse().join('-')).getTime()) / (1000 * 3600 * 24))} dias</p>
            </div>

             {/* Attachments */}
             <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <FileText size={16} /> Anexos
              </h3>
              {requisition.attachments && requisition.attachments.length > 0 ? (
                <div className="space-y-2">
                  {requisition.attachments.map((url, index) => (
                    <a 
                      key={index}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-colors text-sm text-gray-600 hover:text-blue-600 group"
                    >
                      <Download size={14} className="group-hover:scale-110 transition-transform" />
                      <span className="truncate">Anexo {index + 1}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">Nenhum anexo disponível</p>
              )}
            </div>
          </div>

          {/* AI Quote Action */}
          {showAiQuote && (
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-8 text-white shadow-xl flex items-center justify-between relative overflow-hidden group">
              <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10"></div>
              <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl group-hover:bg-primary/30 transition-all duration-700"></div>
              
              <div className="relative z-10">
                <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                  <Sparkles className="text-[#EBF57D]" />
                  Cotação Inteligente
                </h3>
                <p className="text-gray-300 max-w-xl">
                  Utilize nossa IA para buscar, negociar e analisar as melhores propostas do mercado automaticamente para esta requisição.
                </p>
              </div>
              
              <button 
                onClick={() => setIsQuoteModalOpen(true)}
                className="relative z-10 bg-[#EBF57D] text-black px-6 py-3 rounded-xl font-bold hover:bg-[#d9e368] transition-all hover:scale-105 shadow-lg shadow-[#EBF57D]/20 flex items-center gap-2"
              >
                <Sparkles size={18} />
                Cotar com a IA
              </button>
            </div>
          )}

          {/* Items Section */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Building2 size={20} className="text-gray-400" />
              Itens da Requisição
            </h3>
            <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Item</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Categoria</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantidade</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Dimensões</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {requisition.items.map((item, idx) => {
                    const isEditing = editingItemId === item.id;
                    return (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        {isEditing ? (
                          <>
                            <td className="p-4">
                              <input
                                type="text"
                                value={editForm.name || ''}
                                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                className="w-full px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                                placeholder="Nome do item"
                              />
                            </td>
                            <td className="p-4">
                              <TypeInput
                                value={editForm.type || ''}
                                onChange={(val) => setEditForm(prev => ({ ...prev, type: val }))}
                                category={editForm.category}
                                className="min-w-[150px]"
                              />
                            </td>
                            <td className="p-4">
                              <CategoryInput
                                value={editForm.category || ''}
                                onChange={(val) => setEditForm(prev => ({ ...prev, category: val }))}
                                className="min-w-[150px]"
                              />
                            </td>
                            <td className="p-4">
                              <input
                                type="number"
                                value={editForm.quantity || 0}
                                onChange={(e) => setEditForm(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                                className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                                min="1"
                              />
                            </td>
                            <td className="p-4">
                              <input
                                type="text"
                                value={editForm.dimensions || ''}
                                onChange={(e) => setEditForm(prev => ({ ...prev, dimensions: e.target.value }))}
                                className="w-full px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                                placeholder="Dimensões"
                              />
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleSaveItem(item.id)}
                                  disabled={isSavingItem}
                                  className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                  title="Salvar"
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  disabled={isSavingItem}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Cancelar"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-4 font-medium text-gray-900">{item.name}</td>
                            <td className="p-4">
                              <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium border border-blue-100">
                                {item.type || 'Material'}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-600">
                                {item.category || 'Sem Categoria'}
                              </span>
                            </td>
                            <td className="p-4 font-mono text-gray-600">{item.quantity}</td>
                            <td className="p-4 text-sm text-gray-500">{item.dimensions || '-'}</td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => handleEditClick(item)}
                                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Editar item"
                              >
                                <Pencil size={16} />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Proposals Section */}
          {showProposals && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <FileText size={20} className="text-gray-400" />
                Propostas Recebidas
                <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full ml-1">
                  {proposals?.length || 0}
                </span>
              </h3>
              
              {isLoadingProposals ? (
                <div className="flex justify-center py-12">
                   <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                </div>
              ) : proposals && proposals.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {proposals.map(proposal => (
                    <div key={proposal.id} className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-blue-300 hover:shadow-md transition-all group">
                      <div className="flex justify-between items-start mb-4">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition-colors">
                          <Building2 size={20} />
                        </div>
                        <span className="text-xs font-semibold bg-green-50 text-green-700 px-2 py-1 rounded-full border border-green-100">
                          Recebida
                        </span>
                      </div>
                      
                      <h4 className="font-bold text-gray-900 mb-4">{proposal.supplierName}</h4>
                      
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500 flex items-center gap-1"><DollarSign size={14}/> Valor Total</span>
                          <span className="font-bold text-gray-900">R$ {proposal.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500 flex items-center gap-1"><Truck size={14}/> Prazo</span>
                          <span className="font-medium text-gray-900">{proposal.deliveryDays} dias úteis</span>
                        </div>
                      </div>

                      <button 
                        onClick={() => setSelectedProposal(proposal)}
                        className="w-full mt-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
                      >
                        Ver detalhes
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <Clock className="mx-auto h-10 w-10 text-gray-300 mb-3" />
                  <h3 className="text-sm font-medium text-gray-900">Aguardando Propostas</h3>
                  <p className="text-sm text-gray-500 mt-1">As propostas aparecerão aqui assim que forem recebidas.</p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
      {/* Quote Method Modal */}
      <QuoteMethodModal 
        isOpen={isQuoteModalOpen}
        onClose={() => setIsQuoteModalOpen(false)}
        requisitionId={requisition.displayId}
        onSelectMethod={(method) => {
          console.log('Selected method:', method);
          if (method === 'new-suppliers') {
            setIsQuoteModalOpen(false);
            setIsLocationModalOpen(true);
          } else {
            onUpdateStatus('Recebendo Propostas');
            setIsQuoteModalOpen(false);
          }
        }}
      />
      
      {/* Location Targeting Modal */}
      <LocationTargetingModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        onSubmit={async (locations) => {
          try {
            setIsSubmitting(true);
            
            // 1. Fetch full Requisition Data
            // We assume requisition.id corresponds to the UUID in the database, 
            // or we need to find it by displayId if id is not the UUID.
            // Assuming requisition.id is the UUID based on types.ts usually holding the primary key.
            // If requisition.id is not the UUID, we might need to query by display_id/titulo.
            // Let's try to fetch by ID first.
            let { data: reqData, error: reqError } = await supabase
              .from('requisicao')
              .select('*')
              .eq('requisicao_id', requisition.id)
              .single();

            if (reqError || !reqData) {
               // Fallback: try finding by title and requester if ID mismatch (e.g. mock data vs real db)
               // This is a safety net for development environments
               console.warn("Could not find requisition by ID, trying loose match...", reqError);
               const { data: looseMatch } = await supabase
                .from('requisicao')
                .select('*')
                .eq('titulo', requisition.title)
                .limit(1)
                .single();
               
               if (looseMatch) reqData = looseMatch;
            }

            // 2. Fetch Requisition Items
            let itemsData: any[] = [];
            if (reqData) {
              const { data: iData } = await supabase
                .from('requisicao_itens')
                .select('*')
                .eq('requisicao_id', reqData.requisicao_id);
              itemsData = iData || [];
            }

            // 3. Fetch Current User
            const { data: { user } } = await supabase.auth.getUser();
            let userData: any = null;
            
            if (user) {
              const { data: uData } = await supabase
                .from('usuarios')
                .select('*')
                .eq('user_id', user.id)
                .single();
              userData = uData;
            }

            // 4. Group Items by Category and Send Webhooks
            const items = itemsData.length > 0 ? itemsData : requisition.items;
            const groupedItems: Record<string, any[]> = {};

            items.forEach((item: any) => {
              // Check for 'item_categoria' (DB) or 'category' (Frontend)
              const category = item.item_categoria || item.category || 'Sem Categoria';
              if (!groupedItems[category]) {
                groupedItems[category] = [];
              }
              groupedItems[category].push(item);
            });

            // 5. Send Webhook for each category
            const categories = Object.keys(groupedItems);
            
            await Promise.all(categories.map(async (category) => {
                const categoryItems = groupedItems[category];
                
                const payload = {
                  requisicao: reqData || requisition,
                  requisicao_itens: categoryItems,
                  categoria_grupo: category,
                  usuario: userData || { id: 'mock-user', email: 'user@example.com' },
                  localizacao_selecionada: locations.map(l => ({ display_name: l.display_name }))
                };

                console.log(`Sending Webhook for category: ${category}`, payload);

                const response = await fetch('/webhook/ec7f263b-107f-463b-a4eb-e8293806ae6a', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(payload)
                });

                if (!response.ok) {
                  const errorText = await response.text();
                  console.error(`Webhook failed for category ${category}:`, errorText);
                  throw new Error(`Webhook failed for ${category}: ${response.status} - ${errorText.substring(0, 200)}`);
                }
            }));

            console.log('All webhooks sent successfully');

            // 6. Update Status and Close
            setIsLocationModalOpen(false);
            onUpdateStatus('Recebendo Propostas');

          } catch (error) {
            console.error('Error submitting location targeting:', error);
            alert('Erro ao processar solicitação. Verifique o console.');
          } finally {
            setIsSubmitting(false);
          }
        }}
      />

      {/* Proposal Detail Modal */}
      <ProposalDetailModal 
        isOpen={!!selectedProposal} 
        onClose={() => setSelectedProposal(null)} 
        proposal={selectedProposal} 
      />
    </div>
  );
};

export default RequisitionDetail;
