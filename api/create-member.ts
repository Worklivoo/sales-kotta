import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createMemberService, HttpError } from '../server/createMemberService.js';

const getBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return '';
  }

  return authorizationHeader.slice('Bearer '.length).trim();
};

const maskSecret = (value: string | null | undefined) => {
  if (!value) {
    return '';
  }

  if (value.length <= 8) {
    return '*'.repeat(value.length);
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Metodo nao permitido.' });
  }

  try {
    const requesterAccessToken = getBearerToken(request.headers.authorization);
    console.log('[api/create-member][request]', {
      method: request.method,
      hasAuthorizationHeader: Boolean(request.headers.authorization),
      requesterAccessTokenPreview: maskSecret(requesterAccessToken),
      bodyPreview: {
        nome: request.body?.nome || null,
        email: request.body?.email || null,
        telefone: request.body?.telefone || null,
        senhaPreview: maskSecret(request.body?.senha),
      },
    });
    const result = await createMemberService({
      supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
      supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      requesterAccessToken,
      payload: request.body,
    });

    console.log('[api/create-member][success]', {
      createdMemberId: result.member.membro_id,
      createdMemberEmail: result.member.email,
    });
    return response.status(200).json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      console.error('[api/create-member][http-error]', {
        statusCode: error.statusCode,
        message: error.message,
      });
      return response.status(error.statusCode).json({ error: error.message });
    }

    console.error('Erro na API de criacao de membro:', error);
    return response.status(500).json({ error: 'Nao foi possivel criar o membro.' });
  }
}
