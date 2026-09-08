import { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createMemberService, HttpError } from './server/createMemberService';
import { manageMemberService } from './server/manageMemberService';
import { validateSmtpService } from './server/validateSmtpService';
import { registerCompanyService } from './server/registerCompanyService';
import { getWhatsappPerfilService, salvarWhatsappPerfilService } from './server/whatsappPerfilService';
import { whatsappProvisionamentoService } from './server/whatsappProvisionamentoService';

interface DevCreateMemberPluginOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
}

const readJsonBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return rawBody ? JSON.parse(rawBody) : {};
};

const getBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return '';
  }

  return authorizationHeader.slice('Bearer '.length).trim();
};

const sendJson = (response: ServerResponse, statusCode: number, payload: unknown) => {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

const createMemberDevPlugin = ({
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
}: DevCreateMemberPluginOptions): Plugin => ({
  name: 'create-member-dev-api',
  configureServer(server) {
    server.middlewares.use('/api/create-member', async (request, response, next) => {
      if (request.method !== 'POST') {
        return next();
      }

      try {
        const payload = await readJsonBody(request);
        const requesterAccessToken = getBearerToken(request.headers.authorization);
        const result = await createMemberService({
          supabaseUrl,
          supabaseAnonKey,
          supabaseServiceRoleKey,
          requesterAccessToken,
          payload,
        });

        sendJson(response, 200, result);
      } catch (error) {
        if (error instanceof HttpError) {
          sendJson(response, error.statusCode, { error: error.message });
          return;
        }

        if (error instanceof SyntaxError) {
          sendJson(response, 400, { error: 'Corpo da requisicao invalido.' });
          return;
        }

        console.error('Erro na API local de criacao de membro:', error);
        sendJson(response, 500, { error: 'Nao foi possivel criar o membro.' });
      }
    });
  },
});

const manageMemberDevPlugin = ({
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
}: DevCreateMemberPluginOptions): Plugin => ({
  name: 'manage-member-dev-api',
  configureServer(server) {
    server.middlewares.use('/api/manage-member', async (request, response, next) => {
      if (request.method !== 'POST') {
        return next();
      }

      try {
        const payload = await readJsonBody(request);
        const requesterAccessToken = getBearerToken(request.headers.authorization);
        const result = await manageMemberService({
          supabaseUrl,
          supabaseAnonKey,
          supabaseServiceRoleKey,
          requesterAccessToken,
          payload,
        });

        sendJson(response, 200, result);
      } catch (error) {
        if (error instanceof HttpError) {
          sendJson(response, error.statusCode, { error: error.message });
          return;
        }

        if (error instanceof SyntaxError) {
          sendJson(response, 400, { error: 'Corpo da requisicao invalido.' });
          return;
        }

        console.error('Erro na API local de gerenciamento de membro:', error);
        sendJson(response, 500, { error: 'Nao foi possivel gerenciar o membro.' });
      }
    });
  },
});

interface DevValidateSmtpPluginOptions extends DevCreateMemberPluginOptions {
  anthropicApiKey: string;
}

const validateSmtpDevPlugin = ({
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
  anthropicApiKey,
}: DevValidateSmtpPluginOptions): Plugin => ({
  name: 'validate-smtp-dev-api',
  configureServer(server) {
    server.middlewares.use('/api/validate-smtp', async (request, response, next) => {
      if (request.method !== 'POST') {
        return next();
      }

      try {
        const payload = await readJsonBody(request);
        const requesterAccessToken = getBearerToken(request.headers.authorization);
        const result = await validateSmtpService({
          supabaseUrl,
          supabaseAnonKey,
          supabaseServiceRoleKey,
          anthropicApiKey,
          requesterAccessToken,
          payload,
        });

        sendJson(response, 200, result);
      } catch (error) {
        if (error instanceof HttpError) {
          sendJson(response, error.statusCode, { error: error.message });
          return;
        }

        if (error instanceof SyntaxError) {
          sendJson(response, 400, { error: 'Corpo da requisicao invalido.' });
          return;
        }

        console.error('Erro na API local de validacao SMTP:', error);
        sendJson(response, 500, { error: 'Nao foi possivel validar as configuracoes SMTP.' });
      }
    });
  },
});

const registerCompanyDevPlugin = ({
  supabaseUrl,
  supabaseServiceRoleKey,
  accessPassword,
}: Pick<DevCreateMemberPluginOptions, 'supabaseUrl' | 'supabaseServiceRoleKey'> & {
  accessPassword: string;
}): Plugin => ({
  name: 'register-company-dev-api',
  configureServer(server) {
    server.middlewares.use('/api/register-company', async (request, response, next) => {
      if (request.method !== 'POST') {
        return next();
      }

      try {
        const payload = await readJsonBody(request);
        const result = await registerCompanyService({
          supabaseUrl,
          supabaseServiceRoleKey,
          accessPassword,
          payload,
        });

        sendJson(response, 200, result);
      } catch (error) {
        if (error instanceof HttpError) {
          sendJson(response, error.statusCode, { error: error.message });
          return;
        }

        if (error instanceof SyntaxError) {
          sendJson(response, 400, { error: 'Corpo da requisicao invalido.' });
          return;
        }

        console.error('Erro na API local de cadastro de empresa:', error);
        sendJson(response, 500, { error: 'Nao foi possivel concluir o cadastro.' });
      }
    });
  },
});

interface DevWhatsappPerfilPluginOptions extends DevCreateMemberPluginOptions {
  metaSystemUserToken: string;
  metaAppId: string;
}

const whatsappPerfilDevPlugin = ({
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
  metaSystemUserToken,
  metaAppId,
}: DevWhatsappPerfilPluginOptions): Plugin => ({
  name: 'whatsapp-perfil-dev-api',
  configureServer(server) {
    server.middlewares.use('/api/whatsapp-perfil', async (request, response, next) => {
      const requesterAccessToken = getBearerToken(request.headers.authorization);
      const baseOptions = {
        supabaseUrl,
        supabaseAnonKey,
        supabaseServiceRoleKey,
        metaSystemUserToken,
        metaAppId,
        requesterAccessToken,
      };

      try {
        if (request.method === 'GET') {
          const result = await getWhatsappPerfilService(baseOptions);
          sendJson(response, 200, result);
          return;
        }

        if (request.method === 'POST') {
          const payload = await readJsonBody(request);
          const result = await salvarWhatsappPerfilService({ ...baseOptions, payload });
          sendJson(response, 200, result);
          return;
        }

        return next();
      } catch (error) {
        if (error instanceof HttpError) {
          sendJson(response, error.statusCode, { error: error.message });
          return;
        }

        if (error instanceof SyntaxError) {
          sendJson(response, 400, { error: 'Corpo da requisicao invalido.' });
          return;
        }

        console.error('Erro na API local do perfil de WhatsApp:', error);
        sendJson(response, 500, { error: 'Nao foi possivel falar com o WhatsApp.' });
      }
    });
  },
});

interface DevWhatsappProvisionamentoPluginOptions extends DevCreateMemberPluginOptions {
  metaSystemUserToken: string;
  metaBusinessId: string;
  metaAppId: string;
  metaAppSecret: string;
  metaRegisterPin: string;
  salvyApiKey: string;
}

const whatsappProvisionamentoDevPlugin = ({
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
  metaSystemUserToken,
  metaBusinessId,
  metaAppId,
  metaAppSecret,
  metaRegisterPin,
  salvyApiKey,
}: DevWhatsappProvisionamentoPluginOptions): Plugin => ({
  name: 'whatsapp-provisionamento-dev-api',
  configureServer(server) {
    server.middlewares.use('/api/whatsapp-provisionamento', async (request, response, next) => {
      if (request.method !== 'POST') {
        return next();
      }

      try {
        const payload = await readJsonBody(request);
        const requesterAccessToken = getBearerToken(request.headers.authorization);
        const result = await whatsappProvisionamentoService({
          supabaseUrl,
          supabaseAnonKey,
          supabaseServiceRoleKey,
          metaSystemUserToken,
          metaBusinessId,
          metaAppId,
          metaAppSecret,
          metaRegisterPin,
          salvyApiKey,
          requesterAccessToken,
          payload,
        });

        sendJson(response, 200, result);
      } catch (error) {
        if (error instanceof HttpError) {
          sendJson(response, error.statusCode, { error: error.message });
          return;
        }

        if (error instanceof SyntaxError) {
          sendJson(response, 400, { error: 'Corpo da requisicao invalido.' });
          return;
        }

        console.error('Erro na API local de provisionamento de WhatsApp:', error);
        sendJson(response, 500, { error: 'Nao foi possivel processar a configuracao do WhatsApp.' });
      }
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      port: Number(process.env.PORT) || 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      createMemberDevPlugin({
        supabaseUrl: env.VITE_SUPABASE_URL || env.SUPABASE_URL || '',
        supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '',
        supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
      }),
      manageMemberDevPlugin({
        supabaseUrl: env.VITE_SUPABASE_URL || env.SUPABASE_URL || '',
        supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '',
        supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
      }),
      validateSmtpDevPlugin({
        supabaseUrl: env.VITE_SUPABASE_URL || env.SUPABASE_URL || '',
        supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '',
        supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
        anthropicApiKey: env.ANTHROPIC_API_KEY || '',
      }),
      registerCompanyDevPlugin({
        supabaseUrl: env.VITE_SUPABASE_URL || env.SUPABASE_URL || '',
        supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
        accessPassword: env.VITE_REGISTER_ACCESS_PASSWORD || env.REGISTER_ACCESS_PASSWORD || '',
      }),
      whatsappPerfilDevPlugin({
        supabaseUrl: env.VITE_SUPABASE_URL || env.SUPABASE_URL || '',
        supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '',
        supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
        metaSystemUserToken: env.META_SYSTEM_USER_TOKEN || '',
        metaAppId: env.META_APP_ID || '',
      }),
      whatsappProvisionamentoDevPlugin({
        supabaseUrl: env.VITE_SUPABASE_URL || env.SUPABASE_URL || '',
        supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '',
        supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
        metaSystemUserToken: env.META_SYSTEM_USER_TOKEN || '',
        metaBusinessId: env.META_BUSINESS_ID || '',
        metaAppId: env.META_APP_ID || '',
        metaAppSecret: env.META_APP_SECRET || '',
        metaRegisterPin: env.META_WHATSAPP_REGISTER_PIN || '',
        salvyApiKey: env.SALVY_API_KEY || '',
      }),
    ],
  };
});
