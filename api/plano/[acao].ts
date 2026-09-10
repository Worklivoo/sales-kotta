import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError } from '../../server/createMemberService.js';
import { resolvePlanoServiceEnv } from '../../server/planoEnv.js';
import type { PlanoServiceEnv } from '../../server/planoAuth.js';
import { planoCatalogoService } from '../../server/planoCatalogoService.js';
import { planoConsumoService } from '../../server/planoConsumoService.js';
import { planoAssinarService } from '../../server/planoAssinarService.js';
import { planoCancelarService } from '../../server/planoCancelarService.js';
import { planoCreditosExtraService } from '../../server/planoCreditosExtraService.js';
import { planoTrialResgatarService } from '../../server/planoTrialResgatarService.js';
import { planoPagamentoStatusService } from '../../server/planoPagamentoStatusService.js';
import { planoCupomService } from '../../server/planoCupomService.js';

/* Todas as acoes de plano numa unica Serverless Function.

   Motivo: o plano Hobby da Vercel permite no maximo 12 Serverless Functions
   por deploy, e cada arquivo em api/ conta como uma. Com um arquivo por rota
   de plano o projeto passava de 12 e o deploy era recusado. Esta rota
   dinamica atende /api/plano/<acao> e conta como uma funcao so. */

const getBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return '';
  }

  return authorizationHeader.slice('Bearer '.length).trim();
};

const queryParam = (valor: string | string[] | undefined) =>
  (Array.isArray(valor) ? valor[0] : valor) || '';

const getRemoteIp = (request: VercelRequest) => {
  const forwardedFor = request.headers['x-forwarded-for'];
  const primeiro = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return primeiro?.split(',')[0]?.trim() || request.socket.remoteAddress || '127.0.0.1';
};

interface Contexto {
  env: PlanoServiceEnv;
  requesterAccessToken: string;
  request: VercelRequest;
}

interface Acao {
  metodo: 'GET' | 'POST';
  erro: string;
  executar: (ctx: Contexto) => Promise<unknown>;
}

const ACOES: Record<string, Acao> = {
  catalogo: {
    metodo: 'GET',
    erro: 'Nao foi possivel carregar o catalogo de planos.',
    executar: ({ env, requesterAccessToken }) => planoCatalogoService({ env, requesterAccessToken }),
  },
  consumo: {
    metodo: 'GET',
    erro: 'Nao foi possivel carregar o consumo do plano.',
    executar: ({ env, requesterAccessToken }) => planoConsumoService({ env, requesterAccessToken }),
  },
  assinar: {
    metodo: 'POST',
    erro: 'Nao foi possivel contratar/trocar o plano.',
    executar: ({ env, requesterAccessToken, request }) =>
      planoAssinarService({
        env,
        requesterAccessToken,
        remoteIp: getRemoteIp(request),
        payload: request.body,
      }),
  },
  cancelar: {
    metodo: 'POST',
    erro: 'Nao foi possivel cancelar o plano.',
    executar: ({ env, requesterAccessToken }) => planoCancelarService({ env, requesterAccessToken }),
  },
  'creditos-extra': {
    metodo: 'POST',
    erro: 'Nao foi possivel comprar creditos extras.',
    executar: ({ env, requesterAccessToken, request }) =>
      planoCreditosExtraService({
        env,
        requesterAccessToken,
        remoteIp: getRemoteIp(request),
        payload: request.body,
      }),
  },
  'trial-resgatar': {
    metodo: 'POST',
    erro: 'Nao foi possivel resgatar o periodo gratis.',
    executar: ({ env, requesterAccessToken, request }) =>
      planoTrialResgatarService({ env, requesterAccessToken, payload: request.body }),
  },
  'pagamento-status': {
    metodo: 'GET',
    erro: 'Nao foi possivel verificar o pagamento.',
    executar: ({ env, requesterAccessToken, request }) =>
      planoPagamentoStatusService({
        env,
        requesterAccessToken,
        paymentId: queryParam(request.query.paymentId),
      }),
  },
  cupom: {
    metodo: 'GET',
    erro: 'Nao foi possivel validar o cupom.',
    executar: ({ env, requesterAccessToken, request }) =>
      planoCupomService({
        env,
        requesterAccessToken,
        codigo: queryParam(request.query.codigo),
        planoCodigo: queryParam(request.query.planoCodigo),
        ciclo: queryParam(request.query.ciclo),
      }),
  },
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const nomeAcao = queryParam(request.query.acao);
  const acao = ACOES[nomeAcao];

  if (!acao) {
    return response.status(404).json({ error: 'Acao de plano nao encontrada.' });
  }

  if (request.method !== acao.metodo) {
    response.setHeader('Allow', acao.metodo);
    return response.status(405).json({ error: 'Metodo nao permitido.' });
  }

  try {
    const result = await acao.executar({
      env: resolvePlanoServiceEnv(),
      requesterAccessToken: getBearerToken(request.headers.authorization),
      request,
    });

    return response.status(200).json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return response.status(error.statusCode).json({ error: error.message });
    }

    console.error(`Erro na API de plano (${nomeAcao}):`, error);
    return response.status(500).json({ error: acao.erro });
  }
}
