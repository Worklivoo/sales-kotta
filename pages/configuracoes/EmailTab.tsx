import React, { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Mail, Pencil, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface CanalEmailConfig {
  email_integracao?: string | null;
  smtp_email?: string | null;
  smtp_senha?: string | null;
  smtp_host?: string | null;
  smtp_port?: string | null;
  smtp_ssl?: boolean | null;
}

interface MemberEmailConfigRecord {
  membro_id: string;
  nome: string | null;
  canal_email: CanalEmailConfig | null;
}

interface EmailConfigFormState {
  smtp_email: string;
  smtp_senha: string;
  smtp_host: string;
  smtp_port: string;
  smtp_ssl: boolean;
}

const EMPTY_EMAIL_CONFIG_FORM: EmailConfigFormState = {
  smtp_email: '',
  smtp_senha: '',
  smtp_host: '',
  smtp_port: '',
  smtp_ssl: false,
};

const createEmailConfigForm = (
  memberConfig?: MemberEmailConfigRecord | null,
): EmailConfigFormState => {
  const canalEmail = memberConfig?.canal_email || {};

  return {
    smtp_email: canalEmail.smtp_email?.trim() || '',
    smtp_senha: canalEmail.smtp_senha?.trim() || '',
    smtp_host: canalEmail.smtp_host?.trim() || '',
    smtp_port: canalEmail.smtp_port?.trim() || '',
    smtp_ssl: Boolean(canalEmail.smtp_ssl),
  };
};

const hasAnyEmailConfig = (memberConfig?: MemberEmailConfigRecord | null) => {
  const canalEmail = memberConfig?.canal_email;

  return Boolean(
    canalEmail?.smtp_email?.trim() ||
      canalEmail?.smtp_senha?.trim() ||
      canalEmail?.smtp_host?.trim() ||
      canalEmail?.smtp_port?.trim() ||
      canalEmail?.smtp_ssl,
  );
};

const EmailTab: React.FC = () => {
  const [memberConfig, setMemberConfig] = useState<MemberEmailConfigRecord | null>(null);
  const [emailConfigForm, setEmailConfigForm] = useState<EmailConfigFormState>(
    EMPTY_EMAIL_CONFIG_FORM,
  );
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isValidatingConfig, setIsValidatingConfig] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadMemberEmailConfig = async () => {
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
          .select('membro_id, nome, canal_email')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        const nextConfig = (data as MemberEmailConfigRecord | null) ?? null;
        setMemberConfig(nextConfig);
        setEmailConfigForm(createEmailConfigForm(nextConfig));
        setIsEditingConfig(!hasAnyEmailConfig(nextConfig));
      } catch (error: any) {
        console.error('Erro ao carregar configurações de email:', error);

        if (!isMounted) {
          return;
        }

        setMemberConfig(null);
        setEmailConfigForm(EMPTY_EMAIL_CONFIG_FORM);
        setLoadError(error?.message || 'Não foi possível carregar as configurações de email.');
      } finally {
        if (isMounted) {
          setIsLoadingConfig(false);
        }
      }
    };

    loadMemberEmailConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  const hasSavedConfig = useMemo(() => hasAnyEmailConfig(memberConfig), [memberConfig]);

  const handleStartEditing = () => {
    setEmailConfigForm(createEmailConfigForm(memberConfig));
    setSaveError(null);
    setSaveSuccess(null);
    setIsEditingConfig(true);
  };

  const handleCancelEditing = () => {
    setEmailConfigForm(createEmailConfigForm(memberConfig));
    setSaveError(null);
    setSaveSuccess(null);
    setIsEditingConfig(false);
    setIsPasswordVisible(false);
  };

  const handleInputChange =
    (field: keyof Omit<EmailConfigFormState, 'smtp_ssl'>) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;

      setEmailConfigForm((current) => ({
        ...current,
        [field]: nextValue,
      }));
      setSaveError(null);
      setSaveSuccess(null);
    };

  const handleToggleSsl = () => {
    if (!isEditingConfig) {
      return;
    }

    setEmailConfigForm((current) => ({
      ...current,
      smtp_ssl: !current.smtp_ssl,
    }));
    setSaveError(null);
    setSaveSuccess(null);
  };

  const handleSaveConfig = async () => {
    if (!memberConfig?.membro_id) {
      setSaveError('Não foi possível identificar o usuário para salvar.');
      return;
    }

    const memberName = memberConfig.nome?.trim() || '';

    const smtpEmail = emailConfigForm.smtp_email.trim();
    const smtpSenha = emailConfigForm.smtp_senha.trim();
    const smtpHost = emailConfigForm.smtp_host.trim();
    const smtpPort = emailConfigForm.smtp_port.trim();

    if (!memberName) {
      setSaveError('Não foi possível identificar o nome do usuário autenticado.');
      return;
    }

    if (!smtpEmail) {
      setSaveError('Informe o e-mail SMTP.');
      return;
    }

    if (!smtpSenha) {
      setSaveError('Informe a senha SMTP.');
      return;
    }

    if (!smtpHost) {
      setSaveError('Informe o host SMTP.');
      return;
    }

    if (!smtpPort) {
      setSaveError('Informe a porta SMTP.');
      return;
    }

    setIsSavingConfig(true);
    setSaveError(null);
    setSaveSuccess(null);
    setIsValidatingConfig(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.access_token) {
        throw new Error('Não foi possível identificar a sessão atual do usuário.');
      }

      const validationResponse = await fetch('/api/validate-smtp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          smtp_email: smtpEmail,
          smtp_senha: smtpSenha,
          smtp_host: smtpHost,
          smtp_port: smtpPort,
          smtp_ssl: emailConfigForm.smtp_ssl,
        }),
      });

      const validationBody = await validationResponse.json().catch(() => null);

      if (!validationResponse.ok) {
        throw new Error(validationBody?.error || 'Não foi possível validar as configurações SMTP.');
      }

      if (validationBody?.validated !== true) {
        setIsValidatingConfig(false);
        setSaveError(
          validationBody?.resultado ||
            'Não foi possível validar as configurações SMTP. Revise os dados e tente novamente.',
        );
        return;
      }

      setIsValidatingConfig(false);

      const nextCanalEmail: CanalEmailConfig = {
        ...(memberConfig.canal_email || {}),
        smtp_email: smtpEmail,
        smtp_senha: smtpSenha,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_ssl: emailConfigForm.smtp_ssl,
      };

      const { error } = await supabase
        .from('sales_membros_v2')
        .update({ canal_email: nextCanalEmail })
        .eq('membro_id', memberConfig.membro_id);

      if (error) {
        throw error;
      }

      setMemberConfig((current) =>
        current
          ? {
              ...current,
              canal_email: nextCanalEmail,
            }
          : {
              membro_id: memberConfig.membro_id,
              nome: memberConfig.nome,
              canal_email: nextCanalEmail,
            },
      );
      setIsEditingConfig(false);
      setIsPasswordVisible(false);
      setSaveSuccess('Configurações de email salvas com sucesso.');
    } catch (error: any) {
      console.error('Erro ao salvar configurações de email:', error);
      setSaveError(error?.message || 'Não foi possível salvar as configurações de email.');
    } finally {
      setIsValidatingConfig(false);
      setIsSavingConfig(false);
    }
  };

  return (
    <div className="min-h-[520px]">
      <div className="space-y-5">
        <section className="rounded-[28px] border border-line-soft bg-paper p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-stone text-ink">
              <Mail size={20} />
            </div>

            <div className="space-y-1">
              <h2 className="text-[20px] font-semibold tracking-tight text-ink">
                Envio de E-mails
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-muted">
                Este é o e-mail de integração usado para o envio das mensagens da sua operação.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-panel border border-line-soft bg-card px-4 py-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
              E-mail de integração
            </p>
            <p className="mt-2 break-all text-sm font-semibold text-ink">
              {isLoadingConfig
                ? 'Carregando...'
                : memberConfig?.canal_email?.email_integracao?.trim() || '-'}
            </p>
          </div>
        </section>

        <section className="rounded-[28px] border border-line-soft bg-paper p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-stone text-ink">
                <Mail size={20} />
              </div>

              <div className="space-y-1">
                <h2 className="text-[20px] font-semibold tracking-tight text-ink">
                  Recebimento de E-mails
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-muted">
                  Configure os dados SMTP que serão usados para receber e responder as cotações pelo
                  seu próprio e-mail.
                </p>
              </div>
            </div>

            {hasSavedConfig && !isEditingConfig ? (
              <button
                type="button"
                onClick={handleStartEditing}
                className="inline-flex h-11 items-center gap-2 self-start rounded-panel bg-stone px-5 text-sm font-semibold text-ink transition-colors hover:bg-stone"
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

            {saveError ? (
              <div className="whitespace-pre-line rounded-panel border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-600">
                {saveError}
              </div>
            ) : null}

            {saveSuccess ? (
              <div className="rounded-panel border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                {saveSuccess}
              </div>
            ) : null}

            <div className="grid gap-4 max-lg:grid-cols-1 md:grid-cols-2">
              <div className="md:col-span-2">
                <label
                  htmlFor="smtp-email"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft"
                >
                  E-mail SMTP
                </label>
                <input
                  id="smtp-email"
                  type="email"
                  value={emailConfigForm.smtp_email}
                  onChange={handleInputChange('smtp_email')}
                  disabled={!isEditingConfig || isLoadingConfig}
                  className="mt-2 w-full rounded-panel border border-line bg-card px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25 disabled:cursor-default disabled:bg-paper disabled:text-muted"
                  placeholder={isLoadingConfig ? 'Carregando...' : 'exemplo@empresa.com'}
                />
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="smtp-senha"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft"
                >
                  Senha SMTP
                </label>
                <div className="relative mt-2">
                  <input
                    id="smtp-senha"
                    type={isPasswordVisible ? 'text' : 'password'}
                    value={emailConfigForm.smtp_senha}
                    onChange={handleInputChange('smtp_senha')}
                    disabled={!isEditingConfig || isLoadingConfig}
                    className="w-full rounded-panel border border-line bg-card px-4 py-3 pr-12 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25 disabled:cursor-default disabled:bg-paper disabled:text-muted"
                    placeholder={isLoadingConfig ? 'Carregando...' : 'Digite a senha do SMTP'}
                  />
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible((current) => !current)}
                    disabled={isLoadingConfig}
                    className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-tile text-muted-soft transition-colors hover:bg-stone hover:text-ink disabled:cursor-default disabled:opacity-60"
                    aria-label={isPasswordVisible ? 'Ocultar senha SMTP' : 'Mostrar senha SMTP'}
                  >
                    {isPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="smtp-host"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft"
                >
                  Host SMTP
                </label>
                <input
                  id="smtp-host"
                  type="text"
                  value={emailConfigForm.smtp_host}
                  onChange={handleInputChange('smtp_host')}
                  disabled={!isEditingConfig || isLoadingConfig}
                  className="mt-2 w-full rounded-panel border border-line bg-card px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25 disabled:cursor-default disabled:bg-paper disabled:text-muted"
                  placeholder={isLoadingConfig ? 'Carregando...' : 'smtp.empresa.com'}
                />
              </div>

              <div>
                <label
                  htmlFor="smtp-port"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft"
                >
                  Porta SMTP
                </label>
                <input
                  id="smtp-port"
                  type="text"
                  value={emailConfigForm.smtp_port}
                  onChange={handleInputChange('smtp_port')}
                  disabled={!isEditingConfig || isLoadingConfig}
                  className="mt-2 w-full rounded-panel border border-line bg-card px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25 disabled:cursor-default disabled:bg-paper disabled:text-muted"
                  placeholder={isLoadingConfig ? 'Carregando...' : '587'}
                />
              </div>
            </div>

            <div className="rounded-panel border border-line-soft bg-card px-4 py-4">
              <div className="flex items-start justify-between gap-4 max-lg:flex-col">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-ink">SSL do servidor</p>
                  <p className="text-sm leading-6 text-muted">
                    Ative esta opção quando o seu provedor SMTP exigir conexão segura via SSL.
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={emailConfigForm.smtp_ssl}
                  disabled={!isEditingConfig || isLoadingConfig}
                  onClick={handleToggleSsl}
                  className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-pill transition-colors max-lg:mt-3 ${
                    emailConfigForm.smtp_ssl ? 'bg-lime' : 'bg-stone'
                  } disabled:cursor-default disabled:opacity-60`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-pill bg-card shadow-sm transition-transform ${
                      emailConfigForm.smtp_ssl ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {isEditingConfig ? (
              <div className="flex flex-wrap items-center justify-end gap-3 pt-2 max-lg:flex-col-reverse max-lg:items-stretch">
                {hasSavedConfig ? (
                  <button
                    type="button"
                    onClick={handleCancelEditing}
                    disabled={isSavingConfig}
                    className="rounded-panel border border-line bg-card px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60 max-lg:w-full max-lg:text-center"
                  >
                    Cancelar
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={isSavingConfig || isLoadingConfig}
                  className="inline-flex items-center gap-2 rounded-panel bg-lime px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 max-lg:w-full max-lg:justify-center"
                >
                  <Save size={16} />
                  {isValidatingConfig
                    ? 'Validando conexão...'
                    : isSavingConfig
                      ? 'Salvando...'
                      : 'Salvar configurações'}
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
};

export default EmailTab;
