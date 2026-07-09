import { supabase } from './supabase';

export const MEMBER_ACCESS_DENIED_MESSAGE =
  'Seu acesso ao sistema nao esta liberado. Fale com o administrador da empresa.';

export const MEMBER_INACTIVE_MESSAGE =
  'Seu acesso esta inativo no momento. Fale com o administrador da empresa.';

export async function validateActiveMemberAccess(userId: string) {
  const { data, error } = await supabase
    .from('sales_membros_empresa')
    .select('status')
    .eq('membro_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return {
      allowed: false,
      message: MEMBER_ACCESS_DENIED_MESSAGE,
    };
  }

  if (data.status !== 'ATIVO') {
    return {
      allowed: false,
      message: MEMBER_INACTIVE_MESSAGE,
    };
  }

  return {
    allowed: true,
    message: null,
  };
}
