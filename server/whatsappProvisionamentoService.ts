import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './createMemberService.js';
import { chamarGraphApi } from './metaGraphApi.js';

const SALVY_API_BASE = 'https://api.salvy.com.br/api/v2';

interface Options {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  metaSystemUserToken: string;
  metaBusinessId: string;
  metaAppId: string;
  metaAppSecret: string;
  metaRegisterPin: string;
  salvyApiKey: string;
  requesterAccessToken: string;
  payload: {
    acao?: string;
    areaCode?: number;
    waba_id?: string;
    phone_number_id?: string;
    code?: string;
  };
}

interface Provisionamento {
  salvy_id: string;
  phone_number_id: string;
  waba_id: string;
  telefone: string;
  iniciado_em: string;
}

interface CanalWhatsapp {
  numero_meta_id?: string | null;
  provisionamento?: Provisionamento | null;
  [chave: string]: unknown;
}

async function chamarSalvyApi(path: string, apiKey: string, init?: RequestInit) {
  const resposta = await fetch(`${SALVY_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (resposta.status === 204) {
    return null;
  }

  const corpo = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    const mensagem = corpo?.message || corpo?.error || 'Nao foi possivel falar com a Salvy.';
    throw new HttpError(resposta.status >= 400 && resposta.status < 500 ? 400 : 502, mensagem);
  }

  return corpo;
}

async function resolverContexto(options: Options) {
  if (!options.supabaseUrl || !options.supabaseAnonKey || !options.supabaseServiceRoleKey) {
    throw new HttpError(500, 'As credenciais do servidor nao estao configuradas.');
  }

  if (
    !options.metaSystemUserToken ||
    !options.metaBusinessId ||
    !options.metaAppId ||
    !options.metaAppSecret ||
    !options.metaRegisterPin
  ) {
    throw new HttpError(500, 'A integracao com o WhatsApp nao esta configurada no servidor.');
  }

  if (!options.salvyApiKey) {
    throw new HttpError(500, 'A integracao com a Salvy nao esta configurada no servidor.');
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
     requisicao - senao um membro poderia disparar (e pagar por) a
     criacao de um numero em nome de outro colega. */
  const { data: membro, error: membroError } = await adminClient
    .from('sales_membros_v2')
    .select('membro_id, empresa_id, nome, status, canal_whatsapp')
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

  const { data: empresa, error: empresaError } = await adminClient
    .from('sales_empresas_v2')
    .select('empresa_id, razao_social, whatsapp_waba_id')
    .eq('empresa_id', membro.empresa_id)
    .maybeSingle();

  if (empresaError) {
    throw new HttpError(500, empresaError.message);
  }

  if (!empresa) {
    throw new HttpError(400, 'Nao foi possivel identificar a empresa do seu cadastro.');
  }

  return { adminClient, membro, empresa };
}

const estadoAtual = (canal: CanalWhatsapp, empresaTemWaba: boolean) => {
  if (canal.numero_meta_id) {
    return { status: 'conectado' as const, empresa_tem_waba: empresaTemWaba };
  }

  if (canal.provisionamento) {
    return {
      status: 'aguardando_codigo' as const,
      telefone: canal.provisionamento.telefone,
      empresa_tem_waba: empresaTemWaba,
    };
  }

  return { status: 'nao_iniciado' as const, empresa_tem_waba: empresaTemWaba };
};

async function gravarCanal(
  adminClient: SupabaseClient,
  membroId: string,
  canal: CanalWhatsapp,
) {
  const { error } = await adminClient
    .from('sales_membros_v2')
    .update({ canal_whatsapp: canal })
    .eq('membro_id', membroId);

  if (error) {
    throw new HttpError(500, error.message);
  }
}

/* Numeros da Salvy vem como "+5541963475701". O endpoint da Meta que
   adiciona o numero a WABA quer o DDI e o numero nacional separados -
   como a Salvy so emite numero brasileiro, o DDI e sempre 55. */
const separarDdiNumero = (telefone: string) => {
  const digitos = telefone.replace(/\D/g, '');
  return { cc: digitos.slice(0, 2), numeroNacional: digitos.slice(2) };
};

async function consultarDdds(options: Options) {
  await resolverContexto(options);

  const resposta = await chamarSalvyApi('/virtual-phone-accounts/area-codes?available=true', options.salvyApiKey);
  const codigos = (resposta?.areaCodes || [])
    .filter((item: { available?: boolean }) => item.available)
    .map((item: { areaCode: number }) => item.areaCode)
    .sort((a: number, b: number) => a - b);

  return { ddds: codigos };
}

/* O code do Embedded Signup so vale por 30s e so serve pra uma coisa:
   trocar por um token que realmente tem acesso ao que o cliente acabou
   de compartilhar. O waba_id/phone_number_id que chegam pelo postMessage
   do FB.login sao so identificacao - sem essa troca, subscribed_apps e
   qualquer outra chamada nesse numero volta erro de permissao. */
async function trocarCodigoPorToken(options: Options, code: string) {
  const parametros = new URLSearchParams({
    client_id: options.metaAppId,
    client_secret: options.metaAppSecret,
    code,
  });

  const resposta = await fetch(`https://graph.facebook.com/v26.0/oauth/access_token?${parametros.toString()}`);
  const corpo = await resposta.json().catch(() => null);

  if (!resposta.ok || !corpo?.access_token) {
    throw new HttpError(502, corpo?.error?.message || 'Nao foi possivel confirmar a autorizacao com a Meta.');
  }

  return corpo.access_token as string;
}

async function conectarExistente(options: Options) {
  const { adminClient, membro } = await resolverContexto(options);
  const canal = (membro.canal_whatsapp ?? {}) as CanalWhatsapp;

  if (canal.numero_meta_id) {
    throw new HttpError(400, 'Voce ja tem um numero de WhatsApp conectado.');
  }

  const phoneNumberId = String(options.payload?.phone_number_id ?? '').trim();
  const code = String(options.payload?.code ?? '').trim();

  if (!phoneNumberId || !code) {
    throw new HttpError(400, 'Nao foi possivel identificar o numero conectado.');
  }

  const tokenDaSessao = await trocarCodigoPorToken(options, code);

  await chamarGraphApi(`/${phoneNumberId}/subscribed_apps`, tokenDaSessao, {
    method: 'POST',
  });

  await gravarCanal(adminClient, membro.membro_id, { numero_meta_id: phoneNumberId });

  return { status: 'conectado' as const, numero_meta_id: phoneNumberId };
}

async function definirWaba(options: Options) {
  const { adminClient, empresa } = await resolverContexto(options);
  const wabaId = String(options.payload?.waba_id ?? '').trim();

  if (!wabaId) {
    throw new HttpError(400, 'Informe o ID da WABA.');
  }

  /* Confirma que essa WABA existe e que o nosso System User realmente
     enxerga ela antes de gravar - salvar um ID invalido so apareceria
     como erro la na frente, longe de onde foi digitado. */
  const wabaResposta = await chamarGraphApi(`/${wabaId}?fields=id,name`, options.metaSystemUserToken);

  const { error } = await adminClient
    .from('sales_empresas_v2')
    .update({ whatsapp_waba_id: wabaResposta.id })
    .eq('empresa_id', empresa.empresa_id);

  if (error) {
    throw new HttpError(500, error.message);
  }

  return { salvo: true, nome: wabaResposta.name as string | undefined };
}

async function iniciarProvisionamento(options: Options) {
  const { adminClient, membro, empresa } = await resolverContexto(options);
  const canal = (membro.canal_whatsapp ?? {}) as CanalWhatsapp;

  if (canal.numero_meta_id) {
    throw new HttpError(400, 'Voce ja tem um numero de WhatsApp conectado.');
  }

  if (canal.provisionamento) {
    throw new HttpError(
      400,
      'Ja existe uma configuracao em andamento. Confirme o codigo recebido ou cancele antes de comecar outra.',
    );
  }

  const areaCode = Number(options.payload?.areaCode);

  if (!areaCode || !Number.isInteger(areaCode)) {
    throw new HttpError(400, 'Informe um DDD valido.');
  }

  const nomeEmpresa = empresa.razao_social?.trim() || 'Cliente Sales Kotta';

  /* Criar uma WABA nova via API nao existe - a Meta so aceita GET nesse
     endpoint (confirmado na documentacao oficial, POST sempre retorna
     "operation not supported"). Por isso a WABA da empresa precisa ser
     criada uma vez, manualmente, e o ID informado via acao
     "definir_waba" antes do primeiro membro dela poder configurar um
     numero. Dai em diante e tudo automatico entre os colegas. */
  const wabaId = empresa.whatsapp_waba_id as string | null;

  if (!wabaId) {
    throw new HttpError(
      400,
      'Essa empresa ainda nao tem uma WABA cadastrada. Crie uma WABA vazia na Meta e informe o ID dela antes de continuar.',
    );
  }

  const numero = await chamarSalvyApi('/virtual-phone-accounts', options.salvyApiKey, {
    method: 'POST',
    body: JSON.stringify({
      areaCode,
      name: `${nomeEmpresa} - ${membro.nome || 'sem nome'}`,
    }),
  });

  try {
    const { cc, numeroNacional } = separarDdiNumero(numero.phoneNumber);

    const phoneResposta = await chamarGraphApi(`/${wabaId}/phone_numbers`, options.metaSystemUserToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cc, phone_number: numeroNacional, verified_name: nomeEmpresa }),
    });

    const phoneNumberId = phoneResposta?.id;

    if (!phoneNumberId) {
      throw new HttpError(502, 'A Meta nao retornou o ID do numero adicionado.');
    }

    await chamarGraphApi(`/${phoneNumberId}/request_code`, options.metaSystemUserToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code_method: 'SMS', language: 'pt_BR' }),
    });

    await gravarCanal(adminClient, membro.membro_id, {
      ...canal,
      provisionamento: {
        salvy_id: numero.id,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        telefone: numero.phoneNumber,
        iniciado_em: new Date().toISOString(),
      },
    });

    return { status: 'aguardando_codigo' as const, telefone: numero.phoneNumber };
  } catch (erro) {
    /* Se algo depois da Salvy falhar, a linha ja foi paga - cancelar
       evita deixar um numero orfao cobrando sem ninguem saber. Melhor
       esforco: se o cancelamento tambem falhar, quem esta acompanhando
       ve os dois erros no log e decide na hora, ao vivo. */
    try {
      await chamarSalvyApi(`/virtual-phone-accounts/${numero.id}?reason=technical-issues`, options.salvyApiKey, {
        method: 'DELETE',
      });
    } catch (erroCancelamento) {
      console.error('Falha ao cancelar numero da Salvy apos erro no provisionamento:', erroCancelamento);
    }

    throw erro;
  }
}

async function verificarCodigo(options: Options) {
  const { adminClient, membro } = await resolverContexto(options);
  const canal = (membro.canal_whatsapp ?? {}) as CanalWhatsapp;

  if (canal.numero_meta_id) {
    return { status: 'conectado' as const, numero_meta_id: canal.numero_meta_id };
  }

  const provisionamento = canal.provisionamento;

  if (!provisionamento) {
    throw new HttpError(400, 'Nao ha nenhuma configuracao em andamento.');
  }

  const mensagens = await chamarSalvyApi(
    `/virtual-phone-accounts/${provisionamento.salvy_id}/sms-messages?page=1&pageSize=20`,
    options.salvyApiKey,
  );

  const comCodigo = (mensagens?.smsMessages || [])
    .filter((mensagem: { detections?: { whatsapp?: { verificationCode?: string } } }) =>
      Boolean(mensagem.detections?.whatsapp?.verificationCode),
    )
    .sort(
      (a: { receivedAt: string }, b: { receivedAt: string }) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    );

  const codigo = comCodigo[0]?.detections?.whatsapp?.verificationCode as string | undefined;

  if (!codigo) {
    return { status: 'aguardando_codigo' as const, telefone: provisionamento.telefone };
  }

  await chamarGraphApi(`/${provisionamento.phone_number_id}/verify_code`, options.metaSystemUserToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: codigo }),
  });

  await chamarGraphApi(`/${provisionamento.phone_number_id}/register`, options.metaSystemUserToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', pin: options.metaRegisterPin }),
  });

  await chamarGraphApi(`/${provisionamento.phone_number_id}/subscribed_apps`, options.metaSystemUserToken, {
    method: 'POST',
  });

  await gravarCanal(adminClient, membro.membro_id, {
    numero_meta_id: provisionamento.phone_number_id,
  });

  return { status: 'conectado' as const, numero_meta_id: provisionamento.phone_number_id };
}

async function cancelarProvisionamento(options: Options) {
  const { adminClient, membro } = await resolverContexto(options);
  const canal = (membro.canal_whatsapp ?? {}) as CanalWhatsapp;
  const provisionamento = canal.provisionamento;

  if (!provisionamento) {
    return { status: 'nao_iniciado' as const };
  }

  try {
    await chamarSalvyApi(`/virtual-phone-accounts/${provisionamento.salvy_id}?reason=unnecessary`, options.salvyApiKey, {
      method: 'DELETE',
    });
  } catch (erro) {
    console.error('Falha ao cancelar numero da Salvy:', erro);
  }

  const { provisionamento: _fora, ...semProvisionamento } = canal;
  await gravarCanal(adminClient, membro.membro_id, semProvisionamento);

  return { status: 'nao_iniciado' as const };
}

export async function whatsappProvisionamentoService(options: Options) {
  const acao = String(options.payload?.acao ?? 'status');

  if (acao === 'status') {
    const { membro, empresa } = await resolverContexto(options);
    return estadoAtual((membro.canal_whatsapp ?? {}) as CanalWhatsapp, Boolean(empresa.whatsapp_waba_id));
  }

  if (acao === 'definir_waba') {
    return definirWaba(options);
  }

  if (acao === 'conectar_existente') {
    return conectarExistente(options);
  }

  if (acao === 'ddds') {
    return consultarDdds(options);
  }

  if (acao === 'iniciar') {
    return iniciarProvisionamento(options);
  }

  if (acao === 'verificar') {
    return verificarCodigo(options);
  }

  if (acao === 'cancelar') {
    return cancelarProvisionamento(options);
  }

  throw new HttpError(400, 'Acao desconhecida.');
}
