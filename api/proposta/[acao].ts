import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError } from '../../server/createMemberService.js';
import { aplicarCors } from '../../server/cors.js';
import { propostaRenderService } from '../../server/propostaService.js';

/* Todas as acoes de proposta numa unica Serverless Function, pelo mesmo motivo de
   api/plano/[acao].ts e api/sandbox/[acao].ts: o plano Hobby da Vercel permite no maximo
   12 funcoes e cada arquivo em api/ conta como uma. Esta e a 12a: NAO criar outro arquivo
   em api/; novas acoes de proposta entram aqui. */

const getBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return '';
  }

  return authorizationHeader.slice('Bearer '.length).trim();
};

const queryParam = (valor: string | string[] | undefined) =>
  (Array.isArray(valor) ? valor[0] : valor) || '';

const headerParam = (valor: string | string[] | undefined) =>
  ((Array.isArray(valor) ? valor[0] : valor) || '').trim();

const env = () => ({
  supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  propostaServiceToken: process.env.PROPOSTA_SERVICE_TOKEN || '',
});

interface Acao {
  metodo: 'GET' | 'POST';
  erro: string;
  executar: (request: VercelRequest) => Promise<unknown>;
}

const ACOES: Record<string, Acao> = {
  render: {
    metodo: 'POST',
    erro: 'Nao foi possivel gerar a proposta.',
    executar: (request) =>
      propostaRenderService({
        env: env(),
        requesterAccessToken: getBearerToken(request.headers.authorization),
        serviceToken: headerParam(request.headers['x-service-token']),
        body: request.body,
      }),
  },
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (aplicarCors(request, response)) return;

  const nomeAcao = queryParam(request.query.acao);
  const acao = ACOES[nomeAcao];

  if (!acao) {
    return response.status(404).json({ error: 'Acao de proposta nao encontrada.' });
  }

  if (request.method !== acao.metodo) {
    response.setHeader('Allow', acao.metodo);
    return response.status(405).json({ error: 'Metodo nao permitido.' });
  }

  try {
    const result = await acao.executar(request);
    return response.status(200).json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return response.status(error.statusCode).json({ error: error.message });
    }

    console.error(`Erro na API de proposta (${nomeAcao}):`, error);
    return response.status(500).json({ error: acao.erro });
  }
}
