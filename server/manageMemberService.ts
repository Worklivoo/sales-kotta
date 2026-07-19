import { createClient } from '@supabase/supabase-js';
import { HttpError } from './createMemberService';

type ManageMemberAction = 'reset-password' | 'update-info' | 'deactivate' | 'activate' | 'delete';

interface ManageMemberPayload {
  action: ManageMemberAction;
  memberId: string;
  nome?: string;
  telefone?: string;
}

interface ManageMemberServiceOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  requesterAccessToken: string;
  payload: ManageMemberPayload;
}

export interface TeamMemberRecord {
  membro_id: string;
  empresa_id: string | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  cargo: string | null;
  status: string | null;
  [key: string]: unknown;
}

interface ManageMemberServiceResult {
  message: string;
  member?: TeamMemberRecord;
  memberId?: string;
}

const normalizePhoneDigits = (value: string) => {
  let digits = value.replace(/\D/g, '');

  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  return digits.slice(0, 11);
};

const getValidatedContext = async ({
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
  requesterAccessToken,
  memberId,
}: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  requesterAccessToken: string;
  memberId: string;
}) => {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new HttpError(
      500,
      'As credenciais do servidor para gerenciar membros nao estao configuradas. Defina SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor ou no arquivo .env.local.',
    );
  }

  if (!requesterAccessToken) {
    throw new HttpError(401, 'Nao foi possivel validar o usuario autenticado.');
  }

  if (!memberId) {
    throw new HttpError(400, 'Nao foi possivel identificar o membro selecionado.');
  }

  const publicClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user: requesterUser },
    error: requesterUserError,
  } = await publicClient.auth.getUser(requesterAccessToken);

  if (requesterUserError || !requesterUser?.id) {
    throw new HttpError(401, 'Nao foi possivel validar o usuario autenticado.');
  }

  const { data: requesterMember, error: requesterMemberError } = await adminClient
    .from('sales_membros_empresa')
    .select('empresa_id, cargo')
    .eq('membro_id', requesterUser.id)
    .maybeSingle();

  if (requesterMemberError) {
    throw new HttpError(500, requesterMemberError.message);
  }

  if (!requesterMember?.empresa_id) {
    throw new HttpError(400, 'Nao foi possivel identificar a empresa do usuario atual.');
  }

  if (requesterMember.cargo !== 'ADMIN') {
    throw new HttpError(403, 'Somente administradores podem gerenciar membros.');
  }

  const { data: targetMember, error: targetMemberError } = await adminClient
    .from('sales_membros_empresa')
    .select('*')
    .eq('membro_id', memberId)
    .maybeSingle();

  if (targetMemberError) {
    throw new HttpError(500, targetMemberError.message);
  }

  if (!targetMember?.membro_id) {
    throw new HttpError(404, 'O membro selecionado nao foi encontrado.');
  }

  if (targetMember.empresa_id !== requesterMember.empresa_id) {
    throw new HttpError(403, 'Voce nao tem permissao para gerenciar este membro.');
  }

  return {
    publicClient,
    adminClient,
    requesterUserId: requesterUser.id,
    targetMember: targetMember as TeamMemberRecord,
  };
};

export const manageMemberService = async ({
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
  requesterAccessToken,
  payload,
}: ManageMemberServiceOptions): Promise<ManageMemberServiceResult> => {
  const action = payload.action;

  if (!action) {
    throw new HttpError(400, 'Informe a acao que deve ser executada para o membro.');
  }

  const { publicClient, adminClient, requesterUserId, targetMember } = await getValidatedContext({
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    requesterAccessToken,
    memberId: payload.memberId,
  });

  if (action === 'reset-password') {
    if (!targetMember.email?.trim()) {
      throw new HttpError(400, 'O membro selecionado nao possui e-mail cadastrado.');
    }

    const { error } = await publicClient.auth.resetPasswordForEmail(targetMember.email.trim());

    if (error) {
      throw new HttpError(400, error.message);
    }

    return {
      message: 'Link de redefinicao de senha enviado com sucesso.',
      member: targetMember,
    };
  }

  if (action === 'update-info') {
    const nome = payload.nome?.trim() || '';
    const telefoneDigits = normalizePhoneDigits(payload.telefone || '');

    if (!nome) {
      throw new HttpError(400, 'Informe o nome do membro.');
    }

    if (telefoneDigits.length < 10 || telefoneDigits.length > 11) {
      throw new HttpError(400, 'Informe um telefone valido com DDD.');
    }

    const { data, error } = await adminClient
      .from('sales_membros_empresa')
      .update({
        nome,
        telefone: `55${telefoneDigits}`,
      })
      .eq('membro_id', targetMember.membro_id)
      .select('membro_id, empresa_id, nome, email, telefone, cargo, status')
      .single();

    if (error) {
      throw new HttpError(400, error.message);
    }

    return {
      message: 'Informacoes do membro atualizadas com sucesso.',
      member: data as TeamMemberRecord,
    };
  }

  if (action === 'deactivate') {
    if (targetMember.membro_id === requesterUserId) {
      throw new HttpError(400, 'Voce nao pode desativar o seu proprio usuario.');
    }

    const { data, error } = await adminClient
      .from('sales_membros_empresa')
      .update({ status: 'INATIVO' })
      .eq('membro_id', targetMember.membro_id)
      .select('membro_id, empresa_id, nome, email, telefone, cargo, status')
      .single();

    if (error) {
      throw new HttpError(400, error.message);
    }

    return {
      message: 'Membro desativado com sucesso.',
      member: data as TeamMemberRecord,
    };
  }

  if (action === 'activate') {
    const { data, error } = await adminClient
      .from('sales_membros_empresa')
      .update({ status: 'ATIVO' })
      .eq('membro_id', targetMember.membro_id)
      .select('membro_id, empresa_id, nome, email, telefone, cargo, status')
      .single();

    if (error) {
      throw new HttpError(400, error.message);
    }

    return {
      message: 'Membro ativado com sucesso.',
      member: data as TeamMemberRecord,
    };
  }

  if (action === 'delete') {
    if (targetMember.membro_id === requesterUserId) {
      throw new HttpError(400, 'Voce nao pode excluir o seu proprio usuario.');
    }

    const { error: deleteMemberError } = await adminClient
      .from('sales_membros_empresa')
      .delete()
      .eq('membro_id', targetMember.membro_id);

    if (deleteMemberError) {
      throw new HttpError(400, deleteMemberError.message);
    }

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(targetMember.membro_id);

    if (deleteAuthError) {
      await adminClient.from('sales_membros_empresa').insert(targetMember);
      throw new HttpError(400, deleteAuthError.message);
    }

    return {
      message: 'Membro excluido com sucesso.',
      memberId: targetMember.membro_id,
    };
  }

  throw new HttpError(400, 'Acao de membro invalida.');
};
