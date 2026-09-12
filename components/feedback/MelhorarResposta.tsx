import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, ThumbsDown, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/* Otimizacao Automatica: o usuario diz o que nao gostou numa mensagem da IA
   e um agente no n8n ajusta a persona SO da empresa dele.

   Duas coisas que valem lembrar ao mexer aqui:

   1. O texto da persona NUNCA chega neste componente. A RPC de status
      devolve so status + a resposta em linguagem simples. Se um dia alguem
      precisar "mostrar o que mudou", o caminho e melhorar o resumo, nunca
      expor a persona.
   2. Nao existe rota nova em api/ de proposito: o plano Hobby da Vercel
      aceita 12 Serverless Functions e 11 ja estao em uso. O registro vai
      por RPC autenticada e o disparo direto no webhook do n8n, como o
      painel ja faz em outros pontos. */

const WEBHOOK_OTIMIZACAO =
  'https://primary-production-b86f1.up.railway.app/webhook/otimizacao-feedback';

const INTERVALO_CONSULTA_MS = 4000;
const TEMPO_MAXIMO_MS = 3 * 60 * 1000;

type Etapa = 'formulario' | 'analisando' | 'ajustado' | 'orientado' | 'detalhe' | 'demorou' | 'erro';

const ERROS: Record<string, string> = {
  sem_empresa: 'Não consegui identificar sua empresa. Saia e entre no sistema de novo.',
  texto_invalido: 'Escreva entre 10 e 1000 caracteres.',
  mensagem_invalida: 'Só dá para comentar mensagens enviadas pela IA.',
  limite_diario: 'Sua empresa já usou os 7 ajustes de hoje. Amanhã libera de novo.',
  feedback_em_andamento: 'Já existe um ajuste em andamento para esta mensagem.',
};

interface MelhorarRespostaProps {
  mensagemId: string;
  variante?: 'balao' | 'lista';
}

const MelhorarResposta: React.FC<MelhorarRespostaProps> = ({ mensagemId, variante = 'balao' }) => {
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>('formulario');
  const [texto, setTexto] = useState('');
  const [detalhe, setDetalhe] = useState('');
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [resposta, setResposta] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [desfeito, setDesfeito] = useState(false);
  const consultaRef = useRef<number | null>(null);

  const pararConsulta = useCallback(() => {
    if (consultaRef.current) {
      window.clearInterval(consultaRef.current);
      consultaRef.current = null;
    }
  }, []);

  useEffect(() => () => pararConsulta(), [pararConsulta]);

  const fechar = () => {
    pararConsulta();
    setAberto(false);
    setEtapa('formulario');
    setTexto('');
    setDetalhe('');
    setFeedbackId(null);
    setResposta('');
    setErro('');
    setDesfeito(false);
  };

  /* O agente e assincrono: o webhook so avisa que tem feedback novo, e o
     resultado aparece no banco. Por isso consultamos o status ate ele sair
     de PENDENTE/PROCESSANDO. */
  const acompanhar = useCallback(
    (id: string) => {
      const inicio = Date.now();
      pararConsulta();

      consultaRef.current = window.setInterval(async () => {
        if (Date.now() - inicio > TEMPO_MAXIMO_MS) {
          pararConsulta();
          setEtapa('demorou');
          return;
        }

        const { data } = await supabase.rpc('sales_v2_feedback_status', { p_feedback_id: id });
        const status = data?.status;

        if (!status || status === 'PENDENTE' || status === 'PROCESSANDO') {
          return;
        }

        pararConsulta();
        setResposta(data?.resposta_usuario || '');

        if (status === 'APLICADO') setEtapa('ajustado');
        else if (status === 'ORIENTADO') setEtapa('orientado');
        else if (status === 'PRECISA_DETALHE') setEtapa('detalhe');
        else setEtapa('erro');
      }, INTERVALO_CONSULTA_MS);
    },
    [pararConsulta],
  );

  const enviar = async (conteudo: string) => {
    setEnviando(true);
    setErro('');

    const { data, error } = await supabase.rpc('sales_v2_feedback_registrar', {
      p_mensagem_id: mensagemId,
      p_texto: conteudo,
    });

    setEnviando(false);

    if (error || !data?.sucesso) {
      setErro(ERROS[data?.erro] || 'Não consegui registrar seu comentário agora. Tente de novo.');
      return;
    }

    const id = data.feedback_id as string;
    setFeedbackId(id);
    setEtapa('analisando');

    /* Falha aqui nao perde o feedback: ele fica PENDENTE e o agendamento do
       proprio fluxo de Otimizacao pega a fila. */
    try {
      const { data: sessao } = await supabase.auth.getSession();
      await fetch(WEBHOOK_OTIMIZACAO, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (sessao?.session?.access_token || ''),
        },
        body: JSON.stringify({ feedback_id: id }),
      });
    } catch (e) {
      /* segue pelo agendamento */
    }

    acompanhar(id);
  };

  const naoEraIsso = async () => {
    if (!feedbackId) return;
    setEnviando(true);
    const { data } = await supabase.rpc('sales_v2_feedback_nao_era_isso', {
      p_feedback_id: feedbackId,
      p_detalhe: detalhe.trim().length >= 10 ? detalhe.trim() : null,
    });
    setEnviando(false);

    if (!data?.sucesso) {
      setErro('Não consegui desfazer agora. Tente de novo.');
      return;
    }

    setDesfeito(true);

    if (data.novo_feedback_id) {
      setFeedbackId(data.novo_feedback_id);
      setDetalhe('');
      setDesfeito(false);
      setEtapa('analisando');
      acompanhar(data.novo_feedback_id);
    }
  };

  const botao =
    variante === 'balao' ? (
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Melhorar esta resposta"
        className="inline-flex items-center gap-1 rounded-pill bg-black/[0.06] px-2 py-0.5 text-[10px] text-gray-600 transition-colors hover:bg-black/[0.12]"
        style={{ fontWeight: 700 }}
      >
        <ThumbsDown size={10} />
        Melhorar
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1.5 rounded-pill border border-line px-2.5 py-1 text-[10.5px] text-muted transition-colors hover:border-ink/20 hover:text-ink"
        style={{ fontWeight: 700 }}
      >
        <ThumbsDown size={11} />
        Melhorar esta resposta
      </button>
    );

  const botaoFechar = (
    <button
      type="button"
      onClick={fechar}
      className="inline-flex h-10 items-center justify-center rounded-[9px] border border-line px-5 text-[13px] text-ink transition-colors hover:bg-stone"
      style={{ fontWeight: 700 }}
    >
      Fechar
    </button>
  );

  return (
    <>
      {botao}

      {aberto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-panel border border-line-soft bg-card p-5 shadow-xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[17px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.01em' }}>
                  Melhorar esta resposta
                </h2>
                <p className="mt-1 text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
                  Conte o que não ficou bom. O ajuste vale só para os seus atendimentos.
                </p>
              </div>
              <button
                type="button"
                onClick={fechar}
                className="rounded-[8px] p-1 text-muted transition-colors hover:bg-stone hover:text-ink"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4">
              {etapa === 'formulario' ? (
                <>
                  <textarea
                    value={texto}
                    onChange={(event) => setTexto(event.target.value)}
                    rows={4}
                    maxLength={1000}
                    autoFocus
                    placeholder="Ex: respondeu sem entender onde a peça vai ser usada"
                    className="w-full rounded-tile border border-line bg-paper px-3 py-2 text-[13.5px] text-ink outline-none transition-colors focus:border-ink/30"
                    style={{ fontWeight: 500 }}
                  />
                  <span className="mt-1 block text-[11px] text-muted-soft" style={{ fontWeight: 500 }}>
                    {texto.trim().length < 10 ? 'Mínimo de 10 caracteres' : texto.length + '/1000'}
                  </span>
                </>
              ) : null}

              {etapa === 'analisando' ? (
                <div
                  className="flex items-center gap-2.5 rounded-tile bg-paper px-4 py-5 text-[13px] text-muted"
                  style={{ fontWeight: 600 }}
                >
                  <Loader2 size={15} className="animate-spin" />
                  Analisando o atendimento e ajustando...
                </div>
              ) : null}

              {etapa === 'ajustado' ? (
                <div className="space-y-3">
                  <div
                    className="flex items-start gap-2.5 rounded-tile px-4 py-3 text-[13px] text-ink"
                    style={{ fontWeight: 500, backgroundColor: 'rgba(235,245,125,.22)' }}
                  >
                    <Check size={15} className="mt-0.5 shrink-0" />
                    <span>{resposta || 'Ajuste aplicado.'}</span>
                  </div>
                  {desfeito ? (
                    <p className="text-[12.5px] text-muted" style={{ fontWeight: 600 }}>
                      Desfeito. A IA voltou a se comportar como antes.
                    </p>
                  ) : (
                    <>
                      <textarea
                        value={detalhe}
                        onChange={(event) => setDetalhe(event.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder="Não era isso? Explique melhor (opcional)"
                        className="w-full rounded-tile border border-line bg-paper px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-ink/30"
                        style={{ fontWeight: 500 }}
                      />
                      <button
                        type="button"
                        onClick={naoEraIsso}
                        disabled={enviando}
                        className="text-[12.5px] text-muted underline underline-offset-2 transition-colors hover:text-ink disabled:opacity-60"
                        style={{ fontWeight: 700 }}
                      >
                        Não era isso
                      </button>
                    </>
                  )}
                </div>
              ) : null}

              {etapa === 'orientado' ? (
                <div
                  className="rounded-tile border border-line-soft bg-paper px-4 py-3 text-[13px] text-ink"
                  style={{ fontWeight: 500 }}
                >
                  {resposta}
                </div>
              ) : null}

              {etapa === 'detalhe' ? (
                <div className="space-y-3">
                  <p className="text-[13px] text-ink" style={{ fontWeight: 500 }}>
                    {resposta}
                  </p>
                  <textarea
                    value={detalhe}
                    onChange={(event) => setDetalhe(event.target.value)}
                    rows={3}
                    maxLength={1000}
                    autoFocus
                    className="w-full rounded-tile border border-line bg-paper px-3 py-2 text-[13.5px] text-ink outline-none transition-colors focus:border-ink/30"
                    style={{ fontWeight: 500 }}
                  />
                </div>
              ) : null}

              {etapa === 'demorou' ? (
                <p className="rounded-tile bg-paper px-4 py-4 text-[13px] text-muted" style={{ fontWeight: 500 }}>
                  Ainda estou analisando. Pode fechar: o ajuste continua e vale para os próximos
                  atendimentos.
                </p>
              ) : null}

              {etapa === 'erro' ? (
                <p
                  className="rounded-tile border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-600"
                  style={{ fontWeight: 500 }}
                >
                  {resposta || 'Não consegui concluir esse ajuste. O time foi avisado.'}
                </p>
              ) : null}

              {erro ? (
                <p
                  className="mt-3 rounded-tile border border-red-100 bg-red-50 px-3 py-2 text-[12.5px] text-red-600"
                  style={{ fontWeight: 600 }}
                >
                  {erro}
                </p>
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              {etapa === 'formulario' || etapa === 'detalhe' ? (
                <>
                  {botaoFechar}
                  <button
                    type="button"
                    onClick={() => enviar(etapa === 'formulario' ? texto.trim() : detalhe.trim())}
                    disabled={
                      enviando ||
                      (etapa === 'formulario' ? texto.trim().length < 10 : detalhe.trim().length < 10)
                    }
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-ink px-5 text-[13px] text-white transition-colors hover:bg-ink-soft disabled:opacity-50"
                    style={{ fontWeight: 700 }}
                  >
                    {enviando ? <Loader2 size={14} className="animate-spin" /> : null}
                    Enviar
                  </button>
                </>
              ) : (
                botaoFechar
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default MelhorarResposta;
