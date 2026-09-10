import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError } from '../server/createMemberService.js';
import { planoTrialResgatarService } from '../server/planoTrialResgatarService.js';
import { resolvePlanoServiceEnv } from '../server/planoEnv.js';

const getBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return '';
  }

  return authorizationHeader.slice('Bearer '.length).trim();
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Metodo nao permitido.' });
  }

  try {
    const result = await planoTrialResgatarService({
      env: resolvePlanoServiceEnv(),
      requesterAccessToken: getBearerToken(request.headers.authorization),
      payload: request.body,
    });

    return response.status(200).json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return response.status(error.statusCode).json({ error: error.message });
    }

    console.error('Erro na API de resgate de periodo gratis:', error);
    return response.status(500).json({ error: 'Nao foi possivel resgatar o periodo gratis.' });
  }
}
