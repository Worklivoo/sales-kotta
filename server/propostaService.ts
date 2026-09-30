import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { HttpError } from './createMemberService.js';
import {
  formatarEndereco,
  gerarProposta,
  montarCondicoes,
  normalizarDados,
  normalizarModelo,
  type CondicaoProposta,
  type DadosProposta,
} from '../lib/modeloProposta.js';

/* POST /api/proposta/render: devolve o HTML da proposta (o mesmo que vira PDF), o valor
   total e o texto de resumo. NAO grava nada.

   Dois jeitos de autenticar:
   - portal: Bearer da sessao do Supabase. A empresa vem SEMPRE da sessao, nunca do body,
     para uma empresa nao conseguir ler o modelo nem a base de conhecimento de outra.
   - n8n: header x-service-token igual a PROPOSTA_SERVICE_TOKEN. Como o token e de
     confianca (so o n8n tem), a empresa vem do body (empresa_id). */

export interface PropostaServiceEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  propostaServiceToken: string;
}

interface PropostaRenderOptions {
  env: PropostaServiceEnv;
  requesterAccessToken: string;
  serviceToken: string;
  body: unknown;
}

export interface PropostaRenderResult {
  html: string;
  valor_total: number;
  resumo: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const tokenConfere = (recebido: string, esperado: string) => {
  if (!recebido || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
};

const buildAdminClient = (env: PropostaServiceEnv) => {
  if (!env.supabaseUrl || !env.supabaseAnonKey || !env.supabaseServiceRoleKey) {
    throw new HttpError(500, 'Credenciais do servidor para a proposta nao estao configuradas.');
  }

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return {
    publicClient: createClient(env.supabaseUrl, env.supabaseAnonKey, options),
    adminClient: createClient(env.supabaseUrl, env.supabaseServiceRoleKey, options),
  };
};

const resolverEmpresaId = async (
  { env, requesterAccessToken, serviceToken }: PropostaRenderOptions,
  clients: ReturnType<typeof buildAdminClient>,
  bodyEmpresaId: unknown,
) => {
  if (serviceToken) {
    if (!tokenConfere(serviceToken, env.propostaServiceToken)) {
      throw new HttpError(401, 'Token de servico invalido.');
    }
    if (typeof bodyEmpresaId !== 'string' || !UUID.test(bodyEmpresaId)) {
      throw new HttpError(400, 'Informe a empresa (empresa_id).');
    }
    return bodyEmpresaId;
  }

  if (!requesterAccessToken) {
    throw new HttpError(401, 'Nao foi possivel validar o usuario autenticado.');
  }

  const { data: userData, error: userError } = await clients.publicClient.auth.getUser(requesterAccessToken);
  if (userError || !userData?.user?.id) {
    throw new HttpError(401, 'Nao foi possivel validar o usuario autenticado.');
  }

  const { data: membro, error } = await clients.adminClient
    .from('sales_membros_v2')
    .select('empresa_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!membro?.empresa_id) throw new HttpError(400, 'Nao foi possivel identificar a empresa do usuario atual.');

  return membro.empresa_id as string;
};

/** Texto que a empresa ja deu na base de conhecimento, na ordem que ela escolheu no modelo. */
const carregarCondicoes = async (
  adminClient: ReturnType<typeof buildAdminClient>['adminClient'],
  empresaId: string,
  codigos: string[],
): Promise<CondicaoProposta[]> => {
  if (codigos.length === 0) return [];

  const { data, error } = await adminClient
    .from('sales_base_conhecimento_v2')
    .select('codigo_padrao, resposta')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .in('codigo_padrao', codigos);

  if (error) throw new HttpError(500, error.message);

  return montarCondicoes(codigos, data || []);
};

export const propostaRenderService = async (options: PropostaRenderOptions): Promise<PropostaRenderResult> => {
  const { body } = options;
  const corpo = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

  let dados: DadosProposta;
  try {
    dados = normalizarDados(corpo.dados);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Dados da proposta invalidos.');
  }

  const clients = buildAdminClient(options.env);
  const empresaId = await resolverEmpresaId(options, clients, corpo.empresa_id);

  const { data: empresa, error: empresaError } = await clients.adminClient
    .from('sales_empresas_v2')
    .select('razao_social, cnpj, email_responsavel, telefone_responsavel, endereco_faturamento, logo_url, texto_rodape_pdf, modelo_proposta')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (empresaError) throw new HttpError(500, empresaError.message);
  if (!empresa) throw new HttpError(400, 'Nao foi possivel identificar a empresa.');

  // Modelo enviado no body (previa de uma edicao ainda nao salva) tem prioridade sobre o gravado.
  const base = normalizarModelo(corpo.modelo ?? empresa.modelo_proposta);
  const modelo = {
    ...base,
    // Logo mora em sales_empresas_v2.logo_url, nao dentro do jsonb.
    logoUrl: normalizarModelo({ logoUrl: empresa.logo_url }).logoUrl,
    // Observacoes: o que a empresa configurou; sem isso, o texto antigo do rodape do PDF.
    observacoes: base.observacoes || String(empresa.texto_rodape_pdf || '').trim(),
  };

  // Emitente: o que o chamador mandar vale; o que faltar (ex.: o endereco, que o n8n nao tem) vem do cadastro da empresa.
  dados = {
    ...dados,
    emitente: {
      nome: dados.emitente.nome || String(empresa.razao_social || ''),
      cnpj: dados.emitente.cnpj || String(empresa.cnpj || '') || undefined,
      email: dados.emitente.email || String(empresa.email_responsavel || '') || undefined,
      telefone: dados.emitente.telefone || String(empresa.telefone_responsavel || '') || undefined,
      endereco: dados.emitente.endereco || formatarEndereco(empresa.endereco_faturamento),
    },
  };

  if (dados.condicoes === undefined) {
    dados = { ...dados, condicoes: await carregarCondicoes(clients.adminClient, empresaId, modelo.condicoesCodigos) };
  }

  const resultado = gerarProposta(dados, modelo);

  return { html: resultado.html, valor_total: resultado.valorTotal, resumo: resultado.resumo };
};
