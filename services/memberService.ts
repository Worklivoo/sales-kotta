import { supabase } from '../lib/supabase';
import { Database } from '../lib/database.types';

type MembroRow = Database['public']['Tables']['membros']['Row'];

export interface Member {
  id: string;
  name: string;
  department: string;
}

export const memberService = {
  async getAll(): Promise<Member[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return [];

      const { data, error } = await supabase
        .from('membros')
        .select('*')
        .eq('user_id', user.id)
        .eq('membro_status', 'Ativo')
        .order('membro_nome');

      if (error) throw error;

      return (data || []).map((membro: MembroRow) => ({
        id: membro.membro_id,
        name: membro.membro_nome,
        department: membro.membro_departamento || ''
      }));
    } catch (error) {
      console.error('Error fetching members:', error);
      return [];
    }
  }
};
