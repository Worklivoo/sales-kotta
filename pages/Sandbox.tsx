import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronRight,
  ExternalLink,
  FlaskConical,
  Hash,
  Loader2,
  Mail,
  Paperclip,
  Plus,
  Send,
  Tag,
  Trash2,
  Zap,
} from 'lucide-react';
import MelhorarResposta from '../components/feedback/MelhorarResposta';
import { messageHtmlClassName, sanitizeHtmlContent, stripAttachmentAnalysisFromContent } from '../lib/htmlContent';
import { supabase } from '../lib/supabase';
import { apiUrl } from '../lib/apiBase';

/* "Testar atendimento": o cliente escreve como se fosse um lead mandando
   e-mail para a propria empresa e acompanha a IA respondendo. A mensagem roda
   nas automacoes reais (ver server/sandboxService.ts); so o envio final ao
   lead e simulado. Aberta pelo atalho na aba Geral das Configuracoes. */

interface EmpresaInfo {
  empresa_id: string;
  razao_social: string | null;
  membro_id: string | null;
  email_integracao: string | null;
}

interface SandboxAtendimento {
  atendimento_id: string;
  numero_ticket: number | null;
  email_lead: string | null;
  assunto: string | null;
  status: string | null;
  categoria: string | null;
  created_at: string;
  updated_at: string;
}

interface SandboxMensagem {
  mensagem_id: string;
  created_at: string;
  origem: string | null;
  conteudo: string | null;
  anexos: unknown;
}

interface NovaConversaPendente {
  email_lead: string;
  assunto: string;
  texto: string;
}

// Depois disso sem resposta, para de mostrar "processando" - algo deu errado
// na automacao e a execucao real e onde se investiga.
const ESPERA_MAXIMA_RESPOSTA_MS = 4 * 60 * 1000;

const parseAnexos = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? item : (item as { url?: string })?.url))
    .filter((item): item is string => Boolean(item));
};

const formatEnumLabel = (value: string | null) => {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const formatDateTime = (value: string) => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsedDate);
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface SandboxPageProps {
  onNavigate: (path: string) => void;
}

const SandboxPage: React.FC<SandboxPageProps> = ({ onNavigate }) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [carregandoEmpresa, setCarregandoEmpresa] = useState(true);
  const [empresaInfo, setEmpresaInfo] = useState<EmpresaInfo | null>(null);
  const [empresaIndisponivel, setEmpresaIndisponivel] = useState<string | null>(null);

  const [atendimentos, setAtendimentos] = useState<SandboxAtendimento[]>([]);
  const [atendimentoId, setAtendimentoId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<SandboxMensagem[]>([]);
  const [rascunhoNovo, setRascunhoNovo] = useState(false);
  const [novaPendente, setNovaPendente] = useState<NovaConversaPendente | null>(null);
  const [respostaPendente, setRespostaPendente] = useState<{ texto: string; enviadoEm: number } | null>(null);
  const totalMensagensRef = useRef(0);

  const [assunto, setAssunto] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const atendimentoSelecionado = atendimentos.find((item) => item.atendimento_id === atendimentoId) || null;

  const chamarSandboxApi = async (
    acao: string,
    options: { method?: 'GET' | 'POST'; params?: Record<string, string>; body?: unknown } = {},
  ) => {
    if (!accessToken) {
      throw new Error('Sessao nao carregada ainda.');
    }

    const query = options.params ? `?${new URLSearchParams(options.params).toString()}` : '';
    const response = await fetch(apiUrl(`/api/sandbox/${acao}${query}`), {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || 'Falha na chamada do ambiente de teste.');
    }

    return data;
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token || null);
    });
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    chamarSandboxApi('minha-empresa')
      .then((data) => {
        setEmpresaInfo(data);
        setEmpresaIndisponivel(null);
      })
      .catch((error: any) => {
        setEmpresaIndisponivel(error?.message || 'O ambiente de teste nao esta disponivel agora.');
      })
      .finally(() => setCarregandoEmpresa(false));
  }, [accessToken]);

  const carregarAtendimentos = async (silencioso = false) => {
    if (!empresaInfo) return;

    try {
      const data = await chamarSandboxApi('atendimentos');
      setAtendimentos(data.atendimentos || []);
      if (!silencioso) setErro(null);
    } catch (error: any) {
      if (!silencioso) setErro(error?.message || 'Nao foi possivel carregar as conversas.');
    }
  };

  useEffect(() => {
    if (!empresaInfo) return;
    carregarAtendimentos();
    const interval = window.setInterval(() => carregarAtendimentos(true), 5000);
    return () => window.clearInterval(interval);
  }, [empresaInfo]);

  // A conversa nova so existe depois que a Triagem cria o atendimento. Assim
  // que ela aparecer na lista (poll acima), seleciona sozinha.
  useEffect(() => {
    if (!novaPendente) return;
    const encontrado = atendimentos.find((item) => item.email_lead === novaPendente.email_lead);
    if (encontrado) {
      setNovaPendente(null);
      setRascunhoNovo(false);
      setRespostaPendente({ texto: '', enviadoEm: Date.now() });
      setAtendimentoId(encontrado.atendimento_id);
    }
  }, [atendimentos, novaPendente]);

  const carregarMensagens = async (silencioso = false) => {
    if (!atendimentoId) return;

    try {
      const data = await chamarSandboxApi('mensagens', { params: { atendimento_id: atendimentoId } });
      const novas: SandboxMensagem[] = data.mensagens || [];

      // Chegou mensagem que nao e do lead depois do envio: a resposta saiu.
      if (novas.length !== totalMensagensRef.current) {
        const ultima = novas[novas.length - 1];
        if (ultima && (ultima.origem || '').toUpperCase() !== 'LEAD') {
          setRespostaPendente(null);
        }
      }

      totalMensagensRef.current = novas.length;
      setMensagens(novas);
      if (!silencioso) setErro(null);
    } catch (error: any) {
      if (!silencioso) setErro(error?.message || 'Nao foi possivel carregar as mensagens.');
    }
  };

  useEffect(() => {
    totalMensagensRef.current = 0;
    setMensagens([]);
    if (!atendimentoId) return;
    carregarMensagens();
    const interval = window.setInterval(() => carregarMensagens(true), 4000);
    return () => window.clearInterval(interval);
  }, [atendimentoId]);

  useEffect(() => {
    if (!respostaPendente) return;
    const restante = ESPERA_MAXIMA_RESPOSTA_MS - (Date.now() - respostaPendente.enviadoEm);
    const timeout = window.setTimeout(() => setRespostaPendente(null), Math.max(restante, 0));
    return () => window.clearTimeout(timeout);
  }, [respostaPendente]);

  const handleNovaConversa = () => {
    setAtendimentoId(null);
    setMensagens([]);
    setRespostaPendente(null);
    setRascunhoNovo(true);
    setAssunto('');
    setTexto('');
    setErro(null);
  };

  const handleSelecionar = (id: string) => {
    setRascunhoNovo(false);
    setRespostaPendente(null);
    setAtendimentoId(id);
    setTexto('');
    setErro(null);
  };

  const handleEnviar = async () => {
    const mensagemTexto = texto.trim();
    if (!mensagemTexto || enviando) return;

    setEnviando(true);
    setErro(null);

    try {
      if (rascunhoNovo) {
        const data = await chamarSandboxApi('enviar-email', {
          method: 'POST',
          body: { texto: mensagemTexto, assunto: assunto.trim() },
        });
        setNovaPendente({ email_lead: data.email_lead, assunto: data.assunto, texto: mensagemTexto });
      } else if (atendimentoId) {
        await chamarSandboxApi('enviar-email', {
          method: 'POST',
          body: { texto: mensagemTexto, atendimento_id: atendimentoId },
        });
        setRespostaPendente({ texto: mensagemTexto, enviadoEm: Date.now() });
      }

      setTexto('');
      carregarAtendimentos(true);
    } catch (error: any) {
      setErro(error?.message || 'Nao foi possivel enviar a mensagem de teste.');
    } finally {
      setEnviando(false);
    }
  };

  const handleExcluir = async (alvoId: string) => {
    if (!window.confirm('Excluir essa conversa de teste (mensagens e orçamentos ligados a ela)? Não dá para desfazer.')) {
      return;
    }

    setExcluindo(true);
    setErro(null);

    try {
      await chamarSandboxApi('excluir-atendimento', { method: 'POST', body: { atendimento_id: alvoId } });
      if (atendimentoId === alvoId) {
        setAtendimentoId(null);
        setMensagens([]);
        setRespostaPendente(null);
      }
      await carregarAtendimentos();
    } catch (error: any) {
      setErro(error?.message || 'Nao foi possivel excluir a conversa.');
    } finally {
      setExcluindo(false);
    }
  };

  if (carregandoEmpresa) {
    return (
      <div className="flex h-full w-full items-center justify-center font-sans">
        <Loader2 size={22} className="animate-spin text-muted-soft" />
      </div>
    );
  }

  if (empresaIndisponivel) {
    return (
      <div className="flex h-full w-full items-center justify-center font-sans">
        <div className="max-w-md rounded-panel border border-red-100 bg-red-50 p-6 text-center">
          <FlaskConical size={22} className="mx-auto mb-3 text-red-500" />
          <p className="text-[13px] text-red-700" style={{ fontWeight: 600 }}>
            {empresaIndisponivel}
          </p>
        </div>
      </div>
    );
  }

  const aguardandoResposta = Boolean(respostaPendente);
  const conversaAberta = rascunhoNovo || Boolean(atendimentoSelecionado);
  const podeAbrirCotacao =
    atendimentoSelecionado?.numero_ticket && empresaInfo &&
    ['COTACAO', 'PEDIDO_COMPRA'].includes(atendimentoSelecionado.categoria || '');

  return (
    <div className="h-full w-full font-sans">
      <div className="flex h-full min-h-0 flex-col gap-4">
        <section className="flex flex-wrap items-center justify-between gap-4 px-1 pt-1">
          <div className="space-y-1">
            <h1 className="text-[22px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.02em' }}>
              Testar atendimento
            </h1>
            <p className="text-[13.5px] text-muted" style={{ fontWeight: 500 }}>
              Escreva como se fosse um cliente mandando e-mail e veja a IA responder. Nada é enviado de verdade e as
              conversas de teste não contam no seu plano.
            </p>
          </div>
        </section>

        {erro ? (
          <div className="rounded-tile border border-red-100 bg-red-50 px-4 py-3 text-[12.5px] text-red-600" style={{ fontWeight: 500 }}>
            {erro}
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside
            className={`min-h-0 flex-col rounded-panel border border-line-soft bg-card xl:flex ${
              conversaAberta ? 'max-xl:hidden' : 'flex'
            }`}
          >
            <div className="border-b border-line-soft px-4 py-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-ink">
                  <FlaskConical size={15} className="text-muted-soft" />
                  <span className="text-[13px]" style={{ fontWeight: 800 }}>
                    Conversas de teste
                  </span>
                </div>
                <span className="rounded-pill bg-stone px-2.5 py-0.5 text-[11px] text-muted" style={{ fontWeight: 700 }}>
                  {atendimentos.length}
                </span>
              </div>

              <button
                type="button"
                onClick={handleNovaConversa}
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[9px] bg-lime px-3 text-[12.5px] text-ink hover:bg-lime-deep"
                style={{ fontWeight: 700 }}
              >
                <Plus size={14} />
                Nova conversa
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-2">
                {novaPendente ? (
                  <div className="rounded-tile border border-dashed border-line bg-paper px-3.5 py-3">
                    <p className="line-clamp-1 text-[13px] text-ink" style={{ fontWeight: 700 }}>
                      {novaPendente.assunto}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted" style={{ fontWeight: 500 }}>
                      <Loader2 size={12} className="animate-spin" />
                      Chegando na caixa de entrada...
                    </p>
                  </div>
                ) : null}

                {atendimentos.map((item) => {
                  const ativo = item.atendimento_id === atendimentoId;

                  return (
                    <div
                      key={item.atendimento_id}
                      className={`group flex items-start gap-2 rounded-tile border px-3.5 py-3 transition-all ${
                        ativo ? 'border-ink/15 bg-paper' : 'border-line-soft bg-card hover:border-ink/15 hover:bg-paper'
                      }`}
                      style={{ transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelecionar(item.atendimento_id)}
                        className="min-w-0 flex-1 space-y-1.5 text-left"
                        aria-pressed={ativo}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="line-clamp-1 text-[13px] leading-5 text-ink" style={{ fontWeight: 700 }}>
                            {item.assunto || 'Sem assunto'}
                          </h3>
                          <span className="shrink-0 whitespace-nowrap text-[10.5px] text-muted-soft" style={{ fontWeight: 600 }}>
                            {formatDateTime(item.updated_at)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[9.5px] ${
                              item.categoria === 'COTACAO' ? 'bg-lime text-ink' : 'bg-stone text-muted'
                            }`}
                            style={{ fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' }}
                          >
                            {item.categoria === 'COTACAO' ? <Zap size={10} /> : null}
                            {formatEnumLabel(item.categoria)}
                          </span>
                          <span className="shrink-0 text-[10.5px] text-muted-soft" style={{ fontWeight: 700 }}>
                            #{item.numero_ticket ?? '—'}
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExcluir(item.atendimento_id)}
                        disabled={excluindo}
                        className="shrink-0 rounded-full p-1.5 text-muted-soft opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600 disabled:opacity-50 xl:opacity-0 xl:group-hover:opacity-100"
                        title="Excluir conversa de teste"
                        aria-label="Excluir conversa de teste"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}

                {!novaPendente && atendimentos.length === 0 ? (
                  <div className="flex h-40 items-center justify-center rounded-tile border border-dashed border-line px-6 text-center">
                    <p className="text-[12px] text-muted-soft" style={{ fontWeight: 500 }}>
                      Nenhuma conversa ainda. Clique em "Nova conversa" para começar.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>

          <section
            className={`min-h-0 overflow-hidden rounded-panel border border-line-soft bg-card xl:block ${
              conversaAberta ? 'block' : 'max-xl:hidden'
            }`}
          >
            {conversaAberta ? (
              <div className="flex h-full min-h-0 flex-col">
                <header className="border-b border-line-soft px-5 py-4">
                  <button
                    type="button"
                    onClick={() => {
                      setRascunhoNovo(false);
                      setAtendimentoId(null);
                    }}
                    className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-muted xl:hidden"
                    style={{ fontWeight: 700 }}
                  >
                    <ChevronRight size={14} className="rotate-180" />
                    Voltar para as conversas
                  </button>

                  {atendimentoSelecionado ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-paper px-2.5 py-1 text-[10.5px] text-muted"
                          style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                        >
                          <Hash size={11} />
                          {atendimentoSelecionado.numero_ticket ?? '—'}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[10.5px] ${
                            atendimentoSelecionado.categoria === 'COTACAO' ? 'bg-lime text-ink' : 'bg-stone text-muted'
                          }`}
                          style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                        >
                          {atendimentoSelecionado.categoria === 'COTACAO' ? <Zap size={11} /> : <Tag size={11} />}
                          {formatEnumLabel(atendimentoSelecionado.categoria)}
                        </span>
                        <span
                          className="inline-flex items-center gap-1.5 rounded-pill bg-stone px-2.5 py-1 text-[10.5px] text-muted"
                          style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                        >
                          <Tag size={11} />
                          {formatEnumLabel(atendimentoSelecionado.status)}
                        </span>
                        {podeAbrirCotacao ? (
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate(
                                `/cotacao/${encodeURIComponent(empresaInfo!.empresa_id)}/${encodeURIComponent(
                                  String(atendimentoSelecionado.numero_ticket),
                                )}`,
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-2.5 py-1 text-[10.5px] text-muted hover:text-ink"
                            style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                          >
                            <ExternalLink size={11} />
                            Ver cotação
                          </button>
                        ) : null}
                      </div>
                      <h2 className="mt-2.5 text-[19px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.01em' }}>
                        {atendimentoSelecionado.assunto || 'Sem assunto'}
                      </h2>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-muted">
                        <Mail size={14} />
                        <span className="text-[12px]" style={{ fontWeight: 700 }}>
                          Novo e-mail de um lead
                        </span>
                      </div>
                      <input
                        type="text"
                        value={assunto}
                        onChange={(event) => setAssunto(event.target.value)}
                        placeholder="Assunto (ex: Pedido de cotação)"
                        disabled={Boolean(novaPendente)}
                        className="mt-2.5 w-full bg-transparent text-[19px] text-ink outline-none placeholder:text-muted-soft disabled:opacity-60"
                        style={{ fontWeight: 800, letterSpacing: '-.01em' }}
                        maxLength={200}
                      />
                    </>
                  )}
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto bg-paper p-4">
                  <div className="space-y-2.5">
                    {mensagens.map((mensagem) => {
                      const origem = (mensagem.origem || '').toUpperCase();
                      const anexos = parseAnexos(mensagem.anexos);

                      return (
                        <div key={mensagem.mensagem_id} className="rounded-panel border border-line-soft bg-card">
                          <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
                            {origem === 'IA' ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-pill bg-lime px-2 py-0.5 text-[9.5px] text-ink"
                                style={{ fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}
                              >
                                <Zap size={10} />
                                IA
                              </span>
                            ) : origem === 'HUMANO' ? (
                              <span
                                className="rounded-pill bg-stone px-2 py-0.5 text-[9.5px] text-muted"
                                style={{ fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}
                              >
                                Humano
                              </span>
                            ) : (
                              <span
                                className="rounded-pill border border-line px-2 py-0.5 text-[9.5px] text-muted"
                                style={{ fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}
                              >
                                Lead (você)
                              </span>
                            )}
                            <span className="shrink-0 text-[11px] text-muted-soft" style={{ fontWeight: 700 }}>
                              {formatDateTime(mensagem.created_at)}
                            </span>
                          </div>

                          <div className="space-y-3 px-4 pb-4 pt-2.5">
                            <div
                              className={messageHtmlClassName}
                              dangerouslySetInnerHTML={{
                                __html: sanitizeHtmlContent(stripAttachmentAnalysisFromContent(mensagem.conteudo || '')),
                              }}
                            />
                            {anexos.length > 0 ? (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {anexos.map((anexo) => (
                                  <a
                                    key={anexo}
                                    href={anexo}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 rounded-tile border border-line bg-paper px-3 py-2 text-[11.5px] text-muted hover:border-ink/15"
                                    style={{ fontWeight: 700 }}
                                  >
                                    <Paperclip size={13} />
                                    {anexo.split('/').filter(Boolean).pop()}
                                  </a>
                                ))}
                              </div>
                            ) : null}
                            {origem === 'IA' ? <MelhorarResposta mensagemId={mensagem.mensagem_id} variante="lista" /> : null}
                          </div>
                        </div>
                      );
                    })}

                    {novaPendente ? (
                      <div className="rounded-panel border border-dashed border-line bg-card px-4 py-3.5">
                        <div
                          className={`${messageHtmlClassName} opacity-60`}
                          dangerouslySetInnerHTML={{ __html: `<p>${escapeHtml(novaPendente.texto)}</p>` }}
                        />
                      </div>
                    ) : null}

                    {respostaPendente?.texto ? (
                      <div className="rounded-panel border border-dashed border-line bg-card px-4 py-3.5">
                        <div
                          className={`${messageHtmlClassName} opacity-60`}
                          dangerouslySetInnerHTML={{ __html: `<p>${escapeHtml(respostaPendente.texto)}</p>` }}
                        />
                      </div>
                    ) : null}

                    {rascunhoNovo && !novaPendente && mensagens.length === 0 ? (
                      <div className="flex h-24 items-center justify-center rounded-panel border border-dashed border-line bg-card px-4 text-center">
                        <p className="text-[12px] text-muted-soft" style={{ fontWeight: 500 }}>
                          Escreva abaixo o e-mail que um cliente mandaria para a sua empresa.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="border-t border-line-soft bg-card p-3">
                  {novaPendente || aguardandoResposta ? (
                    <p className="mb-2 flex items-center gap-1.5 text-[11.5px] text-muted-soft" style={{ fontWeight: 600 }}>
                      <Loader2 size={12} className="animate-spin" />
                      A IA está lendo e respondendo. A resposta aparece aqui sozinha.
                    </p>
                  ) : null}
                  <div className="flex items-end gap-2">
                    <textarea
                      value={texto}
                      onChange={(event) => setTexto(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                          event.preventDefault();
                          handleEnviar();
                        }
                      }}
                      rows={3}
                      disabled={Boolean(novaPendente)}
                      placeholder={rascunhoNovo ? 'Olá, gostaria de uma cotação de...' : 'Responder como o lead...'}
                      className="min-h-[68px] flex-1 resize-none rounded-[9px] border border-line bg-paper px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-muted-soft disabled:opacity-60"
                      maxLength={5000}
                    />
                    <button
                      type="button"
                      onClick={handleEnviar}
                      disabled={enviando || !texto.trim() || Boolean(novaPendente)}
                      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[9px] bg-ink px-4 text-[13px] text-white hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ fontWeight: 700 }}
                    >
                      {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      Enviar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-6">
                <div className="max-w-md rounded-panel border border-dashed border-line bg-paper px-8 py-10 text-center">
                  <p className="text-[16px] text-ink" style={{ fontWeight: 800 }}>
                    Nenhuma conversa selecionada
                  </p>
                  <p className="mt-2 text-[13px] leading-6 text-muted" style={{ fontWeight: 500 }}>
                    Abra uma conversa de teste ou clique em "Nova conversa" para simular um cliente pedindo cotação.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default SandboxPage;
