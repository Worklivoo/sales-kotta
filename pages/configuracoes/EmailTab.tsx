import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Copy, Eye, EyeOff, Loader2, Mail, Pencil, Save, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface CanalEmailConfig {
  email_integracao?: string | null;
  smtp_email?: string | null;
  /* A senha nunca chega ao navegador. senha_configurada so diz se existe
     uma guardada no cofre, para a tela mostrar o estado sem revelar nada. */
  senha_configurada?: boolean | null;
  /* Encaminhamento: prova de que o e-mail que chega na caixa do cliente
     realmente cai no endereco de integracao. Ver verificarEncaminhamentoService. */
  redirecionamento_teste_em?: string | null;
  redirecionamento_teste_token?: string | null;
  redirecionamento_validado_em?: string | null;
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
    // sempre vazio: a senha nao volta do servidor. Quem quiser trocar,
    // digita de novo - e assim ninguem le a senha do colega pela tela.
    smtp_senha: '',
    smtp_host: canalEmail.smtp_host?.trim() || '',
    smtp_port: canalEmail.smtp_port?.trim() || '',
    smtp_ssl: Boolean(canalEmail.smtp_ssl),
  };
};

const hasAnyEmailConfig = (memberConfig?: MemberEmailConfigRecord | null) => {
  const canalEmail = memberConfig?.canal_email;

  return Boolean(
    canalEmail?.smtp_email?.trim() ||
      canalEmail?.senha_configurada ||
      canalEmail?.smtp_host?.trim() ||
      canalEmail?.smtp_port?.trim() ||
      canalEmail?.smtp_ssl,
  );
};

/* Uma pilula so para os dois blocos: verde quando esta pronto, vermelha
   enquanto falta. O vermelho e proposital - "pendente" tem que incomodar,
   senao o cliente acha que terminou a configuracao e nao terminou. */
const Pilula: React.FC<{ pronto: boolean; rotuloPronto?: string; rotuloPendente?: string }> = ({
  pronto,
  rotuloPronto = 'Configurado',
  rotuloPendente = 'Pendente',
}) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
      pronto
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-red-200 bg-red-50 text-red-600'
    }`}
  >
    {pronto ? <Check size={12} /> : <AlertCircle size={12} />}
    {pronto ? rotuloPronto : rotuloPendente}
  </span>
);

const EmailTab: React.FC = () => {
  const [memberConfig, setMemberConfig] = useState<MemberEmailConfigRecord | null>(null);
  const [emailConfigForm, setEmailConfigForm] = useState<EmailConfigFormState>(
    EMPTY_EMAIL_CONFIG_FORM,
  );
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [copiouEmail, setCopiouEmail] = useState(false);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isValidatingConfig, setIsValidatingConfig] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [encaminhamento, setEncaminhamento] = useState<{
    validado_em: string | null;
    teste_em: string | null;
    aguardando: boolean;
  }>({ validado_em: null, teste_em: null, aguardando: false });
  const [verificando, setVerificando] = useState(false);
  const [erroVerificacao, setErroVerificacao] = useState<string | null>(null);
  const [avisoVerificacao, setAvisoVerificacao] = useState<string | null>(null);

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
          .select('membro_id, nome, canal_email')  // o servidor ja nao grava senha aqui; ver salvarSmtpService
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
        setEncaminhamento({
          validado_em: nextConfig?.canal_email?.redirecionamento_validado_em || null,
          teste_em: nextConfig?.canal_email?.redirecionamento_teste_em || null,
          aguardando: Boolean(nextConfig?.canal_email?.redirecionamento_teste_token),
        });
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

  /* A senha nunca volta do servidor. Quando existe uma guardada e a
     pessoa ainda nao digitou outra, o campo mostra um valor mascarado de
     mentira - so para a tela dizer "esta configurada" sem revelar nada.
     Nesse estado o olhinho some: nao ha o que revelar. */
  const senhaGuardada = memberConfig?.canal_email?.senha_configurada === true;
  const mostrandoSenhaGuardada = senhaGuardada && emailConfigForm.smtp_senha === '';

  const encaminhamentoValidado = Boolean(encaminhamento.validado_em);
  const caixaDoTeste =
    memberConfig?.canal_email?.smtp_email?.trim() || '';

  /* Manda o e-mail de teste e fica olhando ate ele voltar. Quem marca
     como validado e a Triagem Global, quando o e-mail cai em
     integracao@ - por isso aqui e so espera, nao ha o que decidir. */
  const retomouEspera = useRef(false);

  const chamarVerificacao = async (acao: 'enviar' | 'status') => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('Sua sessão expirou. Entre de novo para continuar.');
    }

    const resposta = await fetch('/api/verificar-encaminhamento', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ acao }),
    });

    const corpo = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      throw new Error(corpo?.error || 'Não foi possível verificar o encaminhamento.');
    }

    return corpo as { validado_em: string | null; teste_em: string | null; aguardando: boolean };
  };

  const MSG_NAO_VOLTOU =
    'O e-mail de teste chegou na sua caixa, mas não voltou para o endereço de integração. ' +
    'Quase sempre é porque a regra de encaminhamento ainda não existe (ou não pegou esse remetente). ' +
    'Crie na sua caixa uma regra que encaminhe as mensagens recebidas para o endereço acima e teste de novo.';

  /* Fica olhando ate o e-mail voltar. Sai daqui como ele terminou, para
     quem chamou decidir a mensagem - retomar ao abrir a pagina nao pode
     dizer "enviado agora", que seria mentira. */
  const acompanharVolta = async (voltas: number) => {
    for (let tentativa = 0; tentativa < voltas; tentativa += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 5000));

      const atual = await chamarVerificacao('status');

      if (atual.validado_em) {
        setEncaminhamento(atual);
        setAvisoVerificacao('Encaminhamento validado: o e-mail de teste chegou ao KOTTA IA.');
        return true;
      }
    }

    return false;
  };

  const verificarEncaminhamento = async () => {
    // trava o efeito de retomada antes de mexer no estado, senao ele
    // veria este envio como "teste pendente" e abriria uma segunda espera
    retomouEspera.current = true;
    setVerificando(true);
    setErroVerificacao(null);
    setAvisoVerificacao(null);

    try {
      const envio = await chamarVerificacao('enviar');
      setEncaminhamento(envio);
      setAvisoVerificacao(
        'E-mail de teste enviado. Aguardando ele voltar para o seu endereço de integração...',
      );

      /* 2 minutos, olhando a cada 5s. Encaminhamento costuma ser
         instantaneo; passou disso, quase sempre e porque a regra nao
         existe ou nao pegou. */
      const voltou = await acompanharVolta(24);

      if (!voltou) {
        setEncaminhamento((atual) => ({ ...atual, aguardando: false }));
        setAvisoVerificacao(null);
        setErroVerificacao(MSG_NAO_VOLTOU);
      }
    } catch (erro: any) {
      console.error('Erro ao verificar o encaminhamento:', erro);
      setAvisoVerificacao(null);
      setErroVerificacao(erro?.message || 'Não foi possível verificar o encaminhamento.');
    } finally {
      setVerificando(false);
    }
  };

  /* Sair da pagina no meio da espera nao pode apagar o teste: ele
     continua valendo por 24h no servidor. Ao voltar, retomamos a espera
     em vez de mandar outro e-mail - e se ja passou do tempo, dizemos que
     nao voltou, em vez de fingir que nada aconteceu. */
  useEffect(() => {
    if (isLoadingConfig || retomouEspera.current) {
      return;
    }

    if (!encaminhamento.aguardando || !encaminhamento.teste_em || encaminhamento.validado_em) {
      return;
    }

    retomouEspera.current = true;

    const enviadoHa = Date.now() - new Date(encaminhamento.teste_em).getTime();
    const quando = new Date(encaminhamento.teste_em).toLocaleString('pt-BR');

    if (enviadoHa > 5 * 60 * 1000) {
      setErroVerificacao(`O teste enviado em ${quando} não voltou. ${MSG_NAO_VOLTOU}`);
      return;
    }

    (async () => {
      setVerificando(true);
      setAvisoVerificacao(
        `Teste enviado em ${quando}. Ainda aguardando ele voltar para o seu endereço de integração...`,
      );

      try {
        const restante = Math.max(1, Math.ceil((2 * 60 * 1000 - enviadoHa) / 5000));
        const voltou = await acompanharVolta(restante);

        if (!voltou) {
          setEncaminhamento((atual) => ({ ...atual, aguardando: false }));
          setAvisoVerificacao(null);
          setErroVerificacao(MSG_NAO_VOLTOU);
        }
      } catch (erro: any) {
        console.error('Erro ao retomar a verificacao:', erro);
        setAvisoVerificacao(null);
        setErroVerificacao(erro?.message || 'Não foi possível verificar o encaminhamento.');
      } finally {
        setVerificando(false);
      }
    })();
  }, [isLoadingConfig, encaminhamento.aguardando, encaminhamento.teste_em, encaminhamento.validado_em]);

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
      setSaveError(
        senhaGuardada
          ? 'Digite a senha de novo para salvar. Ela fica guardada no cofre, nao no navegador.'
          : 'Informe a senha SMTP.',
      );
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

      // valida e salva no servidor: a senha vai para o cofre, nunca para
      // a tabela de membros - qualquer colega da empresa a leria de la
      const validationResponse = await fetch('/api/smtp-config', {
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

      /* Nada de gravar daqui: quem escreveu foi o servidor, na chamada
         acima. Isto so reflete na tela o que ficou salvo - e a senha NAO
         volta, de proposito. */
      const nextCanalEmail: CanalEmailConfig = {
        ...(memberConfig.canal_email || {}),
        smtp_email: smtpEmail,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_ssl: emailConfigForm.smtp_ssl,
        senha_configurada: true,
      };

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

  const emailIntegracao = memberConfig?.canal_email?.email_integracao?.trim() || '';

  const copiarEmailIntegracao = async () => {
    try {
      await navigator.clipboard.writeText(emailIntegracao);
      setCopiouEmail(true);
      // volta ao normal sozinho; sem isso o botao fica "Copiado" para sempre
      window.setTimeout(() => setCopiouEmail(false), 2000);
    } catch {
      // navegador sem permissao de area de transferencia: o texto continua
      // selecionavel na tela, entao nao vale interromper a pessoa com erro
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
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[20px] font-semibold tracking-tight text-ink">
                  Recebimento de E-mails
                </h2>
                {isLoadingConfig ? null : <Pilula pronto={encaminhamentoValidado} />}
              </div>
              <p className="max-w-2xl text-sm leading-6 text-muted">
                Configure a sua caixa de e-mail para encaminhar as mensagens recebidas para o endereço abaixo. É
                por ele que o KOTTA IA recebe os pedidos de cotação dos seus clientes.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-panel border border-line-soft bg-card px-4 py-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
              Seu e-mail de integração
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 break-all text-sm font-semibold text-ink">
                {isLoadingConfig ? 'Carregando...' : emailIntegracao || 'Ainda não gerado'}
              </p>

              {emailIntegracao ? (
                <button
                  type="button"
                  onClick={copiarEmailIntegracao}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-panel border border-line bg-card px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-ink/25"
                >
                  {copiouEmail ? <Check size={13} /> : <Copy size={13} />}
                  {copiouEmail ? 'Copiado' : 'Copiar'}
                </button>
              ) : null}
            </div>

            <p className="mt-3 text-xs leading-5 text-muted">
              {emailIntegracao ? (
                <>
                  Esse endereço é <strong className="text-ink">seu</strong>, não da empresa: cada pessoa do time
                  conecta a própria caixa, e é assim que o atendimento nasce com dono e a resposta ao cliente sai
                  pelo e-mail certo.
                </>
              ) : (
                <>
                  Seu endereço ainda não foi gerado. Fale com o administrador da empresa — sem ele, os e-mails
                  encaminhados não chegam ao KOTTA IA.
                </>
              )}
            </p>
          </div>

          {/* Configurar o encaminhamento e dizer que configurou sao coisas
              diferentes. Aqui o circuito e fechado de verdade: mandamos um
              e-mail para a caixa do cliente e esperamos ele voltar. */}
          {emailIntegracao ? (
            <div className="mt-4 rounded-panel border border-line-soft bg-card px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-ink">Testar o encaminhamento</p>
                  <p className="max-w-xl text-xs leading-5 text-muted">
                    {encaminhamento.aguardando && !encaminhamentoValidado ? (
                      <>
                        Teste enviado
                        {encaminhamento.teste_em
                          ? ` em ${new Date(encaminhamento.teste_em).toLocaleString('pt-BR')}`
                          : ''}
                        . Ele só é dado como validado quando voltar para o endereço acima.
                      </>
                    ) : encaminhamentoValidado ? (
                      <>
                        Último teste chegou ao KOTTA IA
                        {encaminhamento.validado_em
                          ? ` em ${new Date(encaminhamento.validado_em).toLocaleString('pt-BR')}`
                          : ''}
                        . Rode de novo sempre que mexer na regra da sua caixa.
                      </>
                    ) : (
                      <>
                        Enviamos um e-mail para{' '}
                        <strong className="text-ink">{caixaDoTeste || 'o seu e-mail'}</strong> e conferimos se ele
                        volta para o endereço acima. É a única forma de saber que o encaminhamento está de pé.
                      </>
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={verificarEncaminhamento}
                  disabled={verificando || isLoadingConfig}
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-panel bg-ink px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-60"
                >
                  {verificando ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  {verificando ? 'Verificando...' : encaminhamentoValidado ? 'Verificar de novo' : 'Verificar'}
                </button>
              </div>

              {avisoVerificacao ? (
                <p
                  className={`mt-3 rounded-panel border px-3 py-2 text-xs leading-5 ${
                    encaminhamentoValidado
                      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                      : 'border-line-soft bg-paper text-muted'
                  }`}
                >
                  {avisoVerificacao}
                </p>
              ) : null}

              {erroVerificacao ? (
                <p className="mt-3 rounded-panel border border-red-100 bg-red-50 px-3 py-2 text-xs leading-5 text-red-600">
                  {erroVerificacao}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="rounded-[28px] border border-line-soft bg-paper p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-stone text-ink">
                <Mail size={20} />
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[20px] font-semibold tracking-tight text-ink">
                    Envio de E-mails
                  </h2>
                  {isLoadingConfig ? null : <Pilula pronto={senhaGuardada} />}
                </div>
                <p className="max-w-2xl text-sm leading-6 text-muted">
                  Configure os dados SMTP que serão usados para responder as cotações pelo seu
                  próprio e-mail. É por aqui que a resposta sai com o seu endereço, e não com o
                  nosso.
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
                    type={mostrandoSenhaGuardada || !isPasswordVisible ? 'password' : 'text'}
                    value={mostrandoSenhaGuardada ? '••••••••••' : emailConfigForm.smtp_senha}
                    onChange={handleInputChange('smtp_senha')}
                    disabled={!isEditingConfig || isLoadingConfig}
                    className="w-full rounded-panel border border-line bg-card px-4 py-3 pr-12 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25 disabled:cursor-default disabled:bg-paper disabled:text-muted"
                    placeholder={
                      isLoadingConfig
                        ? 'Carregando...'
                        : senhaGuardada
                          ? 'Digite para trocar a senha'
                          : 'Digite a senha do SMTP'
                    }
                  />
                  {mostrandoSenhaGuardada ? null : (
                    <button
                      type="button"
                      onClick={() => setIsPasswordVisible((current) => !current)}
                      disabled={isLoadingConfig}
                      className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-tile text-muted-soft transition-colors hover:bg-stone hover:text-ink disabled:cursor-default disabled:opacity-60"
                      aria-label={isPasswordVisible ? 'Ocultar senha SMTP' : 'Mostrar senha SMTP'}
                    >
                      {isPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  )}
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
