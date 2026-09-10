import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError } from '../server/createMemberService.js';
import {
  getFollowupTemplatesService,
  getWhatsappPerfilService,
  salvarWhatsappPerfilService,
} from '../server/whatsappPerfilService.js';

const getBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return '';
  }

  return authorizationHeader.slice('Bearer '.length).trim();
};

const buildBaseOptions = (request: VercelRequest) => ({
  supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  metaSystemUserToken: process.env.META_SYSTEM_USER_TOKEN || '',
  metaAppId: process.env.META_APP_ID || '',
  requesterAccessToken: getBearerToken(request.headers.authorization),
});

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (request.method === 'GET') {
      /* Sub-recurso em vez de rota propria: a Hobby da Vercel so permite 12
         Serverless Functions e ja estamos em 10. */
      if (request.query?.recurso === 'followup-templates') {
        const resultado = await getFollowupTemplatesService(buildBaseOptions(request));
        return response.status(200).json(resultado);
      }

      const resultado = await getWhatsappPerfilService(buildBaseOptions(request));
      return response.status(200).json(resultado);
    }

    if (request.method === 'POST') {
      const resultado = await salvarWhatsappPerfilService({
        ...buildBaseOptions(request),
        payload: request.body || {},
      });
      return response.status(200).json(resultado);
    }

    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'Metodo nao permitido.' });
  } catch (error) {
    if (error instanceof HttpError) {
      return response.status(error.statusCode).json({ error: error.message });
    }

    console.error('Erro na integracao com o WhatsApp:', error);
    return response.status(500).json({ error: 'Nao foi possivel falar com o WhatsApp.' });
  }
}
