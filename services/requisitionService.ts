import { supabase } from '../lib/supabase';
import { Requisition, RequisitionItem, KanbanStatus, Proposal } from '../types';
import { Database } from '../lib/database.types';

type RequisicaoRow = Database['public']['Tables']['requisicao']['Row'];
type RequisicaoItemRow = Database['public']['Tables']['requisicao_itens']['Row'];
type MembroRow = Database['public']['Tables']['membros']['Row'];
type CotacaoRow = Database['public']['Tables']['cotacao']['Row'];

// Helper to map database status to frontend Kanban status
const mapStatus = (dbStatus: string): KanbanStatus => {
  switch (dbStatus) {
    case 'NOVA_REQUISICAO': return 'Novas Requisições';
    case 'EM_ANALISE': return 'Em análise';
    case 'RECEBENDO_PROPOSTAS': return 'Recebendo Propostas';
    case 'AVALIACAO': return 'Avaliação/Negociações';
    case 'CONCLUIDA': return 'Avaliação/Negociações'; // Map finished to last column for now or handle differently
    default: return 'Novas Requisições';
  }
};

const mapStatusToDb = (status: KanbanStatus): string => {
  switch (status) {
    case 'Novas Requisições': return 'NOVA_REQUISICAO';
    case 'Em análise': return 'EM_ANALISE';
    case 'Recebendo Propostas': return 'RECEBENDO_PROPOSTAS';
    case 'Avaliação/Negociações': return 'AVALIACAO';
    default: return 'NOVA_REQUISICAO';
  }
};

const mapPriority = (dbPriority: string): 'Baixa' | 'Média' | 'Alta' => {
  switch (dbPriority) {
    case 'ALTA': return 'Alta';
    case 'MEDIA': return 'Média';
    case 'BAIXA': return 'Baixa';
    default: return 'Baixa';
  }
};

const mapStatusCategory = (dbStatus: string): 'Aberto' | 'Finalizado' | 'Negado' => {
  switch (dbStatus) {
    case 'NOVA_REQUISICAO':
    case 'EM_ANALISE':
    case 'RECEBENDO_PROPOSTAS':
    case 'AVALIACAO':
      return 'Aberto';
    case 'CONCLUIDA':
    case 'APROVADA':
      return 'Finalizado';
    case 'CANCELADA':
    case 'NEGADA':
    case 'REPROVADA':
      return 'Negado';
    default:
      return 'Aberto';
  }
};

export const requisitionService = {
  async getAll(): Promise<Requisition[]> {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.error('User not authenticated');
        return [];
      }

      // Fetch requisitions with their items, member info, and quotations (proposals)
      const { data, error } = await supabase
        .from('requisicao')
        .select(`
          *,
          requisicao_itens (*),
          membros:membro_id (*),
          cotacao (
            *,
            cotacao_itens (*)
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching requisitions:', error);
        throw error;
      }

      if (!data) return [];

      // Map database fields to frontend types
      return data.map((req: any) => {
        const items = (req.requisicao_itens || []).map((item: RequisicaoItemRow) => ({
          id: item.requisicao_item_id,
          type: item.item_tipo || 'Material', // Default type
          name: item.nome_item,
          category: item.item_categoria || '',
          dimensions: item.dimensao || '',
          cost: 0, // Cost is usually in quotation, not requisition item directly unless estimated
          quantity: Number(item.quantidade),
          lastAiUpdate: ''
        }));

        const proposals = (req.cotacao || []).map((cot: any) => {
          // Calculate total value from cotacao_itens
          const totalValue = (cot.cotacao_itens || []).reduce((sum: number, item: any) => {
            return sum + (Number(item.preco_total_item) || 0);
          }, 0);

          return {
            id: cot.cotacao_id,
            supplierName: cot.fornecedor_nome,
            value: totalValue,
            deliveryDays: cot.prazo_entrega_geral || 0
          };
        });

        return {
          id: req.requisicao_id,
          displayId: `#${req.requisicao_id.substring(0, 4).toUpperCase()}`,
          title: req.titulo,
          requester: req.membros?.membro_nome || (req.metadata as any)?.created_by_name || 'N/A',
          department: req.membros?.membro_departamento || 'N/A',
          priority: mapPriority(req.urgencia),
          status: mapStatus(req.status),
          statusCategory: mapStatusCategory(req.status),
          createdAt: new Date(req.created_at).toLocaleDateString('pt-BR'),
          items: items,
          attachments: Array.isArray(req.anexos) ? req.anexos.map((a: any) => String(a)) : [],
          proposals: proposals
        };
      });
    } catch (error) {
      console.error('Error in requisitionService.getAll:', error);
      return [];
    }
  },

  async getStats() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { suppliersCount: 0, itemsCount: 0 };

      const { count: suppliersCount, error: suppliersError } = await supabase
        .from('fornecedores')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      const { count: itemsCount, error: itemsError } = await supabase
        .from('itens')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (suppliersError) console.error('Error fetching suppliers count:', suppliersError);
      if (itemsError) console.error('Error fetching items count:', itemsError);

      return {
        suppliersCount: suppliersCount || 0,
        itemsCount: itemsCount || 0
      };
    } catch (error) {
      console.error('Error in requisitionService.getStats:', error);
      return { suppliersCount: 0, itemsCount: 0 };
    }
  },

  async updateStatus(id: string, status: KanbanStatus): Promise<void> {
    try {
      const dbStatus = mapStatusToDb(status);
      const { error } = await supabase
        .from('requisicao')
        .update({ status: dbStatus })
        .eq('requisicao_id', id);

      if (error) {
        console.error('Error updating requisition status:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in requisitionService.updateStatus:', error);
      throw error;
    }
  },

  async deny(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('requisicao')
        .update({ status: 'NEGADA' })
        .eq('requisicao_id', id);

      if (error) {
        console.error('Error denying requisition:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in requisitionService.deny:', error);
      throw error;
    }
  },

  async finalize(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('requisicao')
        .update({ status: 'CONCLUIDA' })
        .eq('requisicao_id', id);

      if (error) {
        console.error('Error finalizing requisition:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in requisitionService.finalize:', error);
      throw error;
    }
  },

  async updateItem(itemId: string, data: Partial<RequisitionItem>): Promise<void> {
    try {
      const updateData: any = {};
      if (data.name) updateData.nome_item = data.name;
      if (data.quantity) updateData.quantidade = data.quantity;
      if (data.dimensions) updateData.dimensao = data.dimensions;
      if (data.category) updateData.item_categoria = data.category;
      if (data.type) updateData.item_tipo = data.type;

      const { error } = await supabase
        .from('requisicao_itens')
        .update(updateData)
        .eq('requisicao_item_id', itemId);

      if (error) {
        console.error('Error updating item:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in requisitionService.updateItem:', error);
      throw error;
    }
  },

  async create(data: {
    titulo: string;
    descricao?: string;
    membro_id?: string;
    urgencia: 'ALTA' | 'MEDIA' | 'BAIXA';
    prazo_entrega_desejado: string;
    observacoes?: string;
    anexos?: string[];
    items: {
      nome_item: string;
      quantidade: number;
      unidade_medida: string;
      item_categoria?: string;
      item_tipo?: string;
      observacoes?: string;
      descricao_item?: string;
      dimensao?: string;
    }[];
  }): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Resolve membro_id if not provided
      let membroId = data.membro_id;
      if (!membroId && user.email) {
        const { data: memberData, error: memberError } = await supabase
          .from('membros')
          .select('membro_id')
          .eq('user_id', user.id)
          .eq('membro_email', user.email)
          .maybeSingle();
        
        if (!memberError && memberData) {
          membroId = memberData.membro_id;
        }
      }

      // Verify if user exists in public.usuarios to avoid FK error
      const { data: publicUser, error: userError } = await supabase
        .from('usuarios')
        .select('user_id, user_nome, user_email')
        .eq('user_id', user.id)
        .single();
      
      if (userError || !publicUser) {
        console.error('User validation error:', userError);
        throw new Error(`Seu usuário (${user.email}) não está cadastrado na tabela 'usuarios'. Verifique se o cadastro foi concluído.`);
      }

      // Determine metadata creator info
      let createdByName = user.user_metadata?.name || 'Unknown';
      let createdByEmail = user.email;

      // If not a member (so it's a main user), use data from 'usuarios' table
      if (!membroId && publicUser) {
        createdByName = publicUser.user_nome;
        createdByEmail = publicUser.user_email;
      }

      // 1. Create Requisition
      const { data: requisition, error: reqError } = await supabase
        .from('requisicao')
        .insert({
          user_id: user.id,
          titulo: data.titulo,
          descricao: data.descricao || null,
          membro_id: membroId || null,
          urgencia: data.urgencia,
          prazo_entrega_desejado: data.prazo_entrega_desejado,
          observacoes: data.observacoes,
          anexos: data.anexos && data.anexos.length > 0 ? data.anexos : null,
          metadata: { 
            created_by_email: createdByEmail, 
            created_by_name: createdByName 
          },
          status: 'NOVA_REQUISICAO',
          origem: 'FORMULARIO_MEMBRO'
        })
        .select()
        .single();

      if (reqError) {
        console.error('Supabase request error:', JSON.stringify(reqError, null, 2));
        throw reqError;
      }
      if (!requisition) throw new Error('Failed to create requisition');

      // 2. Create Items
      if (data.items.length > 0) {
        const itemsToInsert = data.items.map(item => ({
          requisicao_id: requisition.requisicao_id,
          user_id: user.id,
          nome_item: item.nome_item,
          quantidade: item.quantidade,
          unidade_medida: item.unidade_medida,
          item_categoria: item.item_categoria || null,
          item_tipo: item.item_tipo || 'Material',
          observacoes: item.observacoes,
          descricao_item: item.descricao_item || null,
          dimensao: item.dimensao || null,
          data_necessidade: data.prazo_entrega_desejado || null // Fallback to requisition deadline
        }));

        const { error: itemsError } = await supabase
          .from('requisicao_itens')
          .insert(itemsToInsert);

        if (itemsError) {
          console.error('Supabase items error:', JSON.stringify(itemsError, null, 2));
          throw itemsError;
        }
      }

    } catch (error: any) {
      console.error('Error creating requisition full details:', error);
      if (error?.code) console.error('Error Code:', error.code);
      if (error?.message) console.error('Error Message:', error.message);
      if (error?.details) console.error('Error Details:', error.details);
      if (error?.hint) console.error('Error Hint:', error.hint);
      throw error;
    }
  }
};
