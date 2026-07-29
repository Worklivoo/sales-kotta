import React, { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Mail, Pencil, Save, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const SMTP_VALIDATION_WEBHOOK_URL =
  'https://primary-systec.up.railway.app/webhook/f76854a9-c075-4945-820e-b5bcb92ddafd';

interface MemberEmailConfigRecord {
  membro_id: string;
  nome: string | null;
  smtp_email: string | null;
  smtp_senha: string | null;
  smtp_host: string | null;
  smtp_port: string | null;
  smtp_ssl: boolean | null;
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
): EmailConfigFormState => ({
  smtp_email: memberConfig?.smtp_email?.trim() || '',
  smtp_senha: memberConfig?.smtp_senha?.trim() || '',
  smtp_host: memberConfig?.smtp_host?.trim() || '',
  smtp_port: memberConfig?.smtp_port?.trim() || '',
  smtp_ssl: Boolean(memberConfig?.smtp_ssl),
});

const hasAnyEmailConfig = (memberConfig?: MemberEmailConfigRecord | null) =>
  Boolean(
    memberConfig?.smtp_email?.trim() ||
      memberConfig?.smtp_senha?.trim() ||
      memberConfig?.smtp_host?.trim() ||
      memberConfig?.smtp_port?.trim() ||
      memberConfig?.smtp_ssl,
  );

const extractWebhookResultado = (responseBody: unknown) => {
  if (Array.isArray(responseBody)) {
    const firstItem = responseBody[0];

    if (
      firstItem &&
      typeof firstItem === 'object' &&
      'resultado' in firstItem &&
      typeof firstItem.resultado === 'string'
    ) {
      return firstItem.resultado;
    }
  }

  if (
    responseBody &&
    typeof responseBody === 'object' &&
    'resultado' in responseBody &&
    typeof responseBody.resultado === 'string'
  ) {
    return responseBody.resultado;
  }

  return '';
};

const EmailTab: React.FC = () => {
  const [memberConfig, setMemberConfig] = useState<MemberEmailConfigRecord | null>(null);
  const [emailConfigForm, setEmailConfigForm] = useState<EmailConfigFormState>(
    EMPTY_EMAIL_CONFIG_FORM,
  );
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
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
          .from('sales_membros_empresa')
          .select('membro_id, nome, smtp_email, smtp_senha, smtp_host, smtp_port, smtp_ssl')
          .eq('membro_id', session.user.id)
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

    try {
      const payload = {
        smtp_email: smtpEmail,
        smtp_senha: smtpSenha,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_ssl: emailConfigForm.smtp_ssl,
      };

      const validationResponse = await fetch(SMTP_VALIDATION_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nome: memberName,
          ...payload,
        }),
      });

      const validationText = await validationResponse.text();
      let validationBody: unknown = null;

      try {
        validationBody = validationText ? JSON.parse(validationText) : null;
      } catch {
        validationBody = null;
      }

      const validationResultado = extractWebhookResultado(validationBody);

      if (!validationResponse.ok) {
        throw new Error(
          validationResultado || 'Não foi possível validar as configurações SMTP.',
        );
      }

      if (validationResultado !== 'VALIDADO') {
        setSaveError(
          validationResultado ||
            'Não foi possível validar as configurações SMTP. Revise os dados e tente novamente.',
        );
        return;
      }

      const { error } = await supabase
        .from('sales_membros_empresa')
        .update(payload)
        .eq('membro_id', memberConfig.membro_id);

      if (error) {
        throw error;
      }

      setMemberConfig((current) =>
        current
          ? {
              ...current,
              ...payload,
            }
          : {
              membro_id: memberConfig.membro_id,
              nome: memberConfig.nome,
              ...payload,
            },
      );
      setIsEditingConfig(false);
      setIsPasswordVisible(false);
      setSaveSuccess('Configurações de email salvas com sucesso.');
    } catch (error: any) {
      console.error('Erro ao salvar configurações de email:', error);
      setSaveError(error?.message || 'Não foi possível salvar as configurações de email.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  return (
    <div className="min-h-[520px]">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_320px]">
        <section className="rounded-[28px] border border-black/5 bg-[#FCFCFC] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F3F4F6] text-gray-700">
                <Mail size={20} />
              </div>

              <div className="space-y-1">
                <h2 className="text-[20px] font-semibold tracking-tight text-gray-900">
                  Configuração de Email
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-gray-500">
                  Configure os dados SMTP que serão usados para receber e responder as cotações pelo
                  seu próprio e-mail.
                </p>
              </div>
            </div>

            {hasSavedConfig && !isEditingConfig ? (
              <button
                type="button"
                onClick={handleStartEditing}
                className="inline-flex h-11 items-center gap-2 self-start rounded-2xl bg-[#F5F5F5] px-5 text-sm font-semibold text-gray-900 transition-colors hover:bg-[#EEEEEE]"
              >
                <Pencil size={16} />
                Editar
              </button>
            ) : null}
          </div>

          <div className="mt-6 space-y-4">
            {loadError ? (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {loadError}
              </div>
            ) : null}

            {saveError ? (
              <div className="whitespace-pre-line rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-600">
                {saveError}
              </div>
            ) : null}

            {saveSuccess ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                {saveSuccess}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label
                  htmlFor="smtp-email"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                >
                  E-mail SMTP
                </label>
                <input
                  id="smtp-email"
                  type="email"
                  value={emailConfigForm.smtp_email}
                  onChange={handleInputChange('smtp_email')}
                  disabled={!isEditingConfig || isLoadingConfig}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20 disabled:cursor-default disabled:bg-[#F7F7F7] disabled:text-gray-500"
                  placeholder={isLoadingConfig ? 'Carregando...' : 'exemplo@empresa.com'}
                />
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="smtp-senha"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
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
                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 pr-12 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20 disabled:cursor-default disabled:bg-[#F7F7F7] disabled:text-gray-500"
                    placeholder={isLoadingConfig ? 'Carregando...' : 'Digite a senha do SMTP'}
                  />
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible((current) => !current)}
                    disabled={isLoadingConfig}
                    className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-[#F5F5F5] hover:text-gray-700 disabled:cursor-default disabled:opacity-60"
                    aria-label={isPasswordVisible ? 'Ocultar senha SMTP' : 'Mostrar senha SMTP'}
                  >
                    {isPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="smtp-host"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                >
                  Host SMTP
                </label>
                <input
                  id="smtp-host"
                  type="text"
                  value={emailConfigForm.smtp_host}
                  onChange={handleInputChange('smtp_host')}
                  disabled={!isEditingConfig || isLoadingConfig}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20 disabled:cursor-default disabled:bg-[#F7F7F7] disabled:text-gray-500"
                  placeholder={isLoadingConfig ? 'Carregando...' : 'smtp.empresa.com'}
                />
              </div>

              <div>
                <label
                  htmlFor="smtp-port"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                >
                  Porta SMTP
                </label>
                <input
                  id="smtp-port"
                  type="text"
                  value={emailConfigForm.smtp_port}
                  onChange={handleInputChange('smtp_port')}
                  disabled={!isEditingConfig || isLoadingConfig}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20 disabled:cursor-default disabled:bg-[#F7F7F7] disabled:text-gray-500"
                  placeholder={isLoadingConfig ? 'Carregando...' : '587'}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-black/5 bg-white px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-gray-900">SSL do servidor</p>
                  <p className="text-sm leading-6 text-gray-500">
                    Ative esta opção quando o seu provedor SMTP exigir conexão segura via SSL.
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={emailConfigForm.smtp_ssl}
                  disabled={!isEditingConfig || isLoadingConfig}
                  onClick={handleToggleSsl}
                  className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${
                    emailConfigForm.smtp_ssl ? 'bg-[#D9F06B]' : 'bg-[#E5E7EB]'
                  } disabled:cursor-default disabled:opacity-60`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                      emailConfigForm.smtp_ssl ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {isEditingConfig ? (
              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                {hasSavedConfig ? (
                  <button
                    type="button"
                    onClick={handleCancelEditing}
                    disabled={isSavingConfig}
                    className="rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={isSavingConfig || isLoadingConfig}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#EBF57D] px-4 py-2.5 text-sm font-semibold text-gray-900 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save size={16} />
                  {isSavingConfig ? 'Salvando...' : 'Salvar configurações'}
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[28px] border border-black/5 bg-[#FCFCFC] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-gray-700 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                <ShieldCheck size={18} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold tracking-tight text-gray-900">
                  Status atual
                </h3>
                <p className="text-sm leading-6 text-gray-500">
                  Visualize rapidamente se o seu email SMTP já foi configurado.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-black/5 bg-white p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
                Configuração
              </p>
              <p className="mt-2 text-sm font-semibold text-gray-900">
                {isLoadingConfig
                  ? 'Carregando...'
                  : hasSavedConfig
                    ? 'SMTP configurado'
                    : 'SMTP ainda não configurado'}
              </p>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-black/5 bg-white p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
                  E-mail atual
                </p>
                <p className="mt-2 break-all text-sm font-semibold text-gray-900">
                  {isLoadingConfig ? 'Carregando...' : memberConfig?.smtp_email?.trim() || '-'}
                </p>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
                  Host / Porta
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-900">
                  {isLoadingConfig
                    ? 'Carregando...'
                    : memberConfig?.smtp_host?.trim() && memberConfig?.smtp_port?.trim()
                      ? `${memberConfig.smtp_host}:${memberConfig.smtp_port}`
                      : '-'}
                </p>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
                  SSL
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-900">
                  {isLoadingConfig ? 'Carregando...' : memberConfig?.smtp_ssl ? 'Ativo' : 'Inativo'}
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default EmailTab;
