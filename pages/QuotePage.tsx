import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Upload, FileText, X, CheckCircle, AlertCircle } from 'lucide-react';

interface QuotePageProps {
  quoteId: string;
}

const QuotePage: React.FC<QuotePageProps> = ({ quoteId }) => {
  const [supplierName, setSupplierName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    document.title = "Portal do Fornecedor | Envio de Proposta";
    return () => {
      document.title = "IA De Cotação";
    };
  }, []);

  useEffect(() => {
    const fetchQuote = async () => {
      try {
        const { data, error } = await supabase
          .from('cotacao')
          .select('fornecedor_nome, recebido_em')
          .eq('cotacao_id', quoteId)
          .single();

        if (error) {
          throw error;
        }
        
        if (data.recebido_em) {
          setAlreadySubmitted(true);
        }

        setSupplierName(data.fornecedor_nome);
      } catch (err: any) {
        console.error('Error fetching quote:', err);
        const errorMessage = err.message || 'Erro desconhecido';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    if (quoteId) {
      fetchQuote();
    }
  }, [quoteId]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      setFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    
    setIsUploading(true);
    try {
      const uploadedUrls: string[] = [];

      // 1. Upload files to Storage
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${quoteId}/${Math.random().toString(36).substring(2)}.${fileExt}`;
        
        // Ensure bucket exists or use a general one like 'attachments'
        const { error: uploadError, data } = await supabase.storage
          .from('cotacoes') // Assuming a bucket named 'cotacoes' exists
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        if (data) {
           const { data: { publicUrl } } = supabase.storage
            .from('cotacoes')
            .getPublicUrl(fileName);
           uploadedUrls.push(publicUrl);
        }
      }

      // 2. Update cotacao record with file URLs
      // Fetch existing attachments first to append
      const { data: currentData } = await supabase
        .from('cotacao')
        .select('anexos')
        .eq('cotacao_id', quoteId)
        .single();

      const currentAttachments = (currentData?.anexos as string[]) || [];
      const newAttachments = [...currentAttachments, ...uploadedUrls];

      const { error: updateError } = await supabase
        .from('cotacao')
        .update({ 
            anexos: newAttachments,
            recebido_em: new Date().toISOString() // Mark as received
        })
        .eq('cotacao_id', quoteId);

      if (updateError) throw updateError;

      // 3. Trigger Webhook
      try {
        await fetch('/webhook/bf6c83ac-ee60-4bb2-be9d-10a037d439e7', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cotacao_id: quoteId,
            fornecedor_nome: supplierName,
            arquivos: newAttachments,
            data_envio: new Date().toISOString()
          }),
        });
      } catch (webhookError) {
        console.error('Webhook trigger failed:', webhookError);
        // We don't block success UI if webhook fails, but we log it
      }

      setUploadSuccess(true);
      setFiles([]);
    } catch (err: any) {
      console.error('Error uploading:', err);
      alert('Erro ao enviar arquivos: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setIsUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-[#EBF57D]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="text-red-500" size={24} />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Cotação não encontrada</h2>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (uploadSuccess || alreadySubmitted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white p-12 rounded-2xl shadow-sm border border-gray-100 text-center">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="text-green-500" size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {uploadSuccess ? 'Proposta Recebida!' : 'Proposta já enviada'}
          </h2>
          <p className="text-gray-500 mb-8">
            {uploadSuccess 
              ? 'Agradecemos o envio da sua proposta. Confirmamos o recebimento dos documentos e nossa equipe iniciará a análise em breve.'
              : 'Os documentos desta cotação já foram recebidos anteriormente. Se precisar enviar novos anexos, entre em contato diretamente com o comprador.'
            }
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-50 p-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#EBF57D]/20 text-black mb-4">
             <FileText size={24} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Envio de Proposta</h1>
          <p className="text-gray-500">
            Olá, anexe sua proposta e documentos técnicos abaixo.
          </p>
        </div>
        
        <div className="p-8">
          {/* File Upload Area */}
          <div 
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ease-in-out ${
              dragActive 
                ? 'border-[#EBF57D] bg-[#EBF57D]/5' 
                : 'border-gray-200 hover:border-[#EBF57D] hover:bg-gray-50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              multiple
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleChange}
            />
            
            <div className="flex flex-col items-center gap-3 pointer-events-none">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <Upload className="text-gray-400" size={20} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Clique para selecionar ou arraste arquivos</p>
                <p className="text-xs text-gray-400 mt-1">PDF, Excel, Imagens (Max 10MB)</p>
              </div>
            </div>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Arquivos Selecionados ({files.length})
              </h3>
              <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 group">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center border border-gray-100 shrink-0">
                        <FileText size={14} className="text-gray-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                        <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => removeFile(index)}
                      className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-md transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-8 pt-6 border-t border-gray-50">
            <button
              onClick={handleSubmit}
              disabled={files.length === 0 || isUploading}
              className={`w-full py-4 px-6 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2
                ${files.length > 0 
                  ? 'bg-black text-[#EBF57D] hover:shadow-lg hover:-translate-y-0.5' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              {isUploading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Enviando...
                </>
              ) : (
                'Enviar Proposta'
              )}
            </button>
            <p className="text-center text-xs text-gray-400 mt-4">
              © {new Date().getFullYear()} <a href="https://www.worklivoo.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 transition-colors">Worklivoo</a>. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuotePage;
