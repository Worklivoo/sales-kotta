import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError } from '../server/createMemberService.js';
import { planoPagamentoStatusService } from '../server/planoPagamentoStatusService.js';
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
    const paymentId = typeof request.query.paymentId === 'string' ? request.query.paymentId : '';
    const result = await planoPagamentoStatusService({
      env: resolvePlanoServiceEnv(),
      requesterAccessToken: getBearerToken(request.headers.authorization),
      paymentId,
    });

    return response.status(200).json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return response.status(error.statusCode).json({ error: error.message });
    }

    console.error('Erro na API de status de pagamento:', error);
    return response.status(500).json({ error: 'Nao foi possivel verificar o pagamento.' });
  }
}
