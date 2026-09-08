import { createClient } from '@supabase/supabase-js';
import { HttpError } from './createMemberService.js';
import { chamarGraphApi, GRAPH_API_BASE } from './metaGraphApi.js';

const VERTICAIS_VALIDAS = [
  'UNDEFINED',
  'OTHER',
  'AUTO',
  'BEAUTY',
  'APPAREL',
  'EDU',
  'ENTERTAIN',
  'EVENT_PLAN',
  'FINANCE',
  'GROCERY',
  'GOVT',
  'HOTEL',
  'HEALTH',
  'NONPROFIT',
  'PROF_SERVICES',
  'RETAIL',
  'TRAVEL',
  'RESTAURANT',
  'NOT_A_BIZ',
];

interface BaseOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  metaSystemUserToken: string;
  metaAppId: string;
  requesterAccessToken: string;
}

interface SalvarPayload {
  sobre?: string;
  descricao?: string;
  email?: string;
  endereco?: string;
  site?: string;
  categoria?: string;
  foto_base64?: string;
  foto_mime?: string;
}

async function autenticarMembro(options: BaseOptions) {
  if (!options.supabaseUrl || !options.supabaseAnonKey || !options.supabaseServiceRoleKey) {
    throw new HttpError(500, 'As credenciais do servidor nao estao configuradas.');
  }

  if (!options.metaSystemUserToken || !options.metaAppId) {
    throw new HttpError(500, 'A integracao com o WhatsApp nao esta configurada no servidor.');
  }

  if (!options.requesterAccessToken) {
    throw new HttpError(401, 'Nao foi possivel validar o usuario autenticado.');
  }

  const publicClient = createClient(options.supabaseUrl, options.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const adminClient = createClient(options.supabaseUrl, options.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await publicClient.auth.getUser(options.requesterAccessToken);

  if (userError || !user?.id) {
    throw new HttpError(401, 'Nao foi possivel validar o usuario autenticado.');
  }

  /* O membro vem SEMPRE do usuario autenticado, nunca do corpo da
     requisicao - senao um membro poderia ler ou editar o numero de
     WhatsApp de outro colega so trocando o id enviado. */
  const { data: membro, error: membroError } = await adminClient
    .from('sales_membros_v2')
    .select('membro_id, canal_whatsapp, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (membroError) {
    throw new HttpError(500, membroError.message);
  }

  if (!membro?.membro_id) {
    throw new HttpError(400, 'Nao foi possivel identificar o seu cadastro.');
  }

  if (membro.status !== 'ATIVO') {
    throw new HttpError(403, 'Seu acesso esta inativo no momento.');
  }

  return { membro };
}

/* O upload de foto de perfil usa a Resumable Upload API da Meta: cria
   uma sessao, envia os bytes (com o esquema "OAuth" no cabecalho - o
   unico ponto da integracao que nao usa "Bearer") e troca por um
   "handle" de uso unico, que so entao entra no PATCH do perfil. */
async function enviarFotoPerfil(appId: string, token: string, base64: string, mime: string) {
  const bytes = Buffer.from(base64, 'base64');

  const sessao = await chamarGraphApi(
    `/${appId}/uploads?file_length=${bytes.length}&file_type=${encodeURIComponent(mime)}`,
    token,
    { method: 'POST' },
  );

  const sessaoId = sessao?.id;

  if (!sessaoId) {
    throw new HttpError(502, 'Nao foi possivel iniciar o envio da foto.');
  }

  const resposta = await fetch(`${GRAPH_API_BASE}/${sessaoId}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${token}`,
      file_offset: '0',
    },
    body: bytes,
  });

  const corpo = await resposta.json().catch(() => null);

  if (!resposta.ok || !corpo?.h) {
    throw new HttpError(502, corpo?.error?.message || 'Nao foi possivel concluir o envio da foto.');
  }

  return corpo.h as string;
}

export async function getWhatsappPerfilService(options: BaseOptions) {
  const { membro } = await autenticarMembro(options);
  const numeroMetaId = (membro.canal_whatsapp as Record<string, unknown> | null)?.numero_meta_id as
    | string
    | undefined;

  if (!numeroMetaId) {
    return { conectado: false as const };
  }

  const [numero, perfilResposta] = await Promise.all([
    chamarGraphApi(
      `/${numeroMetaId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`,
      options.metaSystemUserToken,
    ),
    chamarGraphApi(
      `/${numeroMetaId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
      options.metaSystemUserToken,
    ),
  ]);

  const perfil = perfilResposta?.data?.[0] || {};

  return {
    conectado: true as const,
    numero: {
      id: numeroMetaId,
      telefone: numero.display_phone_number || null,
      nome_verificado: numero.verified_name || null,
      qualidade: numero.quality_rating || null,
      status_verificacao: numero.code_verification_status || null,
    },
    perfil: {
      sobre: perfil.about || '',
      descricao: perfil.description || '',
      email: perfil.email || '',
      endereco: perfil.address || '',
      site: perfil.websites?.[0] || '',
      categoria: perfil.vertical || 'UNDEFINED',
      foto_url: perfil.profile_picture_url || null,
    },
  };
}

export async function salvarWhatsappPerfilService(options: BaseOptions & { payload: SalvarPayload }) {
  const { membro } = await autenticarMembro(options);
  const numeroMetaId = (membro.canal_whatsapp as Record<string, unknown> | null)?.numero_meta_id as
    | string
    | undefined;

  if (!numeroMetaId) {
    throw new HttpError(400, 'Nenhum numero de WhatsApp conectado para o seu usuario.');
  }

  const { payload } = options;
  const corpo: Record<string, unknown> = { messaging_product: 'whatsapp' };

  if (payload.sobre !== undefined) {
    corpo.about = payload.sobre.trim();
  }

  if (payload.descricao !== undefined) {
    corpo.description = payload.descricao.trim();
  }

  if (payload.email !== undefined) {
    corpo.email = payload.email.trim();
  }

  if (payload.endereco !== undefined) {
    corpo.address = payload.endereco.trim();
  }

  if (payload.site !== undefined) {
    corpo.websites = payload.site.trim() ? [payload.site.trim()] : [];
  }

  if (payload.categoria !== undefined) {
    if (!VERTICAIS_VALIDAS.includes(payload.categoria)) {
      throw new HttpError(400, 'Categoria invalida.');
    }

    corpo.vertical = payload.categoria;
  }

  if (payload.foto_base64) {
    corpo.profile_picture_handle = await enviarFotoPerfil(
      options.metaAppId,
      options.metaSystemUserToken,
      payload.foto_base64,
      payload.foto_mime || 'image/jpeg',
    );
  }

  await chamarGraphApi(`/${numeroMetaId}/whatsapp_business_profile`, options.metaSystemUserToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });

  return { salvo: true };
}
