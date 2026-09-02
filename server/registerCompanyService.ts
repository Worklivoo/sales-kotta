import { createClient } from '@supabase/supabase-js';
import { HttpError } from './createMemberService.js';

interface RegisterCompanyPayload {
  accessPassword: string;
  nomeResponsavel: string;
  emailResponsavel: string;
  telefoneResponsavel: string;
  nomeEmpresa: string;
  cnpj: string;
  senhaConta: string;
}

interface RegisterCompanyServiceOptions {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  accessPassword: string;
  payload: RegisterCompanyPayload;
}

export interface RegisterCompanyServiceResult {
  message: string;
  empresaId: string;
}

const onlyDigits = (value: string) => (value || '').replace(/\D/g, '');

const normalizePhoneDigits = (value: string) => {
  let digits = onlyDigits(value);

  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  return digits.slice(0, 11);
};

const normalizeRazaoSocial = (value: string) =>
  value
    .normalize('NFD')
    .replace(new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g'), '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

export const registerCompanyService = async ({
  supabaseUrl,
  supabaseServiceRoleKey,
  accessPassword,
  payload,
}: RegisterCompanyServiceOptions): Promise<RegisterCompanyServiceResult> => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new HttpError(
      500,
      'As credenciais do servidor para cadastro nao estao configuradas. Defina SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor ou no arquivo .env.local.',
    );
  }

  if (!accessPassword) {
    throw new HttpError(
      500,
      'A chave de acesso do cadastro nao esta configurada. Defina REGISTER_ACCESS_PASSWORD no ambiente do servidor ou no arquivo .env.local.',
    );
  }

  if (payload.accessPassword !== accessPassword) {
    throw new HttpError(403, 'Chave de acesso invalida.');
  }

  const nomeResponsavel = payload.nomeResponsavel?.trim() || '';
  const email = payload.emailResponsavel?.trim().toLowerCase() || '';
  const telefoneDigits = normalizePhoneDigits(payload.telefoneResponsavel || '');
  const razaoSocial = normalizeRazaoSocial(payload.nomeEmpresa || '');
  const cnpj = onlyDigits(payload.cnpj || '');
  const senhaConta = payload.senhaConta || '';

  if (!nomeResponsavel) {
    throw new HttpError(400, 'Informe o nome do responsavel.');
  }

  if (!email) {
    throw new HttpError(400, 'Informe o e-mail do responsavel.');
  }

  if (telefoneDigits.length < 10 || telefoneDigits.length > 11) {
    throw new HttpError(400, 'Informe um telefone valido com DDD.');
  }

  if (!razaoSocial) {
    throw new HttpError(400, 'Informe um nome de empresa valido.');
  }

  if (cnpj.length !== 14) {
    throw new HttpError(400, 'Informe um CNPJ valido.');
  }

  if (!senhaConta || senhaConta.length < 6) {
    throw new HttpError(400, 'A senha da conta deve ter pelo menos 6 caracteres.');
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const telefoneResponsavel = `55${telefoneDigits}`;

  const { data: createdAuthUser, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password: senhaConta,
    email_confirm: true,
  });

  if (createUserError) {
    throw new HttpError(400, createUserError.message);
  }

  if (!createdAuthUser.user?.id) {
    throw new HttpError(500, 'Nao foi possivel obter o ID do usuario criado.');
  }

  const { data: empresaRow, error: empresaError } = await adminClient
    .from('sales_empresas_v2')
    .insert({
      razao_social: razaoSocial,
      cnpj,
      nome_responsavel: nomeResponsavel,
      email_responsavel: email,
      telefone_responsavel: telefoneResponsavel,
    })
    .select('empresa_id')
    .single();

  if (empresaError || !empresaRow?.empresa_id) {
    await adminClient.auth.admin.deleteUser(createdAuthUser.user.id);
    throw new HttpError(400, empresaError?.message || 'Nao foi possivel criar a empresa.');
  }

  const { error: membroError } = await adminClient.from('sales_membros_v2').insert({
    empresa_id: empresaRow.empresa_id,
    user_id: createdAuthUser.user.id,
    nome: nomeResponsavel,
    email,
    telefone: telefoneResponsavel,
    cargo: 'ADMIN',
  });

  if (membroError) {
    await adminClient.from('sales_empresas_v2').delete().eq('empresa_id', empresaRow.empresa_id);
    await adminClient.auth.admin.deleteUser(createdAuthUser.user.id);
    throw new HttpError(400, membroError.message);
  }

  return {
    message: 'Cadastro realizado com sucesso.',
    empresaId: empresaRow.empresa_id as string,
  };
};
