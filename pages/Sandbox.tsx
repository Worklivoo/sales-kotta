import React, { useEffect, useRef, useState } from 'react';
import { Copy, FlaskConical, Loader2, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import WhatsAppChatView from '../components/chat/WhatsAppChatView';
import { formatBrazilianPhone, formatDateTime as formatChatDateTime } from '../components/chat/utils';
import type { ChatMessage, ChatMessageAuthor } from '../components/chat/types';
import { sanitizeHtmlContent, stripAttachmentAnalysisFromContent } from '../lib/htmlContent';
import { supabase } from '../lib/supabase';

// Empresa precisa estar com ambiente_teste=true no Supabase para aparecer aqui.
// Nesse modo, as automacoes pulam o envio real de WhatsApp/Email e simulam
// sucesso - por isso essa pagina pode disparar mensagens de teste com
// seguranca, sem risco de alcancar um lead de verdade.
const WHATSAPP_WEBHOOK_URL = 'https://primary-production-b86f1.up.railway.app/webhook/triagem-whatsapp-v2';

interface SandboxEmpresa {
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
  const [empresas, setEmpresas] = useState<SandboxEmpresa[]>([]);
  const [empresaId, setEmpresaId] = useState<string>('');
  const [atendimentos, setAtendimentos] = useState<SandboxAtendimento[]>([]);
  const [atendimentoId, setAtendimentoId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<SandboxMensagem[]>([]);
  const [telefonePendente, setTelefonePendente] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);

  const empresaSelecionada = empresas.find((item) => item.empresa_id === empresaId) || null;
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

  const carregarEmpresas = async () => {
    try {
      const data = await chamarSandboxApi('empresas');
      setEmpresas(data.empresas || []);
      setErro(null);
    } catch (error: any) {
      setErro(error?.message || 'Nao foi possivel carregar as empresas de teste.');
    } finally {
      setCarregandoEmpresas(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    carregarEmpresas();
  }, [accessToken]);

  useEffect(() => {
    if (empresas.length && !empresaId) {
      setEmpresaId(empresas[0].empresa_id);
    }
  }, [empresas, empresaId]);

  const carregarAtendimentos = async (silencioso = false) => {
    if (!empresaId || !accessToken) return;

    try {
      const data = await chamarSandboxApi('atendimentos', { params: { empresa_id: empresaId } });
      setAtendimentos(data.atendimentos || []);
      if (!silencioso) setErro(null);
    } catch (error: any) {
      if (!silencioso) setErro(error?.message || 'Nao foi possivel carregar as conversas.');
    }
  };

  useEffect(() => {
    setAtendimentoId(null);
    setTelefonePendente(null);
    setMensagens([]);
    if (!empresaId) return;
    carregarAtendimentos();
    const interval = window.setInterval(() => carregarAtendimentos(true), 6000);
    return () => window.clearInterval(interval);
  }, [empresaId, accessToken]);

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
    if (!empresaId || !atendimentoId || !accessToken) return;

    try {
      const data = await chamarSandboxApi('mensagens', { params: { empresa_id: empresaId, atendimento_id: atendimentoId } });
      setMensagens(data.mensagens || []);
      if (!silencioso) setErro(null);
    } catch (error: any) {
      if (!silencioso) setErro(error?.message || 'Nao foi possivel carregar as mensagens.');
    }
  };

  useEffect(() => {
    if (!atendimentoId) return;
    carregarMensagens();
    const interval = window.setInterval(() => carregarMensagens(true), 4000);
    return () => window.clearInterval(interval);
  }, [atendimentoId, empresaId, accessToken]);

  const handleNovoLead = () => {
    setAtendimentoId(null);
    setMensagens([]);
    setTelefonePendente(gerarTelefoneFake());
  };

  const handleEnviar = async () => {
    const mensagemTexto = texto.trim();
    if (!mensagemTexto || !telefoneAtivo || !empresaSelecionada) return;

    if (!empresaSelecionada.numero_meta_id) {
      setErro('Essa empresa ainda nao tem um numero de WhatsApp de teste configurado.');
      return;
    }

    setEnviando(true);
    setErro(null);

    try {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: empresaSelecionada.numero_meta_id },
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

      setTexto('');
      window.setTimeout(() => carregarAtendimentos(true), 1000);
    } catch (error: any) {
      setErro(error?.message || 'Nao foi possivel enviar a mensagem de teste.');
    } finally {
      setEnviando(false);
    }
  };

  const handleConfigurarWhatsapp = async () => {
    if (!empresaId) return;
    setConfigurando(true);
    setErro(null);

    try {
      await chamarSandboxApi('configurar-whatsapp', { method: 'POST', body: { empresa_id: empresaId } });
      await carregarEmpresas();
    } catch (error: any) {
      setErro(error?.message || 'Nao foi possivel configurar o WhatsApp de teste.');
    } finally {
      setConfigurando(false);
    }
  };

  const handleExcluirAtendimento = async (alvoId: string) => {
    if (!empresaId) return;
    if (!window.confirm('Excluir essa conversa de teste (mensagens e orçamentos ligados a ela)? Não dá pra desfazer.')) {
      return;
    }

    setExcluindo(true);
    setErro(null);

    try {
      await chamarSandboxApi('excluir-atendimento', { method: 'POST', body: { empresa_id: empresaId, atendimento_id: alvoId } });
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

  const chatMessages: ChatMessage[] = mensagens.map((mensagem) => ({
    id: mensagem.mensagem_id,
    author: normalizeAuthor(mensagem.origem),
    time: formatChatDateTime(mensagem.created_at),
    createdAt: mensagem.created_at,
    contentHtml: sanitizeHtmlContent(stripAttachmentAnalysisFromContent(mensagem.conteudo || '')),
    attachments: parseAnexos(mensagem.anexos).map((url) => ({ url })),
  }));

  const aguardandoRespostaIa =
    chatMessages.length > 0 && chatMessages[chatMessages.length - 1].author === 'CLIENTE';

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-hidden font-sans">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-tile border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <FlaskConical size={18} className="shrink-0 text-amber-700" />
          <p className="text-[12.5px] text-amber-800" style={{ fontWeight: 600 }}>
            Ambiente de teste — nenhuma mensagem sai de verdade. As automações rodam o fluxo real, mas o
            envio para WhatsApp/e-mail é simulado para empresas marcadas como sandbox.
          </p>
        </div>
      </div>

      {erro ? (
        <div className="rounded-tile border border-red-100 bg-red-50 px-4 py-3 text-[12.5px] text-red-600" style={{ fontWeight: 500 }}>
          {erro}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={empresaId}
          onChange={(event) => setEmpresaId(event.target.value)}
          disabled={carregandoEmpresas || !empresas.length}
          className="h-11 rounded-[9px] border border-line bg-card px-3 text-[13px] text-ink"
          style={{ fontWeight: 700 }}
        >
          {carregandoEmpresas ? (
            <option>Carregando...</option>
          ) : empresas.length === 0 ? (
            <option>Nenhuma empresa em ambiente_teste</option>
          ) : (
            empresas.map((empresa) => (
              <option key={empresa.empresa_id} value={empresa.empresa_id}>
                {empresa.razao_social || empresa.empresa_id}
              </option>
            ))
          )}
        </select>

        {empresaSelecionada ? (
          empresaSelecionada.numero_meta_id ? (
            <span className="text-[11.5px] text-muted" style={{ fontWeight: 600 }}>
              WhatsApp: {empresaSelecionada.numero_meta_id}
            </span>
          ) : (
            <button
              type="button"
              onClick={handleConfigurarWhatsapp}
              disabled={configurando}
              className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-line bg-card px-3 text-[12px] text-ink hover:bg-stone disabled:opacity-50"
              style={{ fontWeight: 700 }}
            >
              {configurando ? <Loader2 size={13} className="animate-spin" /> : null}
              Configurar WhatsApp de teste
            </button>
          )
        ) : null}

        {empresaSelecionada?.email_integracao ? (
          <button
            type="button"
            onClick={() => copiar(empresaSelecionada.email_integracao as string, 'email')}
            className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-line bg-card px-3 text-[12px] text-ink hover:bg-stone"
            style={{ fontWeight: 700 }}
            title="Endereco para testar o canal de e-mail (mande um e-mail real pra ele)"
          >
            <Copy size={13} />
            {copiado === 'email' ? 'Copiado!' : 'E-mail de teste'}
          </button>
        ) : null}
      </div>

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

              <div className="flex items-center gap-2 border-t border-line-soft bg-card p-3">
                {aguardandoRespostaIa ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-soft" style={{ fontWeight: 600 }}>
                    <Loader2 size={12} className="animate-spin" />
                    Aguardando IA...
                  </span>
                ) : null}
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
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-[13px] text-muted-soft" style={{ fontWeight: 500 }}>
              Selecione uma conversa ou clique em "Novo Lead" para começar.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default SandboxPage;
