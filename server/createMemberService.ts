import { createClient } from '@supabase/supabase-js';

interface CreateMemberPayload {
  nome: string;
  email: string;
  telefone: string;
  senha: string;
}

interface CreateMemberServiceOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  requesterAccessToken: string;
  payload: CreateMemberPayload;
}

interface TeamMemberRecord {
  membro_id: string;
  empresa_id: string | null;
  nome: string;
  email: string;
  telefone: string;
  cargo: string;
}

export interface CreateMemberServiceResult {
  member: TeamMemberRecord;
}

export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const normalizePhoneDigits = (value: string) => {
  let digits = value.replace(/\D/g, '');

  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  return digits.slice(0, 11);
};

export const createMemberService = async ({
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
  requesterAccessToken,
  payload,
}: CreateMemberServiceOptions): Promise<CreateMemberServiceResult> => {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new HttpError(
      500,
      'As credenciais do servidor para criar membros nao estao configuradas. Defina SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor ou no arquivo .env.local.',
    );
  }

  if (!requesterAccessToken) {
    throw new HttpError(401, 'Nao foi possivel validar o usuario autenticado.');
  }

  const nome = payload.nome.trim();
  const email = payload.email.trim().toLowerCase();
  const telefoneDigits = normalizePhoneDigits(payload.telefone);
  const senha = payload.senha;

  if (!nome) {
    throw new HttpError(400, 'Informe o nome completo do membro.');
  }

  if (!email) {
    throw new HttpError(400, 'Informe o e-mail do membro.');
  }

  if (telefoneDigits.length < 10 || telefoneDigits.length > 11) {
    throw new HttpError(400, 'Informe um telefone valido com DDD.');
  }

  if (!senha || senha.length < 6) {
    throw new HttpError(400, 'A senha deve ter pelo menos 6 caracteres.');
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
    throw new HttpError(403, 'Somente administradores podem adicionar membros.');
  }

  const telefone = `55${telefoneDigits}`;
  const { data: createdAuthUser, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (createUserError) {
    throw new HttpError(400, createUserError.message);
  }

  if (!createdAuthUser.user?.id) {
    throw new HttpError(500, 'Nao foi possivel obter o ID do usuario criado.');
  }

  const memberRecord: TeamMemberRecord = {
    membro_id: createdAuthUser.user.id,
    empresa_id: requesterMember.empresa_id,
    nome,
    email,
    telefone,
    cargo: 'VENDEDOR',
  };

  const { error: insertMemberError } = await adminClient
    .from('sales_membros_empresa')
    .insert(memberRecord);

  if (insertMemberError) {
    await adminClient.auth.admin.deleteUser(createdAuthUser.user.id);
    throw new HttpError(400, insertMemberError.message);
  }

  return {
    member: memberRecord,
  };
};
