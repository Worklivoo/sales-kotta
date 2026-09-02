import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { HttpError } from './createMemberService.js';

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
  anthropicApiKey?: string;
  requesterAccessToken: string;
  payload: ValidateSmtpPayload;
}

export interface ValidateSmtpServiceResult {
  validated: boolean;
  resultado: string;
}

interface SmtpVerifyError extends Error {
  code?: string;
  responseCode?: number;
  command?: string;
}

const findMappedErrorMessage = (error: SmtpVerifyError): string | null => {
  const message = (error.message || '').toLowerCase();

  if (error.responseCode === 535 || error.code === 'EAUTH') {
    return 'E-mail ou senha incorretos. Confira as credenciais SMTP e tente novamente.';
  }

  if (error.responseCode === 550 || error.responseCode === 553) {
    return 'O servidor recusou o acesso a essa caixa. Confira se o e-mail informado está correto e ativo.';
  }

  if (message.includes('wrong version number')) {
    return 'A configuração de SSL não combina com a porta informada. Na porta 465 o SSL deve estar ativado; na porta 587 ou 25, desativado.';
  }

  if (message.includes('self signed certificate') || message.includes('certificate')) {
    return 'Problema com o certificado de segurança do servidor. Confira se a opção SSL está configurada corretamente para essa porta.';
  }

  if (error.code === 'ENOTFOUND' || error.code === 'EDNS') {
    return 'Não foi possível encontrar esse servidor. Confira se o host SMTP foi digitado corretamente.';
  }

  if (error.code === 'ETIMEDOUT') {
    return 'O servidor não respondeu a tempo. A porta pode estar bloqueada ou o host informado está incorreto.';
  }

  if (error.code === 'ECONNECTION' || error.code === 'ESOCKET' || error.code === 'ECONNREFUSED') {
    return 'Não foi possível conectar a esse servidor. Confira o host e a porta informados.';
  }

  return null;
};

const explainErrorWithAi = async (
  apiKey: string,
  error: SmtpVerifyError,
  payload: ValidateSmtpPayload,
): Promise<string> => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      temperature: 0,
      system:
        'Voce explica, em uma frase curta e direta em portugues do Brasil, o que o usuario precisa checar ' +
        'na configuracao SMTP dele para corrigir o erro. Nao invente causas que nao aparecem no erro. ' +
        'Nao repita o erro tecnico literalmente, traduza para linguagem de usuario final leigo. ' +
        'Responda so com a frase, sem saudacao e sem markdown.',
      messages: [
        {
          role: 'user',
          content:
            `Host: ${payload.smtp_host}, Porta: ${payload.smtp_port}, SSL: ${payload.smtp_ssl}\n` +
            `Erro retornado pelo servidor SMTP: ${error.message || 'erro desconhecido'}` +
            (error.code ? ` (codigo: ${error.code})` : '') +
            (error.responseCode ? ` (codigo SMTP: ${error.responseCode})` : ''),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API respondeu ${response.status}`);
  }

  const body = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = body.content?.find((block) => block.type === 'text')?.text?.trim();

  if (!text) {
    throw new Error('Resposta vazia da IA');
  }

  return text;
};

export const validateSmtpService = async ({
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
  anthropicApiKey,
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
  const smtpPortRaw = payload.smtp_port?.trim() || '';
  const smtpPort = Number(smtpPortRaw);

  if (!smtpEmail || !smtpSenha || !smtpHost || !smtpPortRaw) {
    throw new HttpError(400, 'Preencha todos os campos SMTP antes de validar.');
  }

  if (!Number.isInteger(smtpPort) || smtpPort <= 0) {
    throw new HttpError(400, 'Informe uma porta SMTP valida.');
  }

  const publicClient = createClient(supabaseUrl, supabaseAnonKey, {
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

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: payload.smtp_ssl === true,
    auth: {
      user: smtpEmail,
      pass: smtpSenha,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  try {
    await transporter.verify();

    return {
      validated: true,
      resultado: 'VALIDADO',
    };
  } catch (error) {
    const smtpError = error as SmtpVerifyError;
    console.error('Erro ao validar conexao SMTP:', smtpError);

    const mappedMessage = findMappedErrorMessage(smtpError);

    if (mappedMessage) {
      return {
        validated: false,
        resultado: mappedMessage,
      };
    }

    if (anthropicApiKey) {
      try {
        const explanation = await explainErrorWithAi(anthropicApiKey, smtpError, payload);

        return {
          validated: false,
          resultado: explanation,
        };
      } catch (aiError) {
        console.error('Erro ao explicar falha de SMTP via IA:', aiError);
      }
    }

    return {
      validated: false,
      resultado:
        smtpError.message ||
        'Nao foi possivel conectar ao servidor SMTP com os dados informados. Confira host, porta, e-mail e senha.',
    };
  }
};
