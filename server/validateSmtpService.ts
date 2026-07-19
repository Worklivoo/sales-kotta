import { createClient } from '@supabase/supabase-js';
import { HttpError } from './createMemberService';

const SMTP_VALIDATION_WEBHOOK_URL =
  'https://primary-systec.up.railway.app/webhook/f76854a9-c075-4945-820e-b5bcb92ddafd';

interface ValidateSmtpPayload {
  smtp_email: string;
  smtp_senha: string;
  smtp_host: string;
  smtp_port: string;
  smtp_ssl: boolean;
}

interface ValidateSmtpServiceOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  requesterAccessToken: string;
  payload: ValidateSmtpPayload;
}

export interface ValidateSmtpServiceResult {
  validated: boolean;
  resultado: string;
}

const extractResultado = (responseBody: unknown) => {
  if (Array.isArray(responseBody)) {
    const firstItem = responseBody[0];

    if (
      firstItem &&
      typeof firstItem === 'object' &&
      'resultado' in firstItem &&
      typeof firstItem.resultado === 'string'
    ) {
      return firstItem.resultado;
    }
  }

  if (
    responseBody &&
    typeof responseBody === 'object' &&
    'resultado' in responseBody &&
    typeof responseBody.resultado === 'string'
  ) {
    return responseBody.resultado;
  }

  return '';
};

export const validateSmtpService = async ({
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
  requesterAccessToken,
  payload,
}: ValidateSmtpServiceOptions): Promise<ValidateSmtpServiceResult> => {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new HttpError(
      500,
      'As credenciais do servidor para validar o SMTP nao estao configuradas. Defina SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor ou no arquivo .env.local.',
    );
  }

  if (!requesterAccessToken) {
    throw new HttpError(401, 'Nao foi possivel validar o usuario autenticado.');
  }

  const smtpEmail = payload.smtp_email?.trim() || '';
  const smtpSenha = payload.smtp_senha?.trim() || '';
  const smtpHost = payload.smtp_host?.trim() || '';
  const smtpPort = payload.smtp_port?.trim() || '';

  if (!smtpEmail || !smtpSenha || !smtpHost || !smtpPort) {
    throw new HttpError(400, 'Preencha todos os campos SMTP antes de validar.');
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
    .select('nome')
    .eq('membro_id', requesterUser.id)
    .maybeSingle();

  if (requesterMemberError) {
    throw new HttpError(500, requesterMemberError.message);
  }

  const nome = requesterMember?.nome?.trim() || '';

  if (!nome) {
    throw new HttpError(400, 'Nao foi possivel identificar o nome do usuario autenticado.');
  }

  const webhookPayload = {
    nome,
    smtp_email: smtpEmail,
    smtp_senha: smtpSenha,
    smtp_host: smtpHost,
    smtp_port: smtpPort,
    smtp_ssl: payload.smtp_ssl,
  };

  const webhookResponse = await fetch(SMTP_VALIDATION_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(webhookPayload),
  });

  const responseText = await webhookResponse.text();
  let responseBody: unknown = null;

  try {
    responseBody = responseText ? JSON.parse(responseText) : null;
  } catch {
    responseBody = null;
  }

  const resultado = extractResultado(responseBody);

  if (!webhookResponse.ok) {
    throw new HttpError(
      400,
      resultado || 'Nao foi possivel validar as configuracoes SMTP no servico externo.',
    );
  }

  if (resultado === 'VALIDADO') {
    return {
      validated: true,
      resultado,
    };
  }

  if (resultado) {
    return {
      validated: false,
      resultado,
    };
  }

  throw new HttpError(400, 'Resposta invalida recebida durante a validacao do SMTP.');
};
