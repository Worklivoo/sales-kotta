import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Pencil, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PilulaPendente } from '../../components/StatusConfiguracao';
import { avisarConfiguracaoAlterada, notificacaoConfigurada } from '../../lib/pendenciasConfiguracao';

interface NotificationPreferences {
  ativada?: boolean;
  email?: string | null;
  whatsapp?: string | null;
  nova_mensagem?: boolean;
  modo_semi?: boolean;
  novo_cliente?: boolean;
  nenhum_item?: boolean;
}

interface MemberNotificationRecord {
  membro_id: string;
  preferencias_notificacao: NotificationPreferences | null;
}

interface NotificationFormState {
  notificacao_ativada: boolean;
  notificacao_email: string;
  notificacao_whatsapp: string;
  notificacao_nova_mensagem: boolean;
  notificacao_modo_semi: boolean;
  notificacao_novo_cliente: boolean;
  notificacao_nenhum_item: boolean;
}

interface NotificationToggleDefinition {
  key: keyof Pick<
    NotificationFormState,
    | 'notificacao_nova_mensagem'
    | 'notificacao_modo_semi'
    | 'notificacao_novo_cliente'
    | 'notificacao_nenhum_item'
  >;
  title: string;
  description: React.ReactNode;
}

const NOTIFICATION_TOGGLES: NotificationToggleDefinition[] = [
  {
    key: 'notificacao_nova_mensagem',
    title: 'Nova mensagem precisa de atenção',
    description:
      'Receber notificação quando o cliente mandar uma mensagem nova fora do fluxo automático, ou responder depois que o atendimento já foi finalizado.',
  },
  {
    key: 'notificacao_modo_semi',
    title: 'Modo semi-automático',
    description:
      'Receber notificações de atendimentos que entrarem etapa de "Aguardando Aprovação"',
  },
  {
    key: 'notificacao_novo_cliente',
    title: 'Novo cliente',
    description:
      <>
        Receber notificações de atendimentos de <strong>novos clientes</strong> que entrarem
        etapa de "Aguardando Aprovação"
      </>,
  },
  {
    key: 'notificacao_nenhum_item',
    title: 'Nenhum item encontrado',
    description:
      'Receber notificação quando um cliente solicitar um orçamento e o KOTTA IA não encontrar nenhum (ou nenhum dos) item(ns) para aquela proposta no catálogo.',
  },
];

const EMPTY_NOTIFICATION_FORM: NotificationFormState = {
  notificacao_ativada: false,
  notificacao_email: '',
  notificacao_whatsapp: '',
  notificacao_nova_mensagem: false,
  notificacao_modo_semi: false,
  notificacao_novo_cliente: false,
  notificacao_nenhum_item: false,
};

const normalizeWhatsappDigits = (value: string) => {
  let digits = value.replace(/\D/g, '');

  if (digits.startsWith('55')) {
    digits = digits.slice(0, 13);
  } else {
    digits = `55${digits}`.slice(0, 13);
  }

  return digits;
};

const formatWhatsappInput = (value: string | null | undefined) => {
  const rawDigits = (value || '').replace(/\D/g, '');

  if (!rawDigits) {
    return '';
  }

  const digits = normalizeWhatsappDigits(value || '');

  if (digits.length <= 2) {
    return '+55';
  }

  const countryCode = digits.slice(0, 2);
  const areaCode = digits.slice(2, 4);
  const phoneDigits = digits.slice(4);

  let formatted = `+${countryCode}`;

  if (areaCode) {
    formatted += ` (${areaCode}`;
  }

  if (areaCode.length === 2) {
    formatted += ')';
  }

  if (phoneDigits.length > 0) {
    if (phoneDigits.length <= 5) {
      formatted += ` ${phoneDigits}`;
    } else {
      formatted += ` ${phoneDigits.slice(0, 5)}-${phoneDigits.slice(5, 9)}`;
    }
  }

  return formatted;
};

const isValidWhatsappDigits = (value: string) => normalizeWhatsappDigits(value).length === 13;

const createNotificationForm = (
  memberConfig?: MemberNotificationRecord | null,
): NotificationFormState => {
  const prefs = memberConfig?.preferencias_notificacao || {};

  return {
    notificacao_ativada: Boolean(prefs.ativada),
    notificacao_email: prefs.email?.trim() || '',
    notificacao_whatsapp: formatWhatsappInput(prefs.whatsapp),
    notificacao_nova_mensagem: Boolean(prefs.nova_mensagem),
    notificacao_modo_semi: Boolean(prefs.modo_semi),
    notificacao_novo_cliente: Boolean(prefs.novo_cliente),
    notificacao_nenhum_item: Boolean(prefs.nenhum_item),
  };
};

const hasAnyNotificationConfig = (memberConfig?: MemberNotificationRecord | null) => {
  const prefs = memberConfig?.preferencias_notificacao;

  return Boolean(
    prefs?.ativada ||
      prefs?.email?.trim() ||
      prefs?.whatsapp?.trim() ||
      prefs?.nova_mensagem ||
      prefs?.modo_semi ||
      prefs?.novo_cliente ||
      prefs?.nenhum_item,
  );
};

const NotificacoesTab: React.FC = () => {
  const [memberConfig, setMemberConfig] = useState<MemberNotificationRecord | null>(null);
  const [notificationForm, setNotificationForm] =
    useState<NotificationFormState>(EMPTY_NOTIFICATION_FORM);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadMemberNotificationConfig = async () => {
      setIsLoadingConfig(true);
      setLoadError(null);

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session?.user?.id) {
          throw new Error('Não foi possível identificar o usuário autenticado.');
        }

        const { data, error } = await supabase
          .from('sales_membros_v2')
          .select('membro_id, preferencias_notificacao')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        const nextConfig = (data as MemberNotificationRecord | null) ?? null;
        setMemberConfig(nextConfig);
        setNotificationForm(createNotificationForm(nextConfig));
      } catch (error: any) {
        console.error('Erro ao carregar configurações de notificações:', error);

        if (!isMounted) {
          return;
        }

        setMemberConfig(null);
        setNotificationForm(EMPTY_NOTIFICATION_FORM);
        setLoadError(error?.message || 'Não foi possível carregar as configurações de notificações.');
      } finally {
        if (isMounted) {
          setIsLoadingConfig(false);
        }
      }
    };

    loadMemberNotificationConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  const hasSavedConfig = useMemo(() => hasAnyNotificationConfig(memberConfig), [memberConfig]);
  const tiposPendentes =
    !isLoadingConfig && !loadError && !notificacaoConfigurada(memberConfig?.preferencias_notificacao);

  useEffect(() => {
    if (!isLoadingConfig) avisarConfiguracaoAlterada();
  }, [isLoadingConfig, tiposPendentes]);

  const handleStartEditing = () => {
    setNotificationForm(createNotificationForm(memberConfig));
    setSaveError(null);
    setSaveSuccess(null);
    setIsEditingConfig(true);
  };

  const handleCancelEditing = () => {
    setNotificationForm(createNotificationForm(memberConfig));
    setSaveError(null);
    setSaveSuccess(null);
    setIsEditingConfig(false);
  };

  const handleInputChange =
    (field: keyof Pick<NotificationFormState, 'notificacao_email' | 'notificacao_whatsapp'>) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue =
        field === 'notificacao_whatsapp'
          ? formatWhatsappInput(event.target.value)
          : event.target.value;

      setNotificationForm((current) => ({
        ...current,
        [field]: nextValue,
      }));
      setSaveError(null);
      setSaveSuccess(null);
    };

  const handleToggleField = (field: keyof Omit<NotificationFormState, 'notificacao_email' | 'notificacao_whatsapp'>) => {
    if (!isEditingConfig) {
      return;
    }

    setNotificationForm((current) => ({
      ...current,
      [field]: !current[field],
    }));
    setSaveError(null);
    setSaveSuccess(null);
  };

  const handleSaveConfig = async () => {
    if (!memberConfig?.membro_id) {
      setSaveError('Não foi possível identificar o usuário para salvar.');
      return;
    }

    const whatsappDigits = normalizeWhatsappDigits(notificationForm.notificacao_whatsapp);

    if (notificationForm.notificacao_whatsapp.trim() && !isValidWhatsappDigits(notificationForm.notificacao_whatsapp)) {
      setSaveError('Informe um WhatsApp válido no padrão +55 (DD) 99999-9999.');
      return;
    }

    const preferencias: NotificationPreferences = {
      ativada: notificationForm.notificacao_ativada,
      email: notificationForm.notificacao_email.trim() || null,
      whatsapp: notificationForm.notificacao_whatsapp.trim() ? whatsappDigits : null,
      nova_mensagem: notificationForm.notificacao_nova_mensagem,
      modo_semi: notificationForm.notificacao_modo_semi,
      novo_cliente: notificationForm.notificacao_novo_cliente,
      nenhum_item: notificationForm.notificacao_nenhum_item,
    };

    setIsSavingConfig(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const { error } = await supabase
        .from('sales_membros_v2')
        .update({ preferencias_notificacao: preferencias })
        .eq('membro_id', memberConfig.membro_id);

      if (error) {
        throw error;
      }

      setMemberConfig((current) =>
        current
          ? {
              ...current,
              preferencias_notificacao: preferencias,
            }
          : {
              membro_id: memberConfig.membro_id,
              preferencias_notificacao: preferencias,
            },
      );
      setIsEditingConfig(false);
      setSaveSuccess('Configurações de notificações salvas com sucesso.');
    } catch (error: any) {
      console.error('Erro ao salvar configurações de notificações:', error);
      setSaveError(error?.message || 'Não foi possível salvar as configurações de notificações.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const salvo = createNotificationForm(memberConfig);
  const tiposAtivos = NOTIFICATION_TOGGLES.filter((item) => salvo[item.key]);

  const Alternar = ({ ligado, onClick, rotulo }: { ligado: boolean; onClick: () => void; rotulo: string }) => (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={onClick}
      className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-pill transition-colors max-lg:mt-3 ${
        ligado ? 'bg-lime' : 'bg-stone'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-pill bg-card shadow-sm transition-transform ${
          ligado ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );

  return (
    <div className="min-h-[520px]">
      <section className="rounded-[28px] border border-line-soft bg-paper p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-stone text-ink">
              <Bell size={20} />
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[20px] font-semibold tracking-tight text-ink">Configuração de Notificações</h2>
                <PilulaPendente pendente={tiposPendentes} />
              </div>
              <p className="max-w-2xl text-sm leading-6 text-muted">
                Configure como e onde você deseja receber os alertas mais importantes da operação.
              </p>
            </div>
          </div>

          {!isLoadingConfig && !loadError ? (
            <button
              type="button"
              onClick={handleStartEditing}
              className="inline-flex h-11 items-center gap-2 self-start rounded-pill bg-lime px-5 text-sm font-semibold text-ink transition-colors hover:opacity-90"
            >
              <Pencil size={16} />
              Editar
            </button>
          ) : null}
        </div>

        <div className="mt-6 space-y-4">
          {loadError ? (
            <div className="rounded-panel border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {loadError}
            </div>
          ) : null}

          {saveSuccess ? (
            <div className="rounded-panel border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {saveSuccess}
            </div>
          ) : null}

          {isLoadingConfig ? (
            <div className="rounded-panel border border-line-soft bg-card px-4 py-6 text-sm text-muted">
              Carregando configurações de notificações...
            </div>
          ) : !loadError ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-panel border border-line-soft bg-card px-4 py-4">
                <p className="text-xs font-medium text-muted-soft">Notificações gerais</p>
                <p className="mt-2 text-sm font-semibold text-ink">{salvo.notificacao_ativada ? 'Ativadas' : 'Desativadas'}</p>
              </div>
              <div className="rounded-panel border border-line-soft bg-card px-4 py-4">
                <p className="text-xs font-medium text-muted-soft">E-mail</p>
                <p className="mt-2 break-all text-sm font-semibold text-ink">{salvo.notificacao_email || '—'}</p>
              </div>
              <div className="rounded-panel border border-line-soft bg-card px-4 py-4">
                <p className="text-xs font-medium text-muted-soft">WhatsApp</p>
                <p className="mt-2 text-sm font-semibold text-ink">{salvo.notificacao_whatsapp || '—'}</p>
              </div>
              <div className="rounded-panel border border-line-soft bg-card px-4 py-4 md:col-span-3">
                <p className="text-xs font-medium text-muted-soft">Tipos de notificação ativados</p>
                {tiposAtivos.length ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {tiposAtivos.map((item) => (
                      <li key={item.key} className="rounded-pill bg-lime/40 px-3 py-1 text-xs font-semibold text-ink">
                        {item.title}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">Nenhum tipo ativado.</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {isEditingConfig ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,20,0.55)] px-4 py-6 backdrop-blur-sm">
          <div className="absolute inset-0" aria-hidden="true" onClick={handleCancelEditing} />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="notificacoes-modal-title"
            className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-card border border-line-soft bg-card shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line-soft px-6 py-5 max-lg:px-4 max-lg:py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-lime/20 text-ink">
                  <Bell size={18} />
                </div>
                <div>
                  <h2 id="notificacoes-modal-title" className="text-base font-semibold tracking-tight text-ink">
                    Configuração de Notificações
                  </h2>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
                    Configure como e onde você deseja receber os alertas mais importantes da operação.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCancelEditing}
                  disabled={isSavingConfig}
                  className="rounded-panel border border-line bg-card px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={isSavingConfig}
                  className="inline-flex items-center gap-2 rounded-panel bg-lime px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save size={16} />
                  {isSavingConfig ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>

            {saveError ? (
              <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm font-medium text-red-600">{saveError}</div>
            ) : null}

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-paper px-6 py-5 max-lg:px-4 max-lg:py-4">
              <div className="rounded-panel border border-line-soft bg-card px-4 py-4">
                <div className="flex items-start justify-between gap-4 max-lg:flex-col">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-ink">Notificações gerais</p>
                    <p className="text-sm leading-6 text-muted">Ative ou desative o recebimento de notificações da plataforma.</p>
                  </div>
                  <Alternar
                    ligado={notificationForm.notificacao_ativada}
                    onClick={() => handleToggleField('notificacao_ativada')}
                    rotulo="Notificações gerais"
                  />
                </div>
              </div>

              <div className="grid gap-4 max-lg:grid-cols-1 md:grid-cols-2">
                <div>
                  <label htmlFor="notificacao-email" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
                    E-mail para notificações
                  </label>
                  <input
                    id="notificacao-email"
                    type="email"
                    value={notificationForm.notificacao_email}
                    onChange={handleInputChange('notificacao_email')}
                    className="mt-2 w-full rounded-panel border border-line bg-card px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25"
                    placeholder="exemplo@empresa.com"
                  />
                </div>

                <div>
                  <label htmlFor="notificacao-whatsapp" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
                    WhatsApp para notificações
                  </label>
                  <input
                    id="notificacao-whatsapp"
                    type="text"
                    value={notificationForm.notificacao_whatsapp}
                    onChange={handleInputChange('notificacao_whatsapp')}
                    className="mt-2 w-full rounded-panel border border-line bg-card px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25"
                    placeholder="+55 (11) 99999-9999"
                  />
                </div>
              </div>

              <div className="rounded-panel border border-line-soft bg-card p-4">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-ink">Tipos de notificação</p>
                  <p className="mt-1 text-sm leading-6 text-muted">Escolha quais eventos devem gerar notificações para você.</p>
                </div>

                <div className="space-y-3">
                  {NOTIFICATION_TOGGLES.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-start justify-between gap-4 rounded-panel border border-line-soft bg-paper px-4 py-4 max-lg:flex-col"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-ink">{item.title}</p>
                        <p className="text-sm leading-6 text-muted">{item.description}</p>
                      </div>
                      <Alternar
                        ligado={notificationForm[item.key]}
                        onClick={() => handleToggleField(item.key)}
                        rotulo={item.title}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default NotificacoesTab;
