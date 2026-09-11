import React, { useEffect, useRef, useState } from 'react';
import { Copy, FlaskConical, Loader2, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import WhatsAppChatView from '../components/chat/WhatsAppChatView';
import { formatBrazilianPhone, formatDateTime as formatChatDateTime } from '../components/chat/utils';
import type { ChatMessage, ChatMessageAuthor } from '../components/chat/types';
import { sanitizeHtmlContent, stripAttachmentAnalysisFromContent } from '../lib/htmlContent';
import { supabase } from '../lib/supabase';

// A empresa em teste e sempre a empresa do usuario logado - nunca uma
// selecionada na tela. Nesse modo (ambiente_teste=true), as automacoes pulam
// o envio real de WhatsApp/Email e simulam sucesso, entao essa pagina pode
// disparar mensagens de teste com seguranca, sem risco de alcancar um lead
// de verdade.
const WHATSAPP_WEBHOOK_URL = 'https://primary-production-b86f1.up.railway.app/webhook/triagem-whatsapp-v2';

// A automacao real espera ~90s de silencio no numero antes de processar
// (mesmo debounce que agrupa varias mensagens digitadas em sequencia no
// WhatsApp de verdade). E normal nada aparecer antes disso.
const AVISO_DEBOUNCE = 'A automação processa cada mensagem em até ~90s de silêncio (é o mesmo debounce do WhatsApp real, pra agrupar mensagens seguidas). Não é bug se a conversa não aparecer na hora — ela atualiza sozinha aqui.';

interface EmpresaInfo {
  empresa_id: string;
  razao_social: string | null;
  membro_id: string | null;
  numero_meta_id: string | null;
  email_integracao: string | null;
}

interface SandboxAtendimento {
  atendimento_id: string;
  numero_ticket: number | null;
  telefone_lead: string | null;
  email_lead: string | null;
  origem: string | null;
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

interface MensagemOtimista {
  id: string;
  texto: string;
}

const parseAnexos = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? item : (item as { url?: string })?.url))
    .filter((item): item is string => Boolean(item));
};

const normalizeAuthor = (origem: string | null): ChatMessageAuthor => {
  const upper = (origem || '').toUpperCase();
  if (upper === 'IA') return 'IA';
  if (upper === 'HUMANO') return 'HUMANO';
  return 'CLIENTE';
};

const gerarTelefoneFake = () => {
  const ddds = ['11', '21', '31', '41', '51', '61', '71', '81', '85'];
  const ddd = ddds[Math.floor(Math.random() * ddds.length)];
  const numero = String(Math.floor(10000000 + Math.random() * 89999999));
  return `55${ddd}9${numero}`;
};

const formatEnumLabel = (value: string | null) => {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const SandboxPage: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [carregandoEmpresa, setCarregandoEmpresa] = useState(true);
  const [empresaInfo, setEmpresaInfo] = useState<EmpresaInfo | null>(null);
  const [empresaIndisponivel, setEmpresaIndisponivel] = useState<string | null>(null);

  const [atendimentos, setAtendimentos] = useState<SandboxAtendimento[]>([]);
  const [atendimentoId, setAtendimentoId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<SandboxMensagem[]>([]);
  const [telefonePendente, setTelefonePendente] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState<MensagemOtimista[]>([]);
  const mensagensAnterioresRef = useRef(0);

  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const atendimentoSelecionado = atendimentos.find((item) => item.atendimento_id === atendimentoId) || null;
  const telefoneAtivo = atendimentoSelecionado?.telefone_lead || telefonePendente;

  const chamarSandboxApi = async (acao: string, options: { method?: 'GET' | 'POST'; params?: Record<string, string>; body?: unknown } = {}) => {
    if (!accessToken) {
      throw new Error('Sessao nao carregada ainda.');
    }

    const query = options.params ? `?${new URLSearchParams(options.params).toString()}` : '';
    const response = await fetch(`/api/sandbox/${acao}${query}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || 'Falha na chamada do sandbox.');
    }

    return data;
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token || null);
    });
  }, []);

  const carregarEmpresa = async () => {
    try {
      const data = await chamarSandboxApi('minha-empresa');
      setEmpresaInfo(data);
      setEmpresaIndisponivel(null);
    } catch (error: any) {
      setEmpresaIndisponivel(error?.message || 'Sua empresa nao esta disponivel para o sandbox.');
    } finally {
      setCarregandoEmpresa(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    carregarEmpresa();
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
    const interval = window.setInterval(() => carregarAtendimentos(true), 6000);
    return () => window.clearInterval(interval);
  }, [empresaInfo]);

  // Enquanto esperamos o primeiro atendimento de um "Novo Lead" aparecer,
  // assim que ele surgir na lista (poll acima), seleciona automaticamente.
  useEffect(() => {
    if (!telefonePendente || atendimentoId) return;
    const encontrado = atendimentos.find((item) => item.telefone_lead === telefonePendente);
    if (encontrado) {
      setAtendimentoId(encontrado.atendimento_id);
      setTelefonePendente(null);
    }
  }, [atendimentos, telefonePendente, atendimentoId]);

  const carregarMensagens = async (silencioso = false) => {
    if (!empresaInfo || !atendimentoId) return;

    try {
      const data = await chamarSandboxApi('mensagens', { params: { atendimento_id: atendimentoId } });
      const novasMensagens: SandboxMensagem[] = data.mensagens || [];
      if (novasMensagens.length !== mensagensAnterioresRef.current) {
        setPendentes([]);
      }
      mensagensAnterioresRef.current = novasMensagens.length;
      setMensagens(novasMensagens);
      if (!silencioso) setErro(null);
    } catch (error: any) {
      if (!silencioso) setErro(error?.message || 'Nao foi possivel carregar as mensagens.');
    }
  };

  useEffect(() => {
    mensagensAnterioresRef.current = 0;
    setMensagens([]);
    setPendentes([]);
    if (!atendimentoId) return;
    carregarMensagens();
    const interval = window.setInterval(() => carregarMensagens(true), 4000);
    return () => window.clearInterval(interval);
  }, [atendimentoId, empresaInfo]);

  const handleNovoLead = () => {
    setAtendimentoId(null);
    setMensagens([]);
    setPendentes([]);
    setTelefonePendente(gerarTelefoneFake());
  };

  const handleEnviar = async () => {
    const mensagemTexto = texto.trim();
    if (!mensagemTexto || !telefoneAtivo || !empresaInfo?.numero_meta_id) return;

    setEnviando(true);
    setErro(null);

    try {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: empresaInfo.numero_meta_id },
                  contacts: [{ profile: { name: `Lead Teste ${telefoneAtivo.slice(-4)}` } }],
                  messages: [
                    {
                      from: telefoneAtivo,
                      id: `wamid.SANDBOX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                      type: 'text',
                      text: { body: mensagemTexto },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const response = await fetch(WHATSAPP_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook respondeu com status ${response.status}.`);
      }

      setPendentes((atual) => [...atual, { id: `pendente-${Date.now()}`, texto: mensagemTexto }]);
      setTexto('');
      carregarAtendimentos(true);
    } catch (error: any) {
      setErro(error?.message || 'Nao foi possivel enviar a mensagem de teste.');
    } finally {
      setEnviando(false);
    }
  };

  const handleConfigurarWhatsapp = async () => {
    setConfigurando(true);
    setErro(null);

    try {
      await chamarSandboxApi('configurar-whatsapp', { method: 'POST' });
      await carregarEmpresa();
    } catch (error: any) {
      setErro(error?.message || 'Nao foi possivel configurar o WhatsApp de teste.');
    } finally {
      setConfigurando(false);
    }
  };

  const handleExcluirAtendimento = async (alvoId: string) => {
    if (!window.confirm('Excluir essa conversa de teste (mensagens e orçamentos ligados a ela)? Não dá pra desfazer.')) {
      return;
    }

    setExcluindo(true);
    setErro(null);

    try {
      await chamarSandboxApi('excluir-atendimento', { method: 'POST', body: { atendimento_id: alvoId } });
      if (atendimentoId === alvoId) {
        setAtendimentoId(null);
        setMensagens([]);
      }
      await carregarAtendimentos();
    } catch (error: any) {
      setErro(error?.message || 'Nao foi possivel excluir a conversa.');
    } finally {
      setExcluindo(false);
    }
  };

  const copiar = async (valor: string, chave: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(chave);
      window.setTimeout(() => setCopiado((atual) => (atual === chave ? null : atual)), 1500);
    } catch {
      // clipboard indisponivel - silencioso, nao e critico
    }
  };

  const chatMessages: ChatMessage[] = [
    ...mensagens.map((mensagem) => ({
      id: mensagem.mensagem_id,
      author: normalizeAuthor(mensagem.origem),
      time: formatChatDateTime(mensagem.created_at),
      createdAt: mensagem.created_at,
      contentHtml: sanitizeHtmlContent(stripAttachmentAnalysisFromContent(mensagem.conteudo || '')),
      attachments: parseAnexos(mensagem.anexos).map((url) => ({ url })),
    })),
    ...pendentes.map((pendente) => ({
      id: pendente.id,
      author: 'CLIENTE' as ChatMessageAuthor,
      time: 'enviando...',
      createdAt: new Date().toISOString(),
      contentHtml: `<p style="opacity:.55">${pendente.texto}</p>`,
      attachments: [],
    })),
  ];

  const aguardandoProcessamento = pendentes.length > 0;

  if (carregandoEmpresa) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 size={22} className="animate-spin text-muted-soft" />
      </div>
    );
  }

  if (empresaIndisponivel) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="max-w-md rounded-panel border border-red-100 bg-red-50 p-6 text-center">
          <FlaskConical size={22} className="mx-auto mb-3 text-red-500" />
          <p className="text-[13px] text-red-700" style={{ fontWeight: 600 }}>
            {empresaIndisponivel}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-hidden font-sans">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-tile border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <FlaskConical size={18} className="shrink-0 text-amber-700" />
          <div>
            <p className="text-[12.5px] text-amber-800" style={{ fontWeight: 700 }}>
              Sandbox — {empresaInfo?.razao_social}
            </p>
            <p className="text-[11.5px] text-amber-700" style={{ fontWeight: 500 }}>
              Nenhuma mensagem sai de verdade. {AVISO_DEBOUNCE}
            </p>
          </div>
        </div>

        {empresaInfo?.email_integracao ? (
          <button
            type="button"
            onClick={() => copiar(empresaInfo.email_integracao as string, 'email')}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] border border-amber-300 bg-white px-3 text-[12px] text-amber-800 hover:bg-amber-100"
            style={{ fontWeight: 700 }}
            title="Endereco para testar o canal de e-mail (mande um e-mail real pra ele)"
          >
            <Copy size={13} />
            {copiado === 'email' ? 'Copiado!' : 'E-mail de teste'}
          </button>
        ) : null}
      </div>

      {erro ? (
        <div className="rounded-tile border border-red-100 bg-red-50 px-4 py-3 text-[12.5px] text-red-600" style={{ fontWeight: 500 }}>
          {erro}
        </div>
      ) : null}

      {!empresaInfo?.numero_meta_id ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="max-w-sm rounded-panel border border-line-soft bg-card p-6 text-center">
            <p className="mb-3 text-[13px] text-ink" style={{ fontWeight: 700 }}>
              WhatsApp de teste ainda não configurado
            </p>
            <p className="mb-4 text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
              Sua empresa ainda não tem um número de WhatsApp de teste (não precisa ser um número real — é só
              uma chave interna de roteamento, já que nada é enviado pra Meta nesse modo).
            </p>
            <button
              type="button"
              onClick={handleConfigurarWhatsapp}
              disabled={configurando}
              className="inline-flex h-11 items-center gap-1.5 rounded-[9px] bg-lime px-4 text-[13px] text-ink hover:bg-lime-deep disabled:opacity-50"
              style={{ fontWeight: 700 }}
            >
              {configurando ? <Loader2 size={14} className="animate-spin" /> : null}
              Configurar WhatsApp de teste
            </button>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]">
          <aside className="flex min-h-0 flex-col rounded-panel border border-line-soft bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10.5px] uppercase tracking-wide text-muted-soft" style={{ fontWeight: 700 }}>
                Conversas de teste
              </p>
              <button
                type="button"
                onClick={() => carregarAtendimentos()}
                className="text-muted hover:text-ink"
                title="Atualizar"
              >
                <RefreshCw size={13} />
              </button>
            </div>

            <button
              type="button"
              onClick={handleNovoLead}
              className="mb-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-[9px] bg-lime px-3 text-[12.5px] text-ink hover:bg-lime-deep"
              style={{ fontWeight: 700 }}
            >
              <Plus size={14} />
              Novo Lead
            </button>

            <div className="flex-1 space-y-1.5 overflow-y-auto">
              {telefonePendente ? (
                <div className="rounded-[9px] border border-dashed border-line bg-paper px-3 py-2.5 text-[12px] text-muted" style={{ fontWeight: 600 }}>
                  Novo lead: {formatBrazilianPhone(telefonePendente)}
                  <br />
                  Mande a primeira mensagem abaixo.
                </div>
              ) : null}

              {atendimentos.map((item) => (
                <div
                  key={item.atendimento_id}
                  className={`group flex items-center gap-1.5 rounded-[9px] px-3 py-2.5 text-left transition-colors ${
                    atendimentoId === item.atendimento_id ? 'bg-lime/25' : 'hover:bg-stone'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setTelefonePendente(null);
                      setAtendimentoId(item.atendimento_id);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[12.5px] text-ink" style={{ fontWeight: 700 }}>
                      {formatBrazilianPhone(item.telefone_lead)}
                    </p>
                    <p className="truncate text-[11px] text-muted-soft" style={{ fontWeight: 500 }}>
                      #{item.numero_ticket ?? '—'} · {formatEnumLabel(item.categoria)} · {formatEnumLabel(item.status)}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExcluirAtendimento(item.atendimento_id)}
                    disabled={excluindo}
                    className="shrink-0 rounded-full p-1.5 text-muted-soft opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:opacity-50"
                    title="Excluir conversa de teste"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}

              {!telefonePendente && atendimentos.length === 0 ? (
                <p className="px-2 py-4 text-center text-[12px] text-muted-soft" style={{ fontWeight: 500 }}>
                  Nenhuma conversa ainda. Clique em "Novo Lead" pra começar.
                </p>
              ) : null}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-panel border border-line-soft">
            {telefoneAtivo ? (
              <>
                <div className="min-h-0 flex-1">
                  <WhatsAppChatView
                    header={{
                      phoneFormatted: formatBrazilianPhone(telefoneAtivo),
                      ticketLabel: atendimentoSelecionado?.numero_ticket
                        ? `#${atendimentoSelecionado.numero_ticket}`
                        : 'Novo lead',
                      category: formatEnumLabel(atendimentoSelecionado?.categoria || null),
                    }}
                    messages={chatMessages}
                  />
                </div>

                <div className="border-t border-line-soft bg-card p-3">
                  {aguardandoProcessamento ? (
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-soft" style={{ fontWeight: 600 }}>
                      <Loader2 size={12} className="animate-spin" />
                      Processando (até ~90s) — a resposta aparece aqui sozinha.
                    </p>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={texto}
                      onChange={(event) => setTexto(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          handleEnviar();
                        }
                      }}
                      placeholder="Mensagem como o lead..."
                      className="h-11 flex-1 rounded-[9px] border border-line bg-paper px-3 text-[13px] text-ink"
                    />
                    <button
                      type="button"
                      onClick={handleEnviar}
                      disabled={enviando || !texto.trim()}
                      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[9px] bg-ink px-4 text-[13px] text-white hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ fontWeight: 700 }}
                    >
                      {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      Enviar como Lead
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-[13px] text-muted-soft" style={{ fontWeight: 500 }}>
                Selecione uma conversa ou clique em "Novo Lead" para começar.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default SandboxPage;
