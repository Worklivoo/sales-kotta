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
  /* Resposta de API e sempre do usuario logado e muda a cada chamada: nunca
     guardar em cache. Sem isso o navegador revalidava, a Vercel devolvia 304
     sem corpo, e a pagina recebia um vazio no lugar do JSON (erro "formato
     inesperado" no Plano e "reading 'conectado'" no WhatsApp). */
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Vary', 'Origin, Authorization');
  /* Navegador que ja guardou uma resposta antiga manda If-None-Match e
     receberia 304 vazio de novo. Ignorar a pergunta forca a resposta completa. */
  delete request.headers['if-none-match'];
  delete request.headers['if-modified-since'];

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return true;
  }

  return false;
};
