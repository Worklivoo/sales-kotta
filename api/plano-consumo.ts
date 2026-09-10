import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError } from '../server/createMemberService.js';
import { planoConsumoService } from '../server/planoConsumoService.js';
import { resolvePlanoServiceEnv } from '../server/planoEnv.js';

const getBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return '';
  }

  return authorizationHeader.slice('Bearer '.length).trim();
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Metodo nao permitido.' });
  }

  try {
    const result = await planoConsumoService({
      env: resolvePlanoServiceEnv(),
      requesterAccessToken: getBearerToken(request.headers.authorization),
    });

    return response.status(200).json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return response.status(error.statusCode).json({ error: error.message });
    }

    console.error('Erro na API de consumo do plano:', error);
    return response.status(500).json({ error: 'Nao foi possivel carregar o consumo do plano.' });
  }
}
