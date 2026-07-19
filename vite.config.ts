import { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createMemberService, HttpError } from './server/createMemberService';
import { manageMemberService } from './server/manageMemberService';
import { validateSmtpService } from './server/validateSmtpService';

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

const validateSmtpDevPlugin = ({
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
}: DevCreateMemberPluginOptions): Plugin => ({
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      port: 3000,
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
      }),
    ],
  };
});
