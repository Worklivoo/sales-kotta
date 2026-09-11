import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError } from '../../server/createMemberService.js';
import {
  sandboxListarEmpresasService,
  sandboxListarAtendimentosService,
  sandboxListarMensagensService,
  sandboxConfigurarWhatsappService,
  sandboxExcluirAtendimentoService,
} from '../../server/sandboxService.js';

/* Todas as acoes do sandbox de testes numa unica Serverless Function, pelo
   mesmo motivo de api/plano/[acao].ts: o plano Hobby da Vercel permite no
   maximo 12 funcoes e cada arquivo em api/ conta como uma. */

const getBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return '';
  }

  return authorizationHeader.slice('Bearer '.length).trim();
};

const queryParam = (valor: string | string[] | undefined) =>
  (Array.isArray(valor) ? valor[0] : valor) || '';

const env = () => ({
  supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
});

interface Acao {
  metodo: 'GET' | 'POST';
  erro: string;
  executar: (request: VercelRequest, requesterAccessToken: string) => Promise<unknown>;
}

const ACOES: Record<string, Acao> = {
  empresas: {
    metodo: 'GET',
    erro: 'Nao foi possivel carregar as empresas de teste.',
    executar: (_request, requesterAccessToken) =>
      sandboxListarEmpresasService({ env: env(), requesterAccessToken }),
  },
  atendimentos: {
    metodo: 'GET',
    erro: 'Nao foi possivel carregar as conversas de teste.',
    executar: (request, requesterAccessToken) =>
      sandboxListarAtendimentosService({
        env: env(),
        requesterAccessToken,
        empresaId: queryParam(request.query.empresa_id),
      }),
  },
  mensagens: {
    metodo: 'GET',
    erro: 'Nao foi possivel carregar as mensagens.',
    executar: (request, requesterAccessToken) =>
      sandboxListarMensagensService({
        env: env(),
        requesterAccessToken,
        empresaId: queryParam(request.query.empresa_id),
        atendimentoId: queryParam(request.query.atendimento_id),
      }),
  },
  'configurar-whatsapp': {
    metodo: 'POST',
    erro: 'Nao foi possivel configurar o WhatsApp de teste.',
    executar: (request, requesterAccessToken) =>
      sandboxConfigurarWhatsappService({
        env: env(),
        requesterAccessToken,
        empresaId: request.body?.empresa_id || '',
      }),
  },
  'excluir-atendimento': {
    metodo: 'POST',
    erro: 'Nao foi possivel excluir a conversa de teste.',
    executar: (request, requesterAccessToken) =>
      sandboxExcluirAtendimentoService({
        env: env(),
        requesterAccessToken,
        empresaId: request.body?.empresa_id || '',
        atendimentoId: request.body?.atendimento_id || '',
      }),
  },
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const nomeAcao = queryParam(request.query.acao);
  const acao = ACOES[nomeAcao];

  if (!acao) {
    return response.status(404).json({ error: 'Acao de sandbox nao encontrada.' });
  }

  if (request.method !== acao.metodo) {
    response.setHeader('Allow', acao.metodo);
    return response.status(405).json({ error: 'Metodo nao permitido.' });
  }

  try {
    const result = await acao.executar(request, getBearerToken(request.headers.authorization));
    return response.status(200).json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return response.status(error.statusCode).json({ error: error.message });
    }

    console.error(`Erro na API de sandbox (${nomeAcao}):`, error);
    return response.status(500).json({ error: acao.erro });
  }
}
