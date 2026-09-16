import type { VercelRequest, VercelResponse } from '@vercel/node';

/* O front pode ser publicado num dominio diferente da API (cPanel/Hostgator
   nao roda Serverless Functions). Sem esses headers o navegador bloqueia a
   chamada antes mesmo dela chegar aqui.

   Retorna true quando ja respondeu a requisicao (preflight OPTIONS) - nesse
   caso o handler deve parar e nao processar nada mais. */
export const aplicarCors = (request: VercelRequest, response: VercelResponse): boolean => {
  const origemPermitida = process.env.FRONTEND_ORIGIN || 'https://saleskotta.worklivoo.com';

  response.setHeader('Access-Control-Allow-Origin', origemPermitida);
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return true;
  }

  return false;
};
