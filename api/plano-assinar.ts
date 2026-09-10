import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError } from '../server/createMemberService.js';
import { planoAssinarService } from '../server/planoAssinarService.js';
import { resolvePlanoServiceEnv } from '../server/planoEnv.js';

const getBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return '';
  }

  return authorizationHeader.slice('Bearer '.length).trim();
};

const getRemoteIp = (request: VercelRequest) => {
  const forwardedFor = request.headers['x-forwarded-for'];
  const primeiro = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return primeiro?.split(',')[0]?.trim() || request.socket.remoteAddress || '127.0.0.1';
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Metodo nao permitido.' });
  }

  try {
    const result = await planoAssinarService({
      env: resolvePlanoServiceEnv(),
      requesterAccessToken: getBearerToken(request.headers.authorization),
      remoteIp: getRemoteIp(request),
      payload: request.body,
    });

    return response.status(200).json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return response.status(error.statusCode).json({ error: error.message });
    }

    console.error('Erro na API de contratacao/troca de plano:', error);
    return response.status(500).json({ error: 'Nao foi possivel contratar/trocar o plano.' });
  }
}
