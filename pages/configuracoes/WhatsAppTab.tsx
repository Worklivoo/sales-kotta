import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, Check, Link2, Loader2, MessageCircle, Pencil, Plus, Save, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

declare global {
  interface Window {
    FB?: {
      init: (config: { appId: string; version: string; xfbml?: boolean }) => void;
      login: (
        callback: (resposta: { authResponse?: { code?: string } }) => void,
        options: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const FACEBOOK_SDK_URL = 'https://connect.facebook.net/pt_BR/sdk.js';

interface NumeroInfo {
  id: string;
  telefone: string | null;
  nome_verificado: string | null;
  qualidade: string | null;
  status_verificacao: string | null;
}

interface PerfilInfo {
  sobre: string;
  descricao: string;
  email: string;
  endereco: string;
  site: string;
  categoria: string;
  foto_url: string | null;
}

interface PerfilResponse {
  conectado: boolean;
  numero?: NumeroInfo;
  perfil?: PerfilInfo;
}

type EtapaProvisionamento = 'nao_iniciado' | 'definindo_waba' | 'selecionando_ddd' | 'aguardando_codigo';

interface ProvisionamentoResponse {
  status: 'nao_iniciado' | 'aguardando_codigo' | 'conectado';
  telefone?: string;
  ddds?: number[];
  numero_meta_id?: string;
  empresa_tem_waba?: boolean;
  nome?: string;
}

interface PerfilFormState {
  sobre: string;
  descricao: string;
  email: string;
  endereco: string;
  site: string;
  categoria: string;
}

const EMPTY_FORM: PerfilFormState = {
  sobre: '',
  descricao: '',
  email: '',
  endereco: '',
  site: '',
  categoria: 'UNDEFINED',
};

const CATEGORIAS: Array<{ value: string; label: string }> = [
  { value: 'UNDEFINED', label: 'Não definida' },
  { value: 'OTHER', label: 'Outro' },
  { value: 'AUTO', label: 'Automotivo' },
  { value: 'BEAUTY', label: 'Beleza, Spa e Salão' },
  { value: 'APPAREL', label: 'Roupas e Vestuário' },
  { value: 'EDU', label: 'Educação' },
  { value: 'ENTERTAIN', label: 'Entretenimento' },
  { value: 'EVENT_PLAN', label: 'Planejamento de Eventos' },
  { value: 'FINANCE', label: 'Finanças e Bancos' },
  { value: 'GROCERY', label: 'Supermercado' },
  { value: 'GOVT', label: 'Governo' },
  { value: 'HOTEL', label: 'Hotel e Hospedagem' },
  { value: 'HEALTH', label: 'Saúde' },
  { value: 'NONPROFIT', label: 'Organização sem fins lucrativos' },
  { value: 'PROF_SERVICES', label: 'Serviços Profissionais' },
  { value: 'RETAIL', label: 'Varejo' },
  { value: 'TRAVEL', label: 'Viagem e Transporte' },
  { value: 'RESTAURANT', label: 'Restaurante' },
  { value: 'NOT_A_BIZ', label: 'Não é uma empresa' },
];

const QUALIDADE_LABEL: Record<string, string> = {
  GREEN: 'Alta',
  YELLOW: 'Média',
  RED: 'Baixa',
  UNKNOWN: 'Ainda sem dados',
};

const MAX_FOTO_BYTES = 3 * 1024 * 1024;

const createForm = (perfil?: PerfilInfo | null): PerfilFormState => ({
  sobre: perfil?.sobre || '',
  descricao: perfil?.descricao || '',
  email: perfil?.email || '',
  endereco: perfil?.endereco || '',
  site: perfil?.site || '',
  categoria: perfil?.categoria || 'UNDEFINED',
});

const lerArquivoComoBase64 = (arquivo: File) =>
  new Promise<string>((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const resultado = String(leitor.result || '');
      // vem como "data:image/png;base64,AAAA..." - so o servidor quer a parte de tras da virgula
      resolve(resultado.split(',')[1] || '');
    };
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(arquivo);
  });

const WhatsAppTab: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);
  const [numero, setNumero] = useState<NumeroInfo | null>(null);
  const [perfilForm, setPerfilForm] = useState<PerfilFormState>(EMPTY_FORM);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoSelecionada, setFotoSelecionada] = useState<File | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [etapa, setEtapa] = useState<EtapaProvisionamento>('nao_iniciado');
  const [ddds, setDdds] = useState<number[]>([]);
  const [dddSelecionado, setDddSelecionado] = useState<number | null>(null);
  const [telefoneEmAndamento, setTelefoneEmAndamento] = useState<string | null>(null);
  const [isCarregandoDdds, setIsCarregandoDdds] = useState(false);
  const [isIniciando, setIsIniciando] = useState(false);
  const [isVerificando, setIsVerificando] = useState(false);
  const [isCancelando, setIsCancelando] = useState(false);
  const [erroWizard, setErroWizard] = useState<string | null>(null);
  const [empresaTemWaba, setEmpresaTemWaba] = useState(false);
  const [wabaIdInput, setWabaIdInput] = useState('');
  const [isDefinindoWaba, setIsDefinindoWaba] = useState(false);
  const [isConectandoExistente, setIsConectandoExistente] = useState(false);
  const acompanhamentoAtivo = useRef(false);
  const dadosSignupRef = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  useEffect(() => {
    if (window.FB) {
      return;
    }

    window.fbAsyncInit = () => {
      window.FB?.init({ appId: import.meta.env.VITE_META_APP_ID as string, version: 'v21.0' });
    };

    const script = document.createElement('script');
    script.src = FACEBOOK_SDK_URL;
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') {
        return;
      }

      try {
        const dados = JSON.parse(String(event.data));

        if (dados?.type !== 'WA_EMBEDDED_SIGNUP') {
          return;
        }

        if (dados.event === 'FINISH') {
          dadosSignupRef.current = {
            wabaId: dados.data?.waba_id,
            phoneNumberId: dados.data?.phone_number_id,
          };
        }
      } catch {
        // mensagens de outra origem sem relacao com o signup - ignora
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const chamarApi = async (metodo: 'GET' | 'POST', corpo?: unknown) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('Sua sessão expirou. Entre de novo para continuar.');
    }

    const resposta = await fetch('/api/whatsapp-perfil', {
      method: metodo,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.access_token}`,
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });

    const respostaCorpo = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      throw new Error(respostaCorpo?.error || 'Não foi possível falar com o WhatsApp.');
    }

    return respostaCorpo;
  };

  const chamarProvisionamento = async (acao: string, extra?: Record<string, unknown>) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('Sua sessão expirou. Entre de novo para continuar.');
    }

    const resposta = await fetch('/api/whatsapp-provisionamento', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ acao, ...extra }),
    });

    const respostaCorpo = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      throw new Error(respostaCorpo?.error || 'Não foi possível falar com o WhatsApp.');
    }

    return respostaCorpo as ProvisionamentoResponse;
  };

  const carregarPerfil = async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const dados = (await chamarApi('GET')) as PerfilResponse;

      setConectado(Boolean(dados.conectado));
      setNumero(dados.numero || null);
      setPerfilForm(createForm(dados.perfil));
      setFotoUrl(dados.perfil?.foto_url || null);

      if (!dados.conectado) {
        const status = await chamarProvisionamento('status');

        setEmpresaTemWaba(Boolean(status.empresa_tem_waba));

        if (status.status === 'aguardando_codigo') {
          setEtapa('aguardando_codigo');
          setTelefoneEmAndamento(status.telefone || null);
        } else {
          setEtapa('nao_iniciado');
        }
      }
    } catch (error: any) {
      console.error('Erro ao carregar o perfil do WhatsApp:', error);
      setLoadError(error?.message || 'Não foi possível carregar as informações do WhatsApp.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    carregarPerfil();

    return () => {
      acompanhamentoAtivo.current = false;
    };
  }, []);

  useEffect(() => {
    if (etapa !== 'aguardando_codigo' || acompanhamentoAtivo.current) {
      return;
    }

    acompanhamentoAtivo.current = true;

    const acompanhar = async () => {
      /* SMS de verificacao costuma chegar em segundos, raramente passa de
         1-2 minutos - 40 tentativas de 5s cobre isso com folga sem
         prender quem esta na call num loop infinito silencioso. */
      for (let tentativa = 0; tentativa < 40 && acompanhamentoAtivo.current; tentativa += 1) {
        try {
          const resultado = await chamarProvisionamento('verificar');

          if (resultado.status === 'conectado') {
            acompanhamentoAtivo.current = false;
            await carregarPerfil();
            return;
          }
        } catch (error: any) {
          console.error('Erro ao verificar o codigo do WhatsApp:', error);
          setErroWizard(error?.message || 'Não foi possível verificar o código recebido.');
          acompanhamentoAtivo.current = false;
          return;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 5000));
      }

      acompanhamentoAtivo.current = false;
    };

    acompanhar();
  }, [etapa]);

  const finalizarConexaoExistente = async (code: string) => {
    const phoneNumberId = dadosSignupRef.current.phoneNumberId;

    if (!phoneNumberId) {
      setErroWizard('Não foi possível identificar o número. Tente novamente.');
      return;
    }

    setIsConectandoExistente(true);
    setErroWizard(null);

    try {
      await chamarProvisionamento('conectar_existente', { phone_number_id: phoneNumberId, code });
      await carregarPerfil();
    } catch (error: any) {
      console.error('Erro ao concluir a conexão do WhatsApp:', error);
      setErroWizard(error?.message || 'Não foi possível concluir a conexão.');
    } finally {
      setIsConectandoExistente(false);
    }
  };

  const handleConectarExistente = () => {
    if (!window.FB) {
      setErroWizard('Ainda carregando o WhatsApp. Tente novamente em instantes.');
      return;
    }

    setErroWizard(null);
    dadosSignupRef.current = {};

    window.FB.login(
      (resposta) => {
        if (resposta.authResponse?.code) {
          finalizarConexaoExistente(resposta.authResponse.code);
        }
      },
      {
        config_id: import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: { sessionInfoVersion: '3' },
      },
    );
  };

  const handleAbrirSelecaoDdd = async () => {
    setErroWizard(null);
    setIsCarregandoDdds(true);

    try {
      const resultado = await chamarProvisionamento('ddds');
      const lista = resultado.ddds || [];

      if (!lista.length) {
        setErroWizard('Não há DDDs disponíveis no momento. Tente novamente em instantes.');
        return;
      }

      setDdds(lista);
      setDddSelecionado(lista[0]);
      setEtapa('selecionando_ddd');
    } catch (error: any) {
      console.error('Erro ao consultar DDDs disponíveis:', error);
      setErroWizard(error?.message || 'Não foi possível consultar os DDDs disponíveis.');
    } finally {
      setIsCarregandoDdds(false);
    }
  };

  const handleClicarCriarNovaConta = () => {
    setErroWizard(null);

    if (empresaTemWaba) {
      handleAbrirSelecaoDdd();
    } else {
      setEtapa('definindo_waba');
    }
  };

  const handleDefinirWaba = async () => {
    const wabaId = wabaIdInput.trim();

    if (!wabaId) {
      setErroWizard('Informe o ID da WABA.');
      return;
    }

    setErroWizard(null);
    setIsDefinindoWaba(true);

    try {
      await chamarProvisionamento('definir_waba', { waba_id: wabaId });
      setEmpresaTemWaba(true);
      setWabaIdInput('');
      await handleAbrirSelecaoDdd();
    } catch (error: any) {
      console.error('Erro ao definir a WABA da empresa:', error);
      setErroWizard(error?.message || 'Não foi possível confirmar essa WABA.');
    } finally {
      setIsDefinindoWaba(false);
    }
  };

  const handleConfirmarDdd = async () => {
    if (!dddSelecionado) {
      return;
    }

    setErroWizard(null);
    setIsIniciando(true);

    try {
      const resultado = await chamarProvisionamento('iniciar', { areaCode: dddSelecionado });
      setTelefoneEmAndamento(resultado.telefone || null);
      setEtapa('aguardando_codigo');
    } catch (error: any) {
      console.error('Erro ao iniciar a configuração do WhatsApp:', error);
      setErroWizard(error?.message || 'Não foi possível iniciar a configuração.');
    } finally {
      setIsIniciando(false);
    }
  };

  const handleVerificarAgora = async () => {
    setErroWizard(null);
    setIsVerificando(true);

    try {
      const resultado = await chamarProvisionamento('verificar');

      if (resultado.status === 'conectado') {
        acompanhamentoAtivo.current = false;
        await carregarPerfil();
      } else {
        setErroWizard('O código ainda não chegou. Aguarde mais alguns instantes e tente de novo.');
      }
    } catch (error: any) {
      console.error('Erro ao verificar o código do WhatsApp:', error);
      setErroWizard(error?.message || 'Não foi possível verificar o código recebido.');
    } finally {
      setIsVerificando(false);
    }
  };

  const handleCancelarProvisionamento = async () => {
    setErroWizard(null);
    setIsCancelando(true);
    acompanhamentoAtivo.current = false;

    try {
      await chamarProvisionamento('cancelar');
      setTelefoneEmAndamento(null);
      setEtapa('nao_iniciado');
    } catch (error: any) {
      console.error('Erro ao cancelar a configuração do WhatsApp:', error);
      setErroWizard(error?.message || 'Não foi possível cancelar a configuração.');
    } finally {
      setIsCancelando(false);
    }
  };

  const handleStartEditing = () => {
    setPerfilForm(createForm({ ...perfilForm, foto_url: fotoUrl } as PerfilInfo));
    setFotoSelecionada(null);
    setFotoPreview(null);
    setSaveError(null);
    setSaveSuccess(null);
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setFotoSelecionada(null);
    setFotoPreview(null);
    setSaveError(null);
    setSaveSuccess(null);
    setIsEditing(false);
  };

  const handleFieldChange =
    (campo: keyof PerfilFormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const valor = event.target.value;
      setPerfilForm((atual) => ({ ...atual, [campo]: valor }));
      setSaveError(null);
      setSaveSuccess(null);
    };

  const handleCategoriaChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setPerfilForm((atual) => ({ ...atual, categoria: event.target.value }));
    setSaveError(null);
    setSaveSuccess(null);
  };

  const handleFotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = event.target.files?.[0];

    if (!arquivo) {
      return;
    }

    if (arquivo.size > MAX_FOTO_BYTES) {
      setSaveError('A foto precisa ter até 3MB.');
      return;
    }

    setFotoSelecionada(arquivo);
    setFotoPreview(URL.createObjectURL(arquivo));
    setSaveError(null);
    setSaveSuccess(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const payload: Record<string, unknown> = {
        sobre: perfilForm.sobre,
        descricao: perfilForm.descricao,
        email: perfilForm.email,
        endereco: perfilForm.endereco,
        site: perfilForm.site,
        categoria: perfilForm.categoria,
      };

      if (fotoSelecionada) {
        payload.foto_base64 = await lerArquivoComoBase64(fotoSelecionada);
        payload.foto_mime = fotoSelecionada.type || 'image/jpeg';
      }

      await chamarApi('POST', payload);

      setIsEditing(false);
      setFotoSelecionada(null);
      setFotoPreview(null);
      setSaveSuccess('Perfil do WhatsApp atualizado com sucesso.');
      await carregarPerfil();
    } catch (error: any) {
      console.error('Erro ao salvar o perfil do WhatsApp:', error);
      setSaveError(error?.message || 'Não foi possível salvar o perfil do WhatsApp.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-muted">
        <Loader2 size={20} className="mr-2 animate-spin" />
        Carregando...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-panel border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
        {loadError}
      </div>
    );
  }

  if (!conectado) {
    return (
      <div className="min-h-[320px]">
        <section className="rounded-[28px] border border-line-soft bg-paper p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-stone text-ink">
              <MessageCircle size={20} />
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[20px] font-semibold tracking-tight text-ink">WhatsApp</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-600">
                  <AlertCircle size={12} />
                  Pendente
                </span>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-muted">
                Conecte seu WhatsApp Business para começar a atender os seus clientes por aqui.
              </p>
            </div>
          </div>

          {erroWizard ? (
            <div className="mt-4 whitespace-pre-line rounded-panel border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-600">
              {erroWizard}
            </div>
          ) : null}

          {etapa === 'nao_iniciado' ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleConectarExistente}
                disabled={isConectandoExistente}
                className="flex flex-col items-start gap-3 rounded-panel border border-line bg-card p-5 text-left transition-colors hover:border-ink/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-stone text-ink">
                  {isConectandoExistente ? <Loader2 size={18} className="animate-spin" /> : <Link2 size={18} />}
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-ink">Já tenho uma conta</p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {isConectandoExistente ? 'Conectando...' : 'Conecte a conta de WhatsApp Business que você já usa.'}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={handleClicarCriarNovaConta}
                disabled={isCarregandoDdds}
                className="flex flex-col items-start gap-3 rounded-panel border border-line bg-card p-5 text-left transition-colors hover:border-ink/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-stone text-ink">
                  {isCarregandoDdds ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-ink">Criar uma nova conta</p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {isCarregandoDdds ? 'Consultando...' : 'A gente cria um número novo do zero pra você.'}
                  </p>
                </div>
              </button>
            </div>
          ) : null}

          {etapa === 'definindo_waba' ? (
            <div className="mt-6 rounded-panel border border-line-soft bg-card px-4 py-4">
              <p className="text-sm font-semibold text-ink">ID da WABA</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <input
                  type="text"
                  value={wabaIdInput}
                  onChange={(event) => setWabaIdInput(event.target.value)}
                  placeholder="ID da WABA"
                  className="min-w-[220px] flex-1 rounded-panel border border-line bg-paper px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25"
                />
                <button
                  type="button"
                  onClick={handleDefinirWaba}
                  disabled={isDefinindoWaba}
                  className="inline-flex h-11 items-center gap-2 rounded-panel bg-lime px-5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDefinindoWaba ? <Loader2 size={16} className="animate-spin" /> : null}
                  {isDefinindoWaba ? 'Confirmando...' : 'Confirmar'}
                </button>
                <button
                  type="button"
                  onClick={() => setEtapa('nao_iniciado')}
                  disabled={isDefinindoWaba}
                  className="inline-flex h-11 items-center gap-2 rounded-panel border border-line bg-card px-5 text-sm font-semibold text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : null}

          {etapa === 'selecionando_ddd' ? (
            <div className="mt-6 rounded-panel border border-line-soft bg-card px-4 py-4">
              <label htmlFor="wa-ddd" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
                DDD do número novo
              </label>
              <select
                id="wa-ddd"
                value={dddSelecionado ?? ''}
                onChange={(event) => setDddSelecionado(Number(event.target.value))}
                className="mt-2 w-full max-w-[200px] rounded-panel border border-line bg-paper px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25"
              >
                {ddds.map((ddd) => (
                  <option key={ddd} value={ddd}>
                    {ddd}
                  </option>
                ))}
              </select>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleConfirmarDdd}
                  disabled={isIniciando}
                  className="inline-flex h-11 items-center gap-2 rounded-panel bg-lime px-5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isIniciando ? <Loader2 size={16} className="animate-spin" /> : null}
                  {isIniciando ? 'Criando número...' : 'Criar número e continuar'}
                </button>
                <button
                  type="button"
                  onClick={() => setEtapa('nao_iniciado')}
                  disabled={isIniciando}
                  className="inline-flex h-11 items-center gap-2 rounded-panel border border-line bg-card px-5 text-sm font-semibold text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : null}

          {etapa === 'aguardando_codigo' ? (
            <div className="mt-6 rounded-panel border border-line-soft bg-card px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Loader2 size={16} className="animate-spin" />
                Confirmando o número {telefoneEmAndamento || ''}...
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">
                Isso costuma levar só alguns segundos e termina sozinho. Se demorar, você pode
                forçar uma nova checagem.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleVerificarAgora}
                  disabled={isVerificando}
                  className="inline-flex h-11 items-center gap-2 rounded-panel bg-lime px-5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isVerificando ? <Loader2 size={16} className="animate-spin" /> : null}
                  {isVerificando ? 'Verificando...' : 'Verificar agora'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelarProvisionamento}
                  disabled={isCancelando}
                  className="inline-flex h-11 items-center gap-2 rounded-panel border border-line bg-card px-5 text-sm font-semibold text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCancelando ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                  {isCancelando ? 'Cancelando...' : 'Cancelar'}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  const qualidade = numero?.qualidade ? QUALIDADE_LABEL[numero.qualidade] || numero.qualidade : null;
  const fotoExibida = fotoPreview || fotoUrl;

  return (
    <div className="min-h-[520px]">
      <div className="space-y-5">
        <section className="rounded-[28px] border border-line-soft bg-paper p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-stone text-ink">
                <MessageCircle size={20} />
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[20px] font-semibold tracking-tight text-ink">WhatsApp</h2>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                    <Check size={12} />
                    Conectado
                  </span>
                </div>
                <p className="max-w-2xl text-sm leading-6 text-muted">
                  Esse é o número oficial conectado à sua conta. O nome verificado não pode ser
                  alterado por aqui — ele passa por uma verificação separada.
                </p>
              </div>
            </div>

            {!isEditing ? (
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

          <div className="mt-6 grid gap-4 max-lg:grid-cols-1 md:grid-cols-3">
            <div className="rounded-panel border border-line-soft bg-card px-4 py-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">Número</p>
              <p className="mt-2 text-sm font-semibold text-ink">{numero?.telefone || '—'}</p>
            </div>
            <div className="rounded-panel border border-line-soft bg-card px-4 py-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
                Nome verificado
              </p>
              <p className="mt-2 text-sm font-semibold text-ink">{numero?.nome_verificado || '—'}</p>
            </div>
            <div className="rounded-panel border border-line-soft bg-card px-4 py-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
                Qualidade do número
              </p>
              <p className="mt-2 text-sm font-semibold text-ink">{qualidade || '—'}</p>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-line-soft bg-paper p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-6">
          <h3 className="text-[16px] font-semibold tracking-tight text-ink">Perfil comercial</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            É o que os seus clientes veem ao abrir a conversa: foto, descrição e dados de contato.
          </p>

          <div className="mt-6 space-y-4">
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

            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-soft bg-stone">
                {fotoExibida ? (
                  <img src={fotoExibida} alt="Foto do perfil do WhatsApp" className="h-full w-full object-cover" />
                ) : (
                  <MessageCircle size={28} className="text-muted-soft" />
                )}
              </div>

              {isEditing ? (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-panel border border-line bg-card px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink/25">
                  <Camera size={16} />
                  Trocar foto
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleFotoChange} />
                </label>
              ) : null}
            </div>

            <div className="grid gap-4 max-lg:grid-cols-1 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="wa-sobre" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
                  Recado (status)
                </label>
                <input
                  id="wa-sobre"
                  type="text"
                  value={perfilForm.sobre}
                  onChange={handleFieldChange('sobre')}
                  disabled={!isEditing}
                  maxLength={139}
                  className="mt-2 w-full rounded-panel border border-line bg-card px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25 disabled:cursor-default disabled:bg-paper disabled:text-muted"
                  placeholder="Ex: Atendimento comercial"
                />
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="wa-descricao"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft"
                >
                  Descrição da empresa
                </label>
                <textarea
                  id="wa-descricao"
                  value={perfilForm.descricao}
                  onChange={handleFieldChange('descricao')}
                  disabled={!isEditing}
                  rows={3}
                  maxLength={512}
                  className="mt-2 w-full rounded-panel border border-line bg-card px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25 disabled:cursor-default disabled:bg-paper disabled:text-muted"
                  placeholder="Conte em poucas linhas o que a sua empresa faz"
                />
              </div>

              <div>
                <label htmlFor="wa-email" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
                  E-mail de contato
                </label>
                <input
                  id="wa-email"
                  type="email"
                  value={perfilForm.email}
                  onChange={handleFieldChange('email')}
                  disabled={!isEditing}
                  className="mt-2 w-full rounded-panel border border-line bg-card px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25 disabled:cursor-default disabled:bg-paper disabled:text-muted"
                  placeholder="contato@empresa.com"
                />
              </div>

              <div>
                <label htmlFor="wa-site" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
                  Site
                </label>
                <input
                  id="wa-site"
                  type="text"
                  value={perfilForm.site}
                  onChange={handleFieldChange('site')}
                  disabled={!isEditing}
                  className="mt-2 w-full rounded-panel border border-line bg-card px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25 disabled:cursor-default disabled:bg-paper disabled:text-muted"
                  placeholder="https://www.empresa.com"
                />
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="wa-endereco"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft"
                >
                  Endereço
                </label>
                <input
                  id="wa-endereco"
                  type="text"
                  value={perfilForm.endereco}
                  onChange={handleFieldChange('endereco')}
                  disabled={!isEditing}
                  className="mt-2 w-full rounded-panel border border-line bg-card px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25 disabled:cursor-default disabled:bg-paper disabled:text-muted"
                  placeholder="Rua, número, cidade - UF"
                />
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="wa-categoria"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft"
                >
                  Categoria
                </label>
                <select
                  id="wa-categoria"
                  value={perfilForm.categoria}
                  onChange={handleCategoriaChange}
                  disabled={!isEditing}
                  className="mt-2 w-full rounded-panel border border-line bg-card px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25 disabled:cursor-default disabled:bg-paper disabled:text-muted"
                >
                  {CATEGORIAS.map((categoria) => (
                    <option key={categoria.value} value={categoria.value}>
                      {categoria.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isEditing ? (
              <div className="flex flex-wrap items-center justify-end gap-3 pt-2 max-lg:flex-col-reverse max-lg:items-stretch">
                <button
                  type="button"
                  onClick={handleCancelEditing}
                  disabled={isSaving}
                  className="rounded-panel border border-line bg-card px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60 max-lg:w-full max-lg:text-center"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-panel bg-lime px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 max-lg:w-full max-lg:justify-center"
                >
                  <Save size={16} />
                  {isSaving ? 'Salvando...' : 'Salvar perfil'}
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
};

export default WhatsAppTab;
