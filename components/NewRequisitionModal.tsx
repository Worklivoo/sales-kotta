import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Calendar, User, AlertCircle, FileText, Upload, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { requisitionService } from '../services/requisitionService';
import CategoryInput from './CategoryInput';
import TypeInput from './TypeInput';

interface NewRequisitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Item {
  nome_item: string;
  quantidade: number;
  unidade_medida: string;
  item_categoria: string;
  item_tipo: string;
  observacoes: string;
  descricao_item: string;
  dimensao: string;
  dimensionValues?: Record<string, string>;
}

// Configuration for dynamic fields based on Item Type
const ITEM_TYPE_CONFIG: Record<string, { dimensions: string[], units: string[] }> = {
  'Chapas e Placas': {
    dimensions: ['Espessura', 'Largura', 'Comprimento'],
    units: ['kg', 'Unidade']
  },
  'Barras': {
    dimensions: ['Diâmetro', 'Comprimento'],
    units: ['Metro', 'kg']
  },
  'Tubos': {
    dimensions: ['Diâmetro Externo', 'Espessura da Parede', 'Comprimento'],
    units: ['Metro', 'kg']
  },
  'Perfis e Vigas': {
    dimensions: ['Altura da Aba', 'Largura da Base', 'Espessura', 'Comprimento'],
    units: ['Metro', 'kg']
  },
  'Bobinas e Tiras': {
    dimensions: ['Espessura', 'Largura'],
    units: ['kg']
  },
  'Arames e Fios': {
    dimensions: ['Diâmetro'],
    units: ['kg', 'Unidade']
  },
  'Lingotes e Tarugos': {
    dimensions: ['Diâmetro', 'Comprimento'],
    units: ['kg', 'Unidade']
  },
  'Telas e Grades': {
    dimensions: ['Malha (Abertura)', 'Diâmetro do Fio', 'Largura', 'Comprimento'],
    units: ['m²', 'Unidade']
  }
};

const NewRequisitionModal: React.FC<NewRequisitionModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<{name: string, email: string} | null>(null);
  
  // Form State
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [urgencia, setUrgencia] = useState<'ALTA' | 'MEDIA' | 'BAIXA'>('BAIXA');
  const [prazo, setPrazo] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<Item[]>([
    { nome_item: '', quantidade: 1, unidade_medida: 'UN', item_categoria: '', item_tipo: '', observacoes: '', descricao_item: '', dimensao: '' }
  ]);

  useEffect(() => {
    if (isOpen) {
      fetchCurrentUser();
    }
  }, [isOpen]);

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Try to get name from metadata or use email
      const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário';
      setCurrentUser({
        name: name,
        email: user.email || ''
      });
    }
  };

  const handleAddItem = () => {
    setItems([...items, { nome_item: '', quantidade: 1, unidade_medida: 'UN', item_categoria: '', item_tipo: '', observacoes: '', descricao_item: '', dimensao: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const handleItemChange = (index: number, field: keyof Item, value: any) => {
    const newItems = [...items];
    const newItem = { ...newItems[index], [field]: value };
    
    // If category changed, reset type to force re-selection
    if (field === 'item_categoria') {
      newItem.item_tipo = '';
      newItem.dimensionValues = {};
      newItem.unidade_medida = 'UN';
    }

    // If type changed, reset dimensions and set default unit
    if (field === 'item_tipo') {
      newItem.dimensionValues = {};
      newItem.dimensao = '';
      const config = ITEM_TYPE_CONFIG[value as string];
      if (config && config.units.length > 0) {
        newItem.unidade_medida = config.units[0];
      } else {
        newItem.unidade_medida = 'UN';
      }
    }
    
    newItems[index] = newItem;
    setItems(newItems);
  };

  const handleDimensionChange = (index: number, dimension: string, value: string) => {
    const newItems = [...items];
    const newItem = { ...newItems[index] };
    
    newItem.dimensionValues = {
      ...newItem.dimensionValues,
      [dimension]: value
    };
    
    newItems[index] = newItem;
    setItems(newItems);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (): Promise<string[]> => {
    if (files.length === 0) return [];
    
    const urls: string[] = [];
    
    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${fileName}`;

      try {
        const { error: uploadError } = await supabase.storage
          .from('documents') // Assuming 'documents' bucket exists
          .upload(filePath, file);

        if (uploadError) {
          console.error('Error uploading file:', uploadError);
          continue; // Skip failed uploads or handle differently
        }

        const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
        if (data) {
          urls.push(data.publicUrl);
        }
      } catch (err) {
        console.error('Exception uploading file:', err);
      }
    }
    
    return urls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo || !prazo || items.length === 0) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    try {
      setLoading(true);
      
      // Upload files first
      const attachmentUrls = await uploadFiles();

      await requisitionService.create({
        titulo,
        descricao,
        // membro_id is optional now, service handles it
        urgencia,
        prazo_entrega_desejado: prazo,
        observacoes,
        anexos: attachmentUrls,
        items: items.map(item => {
          let finalDimensao = item.dimensao;
          if (item.dimensionValues && Object.keys(item.dimensionValues).length > 0) {
            const config = ITEM_TYPE_CONFIG[item.item_tipo];
            if (config) {
              finalDimensao = config.dimensions
                .map(d => {
                  const val = item.dimensionValues?.[d];
                  return val ? `${d}: ${val}` : null;
                })
                .filter(Boolean)
                .join(', ');
            }
          }
          
          return {
            nome_item: item.nome_item,
            quantidade: item.quantidade,
            unidade_medida: item.unidade_medida,
            item_categoria: item.item_categoria,
            item_tipo: item.item_tipo,
            observacoes: item.observacoes,
            descricao_item: item.descricao_item,
            dimensao: finalDimensao
          };
        })
      });
      
      onSuccess();
      onClose();
      // Reset form
      setTitulo('');
      setDescricao('');
      setUrgencia('BAIXA');
      setPrazo('');
      setObservacoes('');
      setFiles([]);
      setItems([{ nome_item: '', quantidade: 1, unidade_medida: 'UN', item_categoria: '', item_tipo: '', observacoes: '', descricao_item: '', dimensao: '' }]);
    } catch (error) {
      console.error('Error creating requisition:', error);
      alert('Erro ao criar requisição. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl relative overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Nova Requisição</h2>
            <p className="text-gray-500 text-sm mt-1">Preencha os detalhes da solicitação de compra</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
          >
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <form id="requisition-form" onSubmit={handleSubmit} className="space-y-8">
            
            {/* General Info Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Título da Requisição <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Material de Escritório - Q1"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  required
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea 
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Descreva detalhadamente o motivo da requisição..."
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all resize-none h-24"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Solicitante</label>
                <div className="relative">
                  <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    value={currentUser ? `${currentUser.name} (${currentUser.email})` : 'Carregando...'}
                    disabled
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Identificado automaticamente pelo login</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Urgência</label>
                  <div className="relative">
                    <AlertCircle size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <select 
                      value={urgencia}
                      onChange={(e) => setUrgencia(e.target.value as any)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none bg-white"
                    >
                      <option value="BAIXA">Baixa</option>
                      <option value="MEDIA">Média</option>
                      <option value="ALTA">Alta</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prazo Desejado</label>
                  <div className="relative">
                    <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="date"
                      value={prazo}
                      onChange={(e) => setPrazo(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Attachments Section */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Anexos e Documentos</label>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-primary hover:bg-primary/5 transition-all cursor-pointer relative group">
                  <input 
                    type="file" 
                    multiple 
                    onChange={handleFileChange} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="bg-gray-100 p-3 rounded-full mb-3 group-hover:scale-110 transition-transform">
                    <Upload className="w-6 h-6 text-gray-500 group-hover:text-primary" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">Clique para fazer upload ou arraste arquivos</p>
                  <p className="text-xs text-gray-500 mt-1">PDF, DOCX, Imagens (max. 10MB)</p>
                </div>
                
                {files.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {files.map((file, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-50 border border-gray-100 p-3 rounded-xl">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="bg-white p-2 rounded-lg border border-gray-200">
                            <FileText size={16} className="text-primary" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium text-gray-700 truncate">{file.name}</span>
                            <span className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                          </div>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => removeFile(i)}
                          className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Items Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Itens da Requisição</h3>
                <button 
                  type="button"
                  onClick={handleAddItem}
                  className="text-sm font-medium text-black hover:text-gray-700 flex items-center gap-1"
                >
                  <Plus size={16} />
                  Adicionar Item
                </button>
              </div>
              
              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-xl border border-gray-100 relative group">
                    {items.length > 1 && (
                      <button 
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                    
                    <div className="flex flex-wrap gap-4">
                      {/* Linha 1 */}
                      <div className="w-full flex gap-4">
                        <div className="w-[50%]">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Categoria <span className="text-red-500">*</span></label>
                          <CategoryInput
                            value={item.item_categoria}
                            onChange={(val) => handleItemChange(index, 'item_categoria', val)}
                            className="w-full"
                          />
                        </div>
                        <div className="w-[50%]">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Tipo <span className="text-red-500">*</span></label>
                          <TypeInput
                            value={item.item_tipo}
                            onChange={(value) => handleItemChange(index, 'item_tipo', value)}
                            category={item.item_categoria}
                            disabled={!item.item_categoria}
                            className="w-full"
                          />
                        </div>
                      </div>

                      {/* Linha 2 */}
                      <div className="w-full flex gap-4">
                        <div className="w-[60%]">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Nome do Item <span className="text-red-500">*</span></label>
                          <input 
                            type="text"
                            value={item.nome_item}
                            onChange={(e) => handleItemChange(index, 'nome_item', e.target.value)}
                            placeholder="Ex: Cadeira Ergonômica"
                            disabled={!item.item_tipo}
                            className={`w-full px-3 py-2 rounded-lg border border-gray-200 outline-none text-sm transition-all ${!item.item_tipo ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'focus:border-primary'}`}
                            required
                          />
                        </div>
                        <div className="w-[20%]">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Qtd <span className="text-red-500">*</span></label>
                          <input 
                            type="number"
                            min="1"
                            value={item.quantidade}
                            onChange={(e) => handleItemChange(index, 'quantidade', Number(e.target.value))}
                            disabled={!item.item_tipo}
                            className={`w-full px-3 py-2 rounded-lg border border-gray-200 outline-none text-sm transition-all ${!item.item_tipo ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'focus:border-primary'}`}
                            required
                          />
                        </div>
                        <div className="w-[20%]">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Unid. <span className="text-red-500">*</span></label>
                          {ITEM_TYPE_CONFIG[item.item_tipo]?.units ? (
                            <select
                              value={item.unidade_medida}
                              onChange={(e) => handleItemChange(index, 'unidade_medida', e.target.value)}
                              disabled={!item.item_tipo}
                              className={`w-full px-3 py-2 rounded-lg border border-gray-200 outline-none text-sm transition-all bg-white ${!item.item_tipo ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'focus:border-primary'}`}
                            >
                              {ITEM_TYPE_CONFIG[item.item_tipo].units.map(u => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          ) : (
                            <input 
                              type="text"
                              value={item.unidade_medida}
                              onChange={(e) => handleItemChange(index, 'unidade_medida', e.target.value)}
                              placeholder="UN"
                              disabled={!item.item_tipo}
                              className={`w-full px-3 py-2 rounded-lg border border-gray-200 outline-none text-sm transition-all ${!item.item_tipo ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'focus:border-primary'}`}
                              required
                            />
                          )}
                        </div>
                      </div>

                      {/* Linha 3: Dimensões */}
                      {ITEM_TYPE_CONFIG[item.item_tipo] ? (
                        <div className="w-full">
                           <label className="block text-xs font-medium text-gray-500 mb-1">Dimensões Necessárias</label>
                           <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                             {ITEM_TYPE_CONFIG[item.item_tipo].dimensions.map((dim) => (
                               <div key={dim}>
                                 <input
                                   type="text"
                                   placeholder={dim}
                                   value={item.dimensionValues?.[dim] || ''}
                                   onChange={(e) => handleDimensionChange(index, dim, e.target.value)}
                                   className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none text-sm focus:border-primary"
                                 />
                               </div>
                             ))}
                           </div>
                        </div>
                      ) : (
                        <div className="w-full">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Dimensão</label>
                          <input 
                            type="text"
                            value={item.dimensao}
                            onChange={(e) => handleItemChange(index, 'dimensao', e.target.value)}
                            placeholder="Ex: 10x20cm"
                            disabled={!item.item_tipo}
                            className={`w-full px-3 py-2 rounded-lg border border-gray-200 outline-none text-sm transition-all ${!item.item_tipo ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'focus:border-primary'}`}
                          />
                        </div>
                      )}

                      {/* Linha 3 */}
                      <div className="w-full">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Descrição Detalhada</label>
                        <input 
                          type="text"
                          value={item.descricao_item}
                          onChange={(e) => handleItemChange(index, 'descricao_item', e.target.value)}
                          placeholder="Detalhes técnicos, cor, material..."
                          disabled={!item.item_tipo}
                          className={`w-full px-3 py-2 rounded-lg border border-gray-200 outline-none text-sm transition-all ${!item.item_tipo ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'focus:border-primary'}`}
                        />
                      </div>

                      {/* Linha 4 */}
                      <div className="w-full">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Observações</label>
                        <input 
                          type="text"
                          value={item.observacoes}
                          onChange={(e) => handleItemChange(index, 'observacoes', e.target.value)}
                          placeholder="Obs. adicionais..."
                          disabled={!item.item_tipo}
                          className={`w-full px-3 py-2 rounded-lg border border-gray-200 outline-none text-sm transition-all ${!item.item_tipo ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'focus:border-primary'}`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* General Observations */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações Gerais</label>
              <textarea 
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all resize-none"
                placeholder="Alguma observação adicional sobre esta requisição?"
              />
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
          <button 
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button 
            type="submit"
            form="requisition-form"
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-black text-white font-medium hover:bg-gray-800 transition-colors shadow-lg shadow-black/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? 'Salvando...' : 'Criar Requisição'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default NewRequisitionModal;
