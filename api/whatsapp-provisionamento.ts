import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError } from '../server/createMemberService.js';
import { whatsappProvisionamentoService } from '../server/whatsappProvisionamentoService.js';

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
    const resultado = await whatsappProvisionamentoService({
      supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
      supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      metaSystemUserToken: process.env.META_SYSTEM_USER_TOKEN || '',
      metaBusinessId: process.env.META_BUSINESS_ID || '',
      metaAppId: process.env.META_APP_ID || '',
      metaAppSecret: process.env.META_APP_SECRET || '',
      metaRegisterPin: process.env.META_WHATSAPP_REGISTER_PIN || '',
      salvyApiKey: process.env.SALVY_API_KEY || '',
      requesterAccessToken: getBearerToken(request.headers.authorization),
      payload: request.body || {},
    });

    return response.status(200).json(resultado);
  } catch (error) {
    if (error instanceof HttpError) {
      return response.status(error.statusCode).json({ error: error.message });
    }

    console.error('Erro no provisionamento de WhatsApp:', error);
    return response.status(500).json({ error: 'Nao foi possivel processar a configuracao do WhatsApp.' });
  }
}
