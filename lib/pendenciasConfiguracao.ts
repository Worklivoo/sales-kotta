import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/* Um lugar so decide o que esta pendente nas Configuracoes. As pilulas de
   cada secao, os icones das abas e a engrenagem da barra lateral usam a
   mesma regra - senao um deles diria "pendente" e o outro nao. */

export type AbaConfiguracao =
  | 'geral'
  | 'email'
  | 'whatsapp'
  | 'notificacoes'
  | 'conhecimento'
  | 'mensagens_automaticas';

export type Pendencias = Record<AbaConfiguracao, boolean> & { plano: boolean };

const SEM_PENDENCIAS: Pendencias = {
  geral: false,
  email: false,
  whatsapp: false,
  notificacoes: false,
  conhecimento: false,
  mensagens_automaticas: false,
  plano: false,
};

const EVENTO = 'kotta:configuracao-alterada';

/* Toda tela que salva algo nas Configuracoes chama isto, para a engrenagem e
   as abas atualizarem sem recarregar a pagina. */
export const avisarConfiguracaoAlterada = () => {
  window.dispatchEvent(new Event(EVENTO));
};

// ---- regras por secao (usadas tambem dentro de cada tela) -----------------

const REGRAS_DO_SISTEMA = ['Item'];

export const temRegraDeCotacao = (regras: unknown) => {
  if (!regras || typeof regras !== 'object') return false;
  return Object.keys(regras as Record<string, unknown>).some((nome) => !REGRAS_DO_SISTEMA.includes(nome.trim()));
};

/* Follow-up conta como configurado depois de salvo uma vez, ligado ou nao:
   deixar a cadencia desligada tambem e uma escolha. */
export const followupConfigurado = (config: unknown) => {
  if (!config || typeof config !== 'object') return false;
  return Array.isArray((config as { tentativas?: unknown }).tentativas);
};

export const fonteConfigurada = (integracao: unknown) => {
  if (!integracao || typeof integracao !== 'object') return false;
  const valor = integracao as { tipo?: string | null; url?: string | null };
  return Boolean(valor.tipo || valor.url);
};

export const notificacaoConfigurada = (prefs: unknown) => {
  const p = (prefs || {}) as Record<string, unknown>;
  return Boolean(p.nova_mensagem || p.modo_semi || p.novo_cliente || p.nenhum_item);
};

export const mensagemAutomaticaConfigurada = (mensagens: unknown) => {
  if (!mensagens || typeof mensagens !== 'object') return false;
  return Object.values(mensagens as Record<string, { ativo?: boolean; mensagem?: string } | null>).some(
    (m) => Boolean(m?.ativo && m?.mensagem?.trim()),
  );
};

/* Plano em dia = assinatura paga (plano_status ATIVO) ou teste gratis ainda
   valendo. Todo o resto pede atencao: sem plano, teste vencido, primeiro Pix
   ainda nao pago (plano_status nulo), pagamento em atraso ou cancelado. */
export const planoEmDia = (empresa: {
  plano_status?: string | null;
  asaas_subscription_id?: string | null;
  cliente_status?: string | null;
  data_final_trial?: string | null;
} | null | undefined) => {
  if (!empresa) return true;
  if (empresa.asaas_subscription_id && empresa.plano_status === 'ATIVO') return true;
  return (
    empresa.cliente_status === 'TRIAL' &&
    Boolean(empresa.data_final_trial) &&
    new Date(empresa.data_final_trial as string).getTime() > Date.now()
  );
};

// ---- carga ----------------------------------------------------------------

export const carregarPendencias = async (): Promise<Pendencias> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) return SEM_PENDENCIAS;

  const { data: membro } = await supabase
    .from('sales_membros_v2')
    .select('empresa_id, cargo, canal_email, canal_whatsapp, preferencias_notificacao')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (!membro?.empresa_id) return SEM_PENDENCIAS;

  const [{ data: empresa }, { count: perguntas }] = await Promise.all([
    supabase
      .from('sales_empresas_v2')
      .select('regras_cotacao, followup_config, integracao_produtos, integracao_clientes, mensagens_automaticas_categoria, plano_status, asaas_subscription_id, cliente_status, data_final_trial')
      .eq('empresa_id', membro.empresa_id)
      .maybeSingle(),
    supabase
      .from('sales_base_conhecimento_v2')
      .select('item_id', { count: 'exact', head: true })
      .eq('empresa_id', membro.empresa_id),
  ]);

  const canalEmail = (membro.canal_email || {}) as Record<string, unknown>;
  const canalWhatsapp = (membro.canal_whatsapp || {}) as Record<string, unknown>;
  const isAdmin = membro.cargo === 'ADMIN';

  return {
    /* As secoes da aba Geral que tem pendencia so aparecem para admin. */
    geral:
      isAdmin &&
      (!temRegraDeCotacao(empresa?.regras_cotacao) ||
        !followupConfigurado(empresa?.followup_config) ||
        !fonteConfigurada(empresa?.integracao_produtos) ||
        !fonteConfigurada(empresa?.integracao_clientes)),
    email: !canalEmail.redirecionamento_validado_em || canalEmail.senha_configurada !== true,
    whatsapp: !canalWhatsapp.numero_meta_id,
    notificacoes: !notificacaoConfigurada(membro.preferencias_notificacao),
    conhecimento: (perguntas ?? 0) === 0,
    mensagens_automaticas: !mensagemAutomaticaConfigurada(empresa?.mensagens_automaticas_categoria),
    /* A aba Plano so aparece para admin. */
    plano: isAdmin && !planoEmDia(empresa),
  };
};

export const usePendenciasConfiguracao = () => {
  const [pendencias, setPendencias] = useState<Pendencias>(SEM_PENDENCIAS);

  const recarregar = useCallback(() => {
    carregarPendencias()
      .then(setPendencias)
      .catch((error) => console.error('Erro ao carregar pendências de configuração:', error));
  }, []);

  useEffect(() => {
    recarregar();
    window.addEventListener(EVENTO, recarregar);
    return () => window.removeEventListener(EVENTO, recarregar);
  }, [recarregar]);

  /* Engrenagem: so as abas das Configuracoes. O plano tem icone proprio. */
  const { plano: planoPendente, ...abas } = pendencias;
  const algumaPendente = Object.values(abas).some(Boolean);

  return { pendencias, algumaPendente, planoPendente, recarregar };
};
