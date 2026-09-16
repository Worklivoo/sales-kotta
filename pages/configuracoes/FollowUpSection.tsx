import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlarmClock, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PilulaPendente } from '../../components/StatusConfiguracao';
import { avisarConfiguracaoAlterada, followupConfigurado } from '../../lib/pendenciasConfiguracao';
import { FOLLOWUP_TEMPLATES, buscarTemplate, renderizarTemplate } from '../../lib/followupTemplates';

/* Teto duro. A RPC sales_v2_followup_registrar recusa a partir da quarta
   tentativa, entao subir esse numero aqui sozinho nao libera nada - so cria
   uma configuracao que o banco ignora. */
const MAX_TENTATIVAS = 3;

/* Faixa de cada tentativa, contada desde a ultima mensagem do lead. Minimo de
   3h para nao cutucar o lead cedo demais; maximo de 24h para a cadencia
   inteira caber dentro de um dia de conversa. */
const MIN_HORAS = 3;
const MAX_HORAS = 24;


interface Tentativa {
  horas: number;
  template: string;
}

interface FollowupConfig {
  ativo: boolean;
  tentativas: Tentativa[];
  horario_comercial: { ativo: boolean; inicio: string; fim: string; dias_uteis: boolean };
  ao_esgotar: { marcar_perdido: boolean; notificar: boolean };
}

const CONFIG_PADRAO: FollowupConfig = {
  ativo: false,
  tentativas: [
    { horas: 3, template: 'sales_kotta_fup_lembrete' },
    { horas: 12, template: 'sales_kotta_fup_ajuda' },
    { horas: 24, template: 'sales_kotta_fup_ultima' },
  ],
  horario_comercial: { ativo: true, inicio: '08:00', fim: '18:00', dias_uteis: true },
  ao_esgotar: { marcar_perdido: true, notificar: true },
};

function normalizarConfig(bruto: unknown): FollowupConfig {
  const valor = (bruto || {}) as Partial<FollowupConfig>;
  const tentativas = Array.isArray(valor.tentativas) ? valor.tentativas : [];

  return {
    ativo: Boolean(valor.ativo),
    tentativas: tentativas.slice(0, MAX_TENTATIVAS).map((tentativa) => ({
      horas: Number(tentativa?.horas) > 0 ? Number(tentativa.horas) : 24,
      template: tentativa?.template || FOLLOWUP_TEMPLATES[0].nome,
    })),
    horario_comercial: {
      ativo: valor.horario_comercial?.ativo ?? CONFIG_PADRAO.horario_comercial.ativo,
      inicio: valor.horario_comercial?.inicio || CONFIG_PADRAO.horario_comercial.inicio,
      fim: valor.horario_comercial?.fim || CONFIG_PADRAO.horario_comercial.fim,
      dias_uteis: valor.horario_comercial?.dias_uteis ?? CONFIG_PADRAO.horario_comercial.dias_uteis,
    },
    ao_esgotar: {
      marcar_perdido: valor.ao_esgotar?.marcar_perdido ?? CONFIG_PADRAO.ao_esgotar.marcar_perdido,
      notificar: valor.ao_esgotar?.notificar ?? CONFIG_PADRAO.ao_esgotar.notificar,
    },
  };
}

function descreverPrazo(horas: number): string {
  if (horas < 24) {
    return `${horas}h`;
  }

  const dias = Math.floor(horas / 24);
  const resto = horas % 24;

  return resto ? `${dias}d ${resto}h` : `${dias} dia${dias > 1 ? 's' : ''}`;
}

const Alternador: React.FC<{
  ligado: boolean;
  onChange: () => void;
  rotulo: string;
  desabilitado?: boolean;
}> = ({ ligado, onChange, rotulo, desabilitado }) => (
  <button
    type="button"
    role="switch"
    aria-checked={ligado}
    aria-label={rotulo}
    onClick={onChange}
    disabled={desabilitado}
    className={`flex h-6 w-11 shrink-0 items-center rounded-pill px-1 transition-colors ${
      ligado ? 'bg-lime' : 'bg-stone'
    } disabled:cursor-not-allowed disabled:opacity-60`}
  >
    <div
      className={`h-4 w-4 rounded-pill bg-card shadow-sm transition-transform ${
        ligado ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);

interface Props {
  empresaId: string | null;
  podeEditar: boolean;
}

const FollowUpSection: React.FC<Props> = ({ empresaId, podeEditar }) => {
  const [config, setConfig] = useState<FollowupConfig>(CONFIG_PADRAO);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [isEditando, setIsEditando] = useState(false);
  /* Ultima versao gravada no banco: e para ela que o Cancelar volta. */
  const [configSalva, setConfigSalva] = useState<FollowupConfig>(CONFIG_PADRAO);
  /* Pendente ate a empresa salvar a configuracao uma vez (ligada ou nao). */
  const [jaConfigurado, setJaConfigurado] = useState(true);

  useEffect(() => {
    if (!isLoading) avisarConfiguracaoAlterada();
  }, [isLoading, jaConfigurado]);

  useEffect(() => {
    let ativo = true;

    const carregar = async () => {
      if (!empresaId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErro(null);

      try {
        const { data, error } = await supabase
          .from('sales_empresas_v2')
          .select('followup_config')
          .eq('empresa_id', empresaId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!ativo) {
          return;
        }

        setJaConfigurado(followupConfigurado(data?.followup_config));
        const normalizada = normalizarConfig(data?.followup_config);
        const carregada = normalizada.tentativas.length
          ? normalizada
          : { ...normalizada, tentativas: CONFIG_PADRAO.tentativas };
        setConfig(carregada);
        setConfigSalva(carregada);
      } catch (error: any) {
        console.error('Erro ao carregar configuração de follow-up:', error);

        if (ativo) {
          setErro(error?.message || 'Não foi possível carregar a configuração de follow-up.');
        }
      } finally {
        if (ativo) {
          setIsLoading(false);
        }
      }
    };

    carregar();

    return () => {
      ativo = false;
    };
  }, [empresaId]);

  const marcarSujo = useCallback(() => {
    setErro(null);
    setSucesso(null);
  }, []);

  const atualizarTentativa = (indice: number, campo: keyof Tentativa, valor: string | number) => {
    marcarSujo();
    setConfig((atual) => ({
      ...atual,
      tentativas: atual.tentativas.map((tentativa, i) =>
        i === indice ? { ...tentativa, [campo]: valor } : tentativa,
      ),
    }));
  };

  const adicionarTentativa = () => {
    marcarSujo();
    setConfig((atual) => {
      const ultima = atual.tentativas[atual.tentativas.length - 1];

      return {
        ...atual,
        tentativas: [
          ...atual.tentativas,
          {
            horas: Math.min(MAX_HORAS, (ultima?.horas ?? MIN_HORAS - 6) + 6),
            template: FOLLOWUP_TEMPLATES[0].nome,
          },
        ].slice(0, MAX_TENTATIVAS),
      };
    });
  };

  const removerTentativa = (indice: number) => {
    marcarSujo();
    setConfig((atual) => ({
      ...atual,
      tentativas: atual.tentativas.filter((_, i) => i !== indice),
    }));
  };

  const problemaValidacao = useMemo(() => {
    if (!config.ativo) {
      return null;
    }

    if (!config.tentativas.length) {
      return 'Adicione ao menos uma tentativa ou desligue os follow-ups.';
    }

    for (let i = 0; i < config.tentativas.length; i += 1) {
      const tentativa = config.tentativas[i];

      if (!Number.isInteger(tentativa.horas) || tentativa.horas < MIN_HORAS || tentativa.horas > MAX_HORAS) {
        return `A ${i + 1}ª tentativa precisa ser entre ${MIN_HORAS} e ${MAX_HORAS} horas depois da última mensagem do lead.`;
      }

      if (i > 0 && tentativa.horas <= config.tentativas[i - 1].horas) {
        return `A ${i + 1}ª tentativa precisa vir depois da ${i}ª — as horas são contadas desde a última mensagem do lead.`;
      }

      if (!buscarTemplate(tentativa.template)) {
        return `Escolha um modelo para a ${i + 1}ª tentativa.`;
      }
    }

    return null;
  }, [config]);

  const handleSalvar = async () => {
    if (!empresaId) {
      setErro('Não foi possível identificar a empresa.');
      return;
    }

    if (problemaValidacao) {
      setErro(problemaValidacao);
      return;
    }

    setIsSaving(true);
    setErro(null);
    setSucesso(null);

    try {
      const { error } = await supabase
        .from('sales_empresas_v2')
        .update({ followup_config: config })
        .eq('empresa_id', empresaId);

      if (error) {
        throw error;
      }

      setConfigSalva(config);
      setJaConfigurado(true);
      setIsEditando(false);
      setSucesso('Follow-ups salvos com sucesso.');
    } catch (error: any) {
      console.error('Erro ao salvar follow-ups:', error);
      setErro(error?.message || 'Não foi possível salvar os follow-ups.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditar = () => {
    setErro(null);
    setSucesso(null);
    setIsEditando(true);
  };

  const handleCancelar = () => {
    setConfig(configSalva);
    setErro(null);
    setSucesso(null);
    setIsEditando(false);
  };

  const renderCampos = (cfg: FollowupConfig, editavel: boolean) => (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-panel border border-line-soft bg-card px-4 py-4">
            <div>
              <p className="text-xs font-medium text-muted-soft">Cadência automática</p>
              <p className="mt-2 text-sm font-semibold text-ink">
                {cfg.ativo ? 'Ligada' : 'Desligada'}
              </p>
              {!cfg.ativo ? (
                <p className="mt-2 max-w-xl text-xs leading-5 text-muted">
                  Com a cadência desligada, nenhum follow-up é enviado.
                </p>
              ) : null}
            </div>

            <Alternador
              ligado={cfg.ativo}
              rotulo="Ativar follow-ups automáticos"
              desabilitado={!editavel}
              onChange={() => {
                marcarSujo();
                setConfig((atual) => ({ ...atual, ativo: !atual.ativo }));
              }}
            />
          </div>

          <div className="space-y-3 rounded-panel border border-line-soft bg-card px-4 py-4">
            <p className="text-xs font-medium text-muted-soft">Tentativas</p>

            {cfg.tentativas.map((tentativa, indice) => {
              const template = buscarTemplate(tentativa.template);

              return (
                <div
                  key={indice}
                  className="space-y-3 rounded-panel border border-line-soft bg-paper px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-lime text-[11px] font-bold text-ink">
                      {indice + 1}
                    </span>

                    <label className="flex items-center gap-2 text-xs text-muted">
                      Enviar
                      <input
                        type="number"
                        min={MIN_HORAS}
                        max={MAX_HORAS}
                        disabled={!editavel}
                        value={tentativa.horas}
                        onChange={(evento) =>
                          atualizarTentativa(indice, 'horas', Number(evento.target.value))
                        }
                        className="w-20 rounded-panel border border-line bg-card px-3 py-1.5 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25 disabled:cursor-not-allowed disabled:opacity-70"
                      />
                      horas depois da última mensagem do lead
                    </label>

                    {editavel ? (
                      <button
                        type="button"
                        onClick={() => removerTentativa(indice)}
                        className="ml-auto inline-flex items-center gap-1 rounded-pill border border-line px-2.5 py-1 text-[11px] font-semibold text-muted transition-colors hover:text-red-600"
                      >
                        <Trash2 size={12} />
                        Remover
                      </button>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={tentativa.template}
                      disabled={!editavel}
                      onChange={(evento) =>
                        atualizarTentativa(indice, 'template', evento.target.value)
                      }
                      className="rounded-panel border border-line bg-card px-3 py-2 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {FOLLOWUP_TEMPLATES.map((opcao) => (
                        <option key={opcao.nome} value={opcao.nome}>
                          {opcao.titulo}
                        </option>
                      ))}
                    </select>
                  </div>

                  {template ? (
                    <>
                      <p className="rounded-panel border border-line-soft bg-card px-3 py-2 text-xs leading-5 text-muted">
                        <span className="font-semibold text-muted-soft">Exemplo: </span>
                        {renderizarTemplate(template.corpo, 'Marcos')}
                      </p>
                      <p className="text-[11px] leading-4 text-muted-soft">{template.descricao}</p>
                    </>
                  ) : null}
                </div>
              );
            })}

            {!editavel ? null : cfg.tentativas.length < MAX_TENTATIVAS ? (
              <button
                type="button"
                onClick={adicionarTentativa}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-stone"
              >
                <Plus size={13} />
                Adicionar tentativa
              </button>
            ) : (
              <p className="text-[11px] text-muted-soft">
                Limite de {MAX_TENTATIVAS} tentativas atingido.
              </p>
            )}
          </div>

          <div className="space-y-3 rounded-panel border border-line-soft bg-card px-4 py-4">
            <p className="text-xs font-medium text-muted-soft">Quando as tentativas se esgotarem</p>

            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                disabled={!editavel}
                checked={cfg.ao_esgotar.marcar_perdido}
                onChange={() => {
                  marcarSujo();
                  setConfig((atual) => ({
                    ...atual,
                    ao_esgotar: {
                      ...atual.ao_esgotar,
                      marcar_perdido: !atual.ao_esgotar.marcar_perdido,
                    },
                  }));
                }}
                className="h-3.5 w-3.5 accent-lime disabled:cursor-not-allowed"
              />
              Marcar o lead como perdido
            </label>

            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                disabled={!editavel}
                checked={cfg.ao_esgotar.notificar}
                onChange={() => {
                  marcarSujo();
                  setConfig((atual) => ({
                    ...atual,
                    ao_esgotar: { ...atual.ao_esgotar, notificar: !atual.ao_esgotar.notificar },
                  }));
                }}
                className="h-3.5 w-3.5 accent-lime disabled:cursor-not-allowed"
              />
              Notificar o responsável pelo atendimento
            </label>
          </div>

          {cfg.ativo && cfg.tentativas.length ? (
            <p className="text-[11px] leading-5 text-muted-soft">
              Resumo: {cfg.tentativas.map((t) => descreverPrazo(t.horas)).join(' · ')} depois da
              última mensagem do lead. Se ele responder a qualquer momento, a cadência para e o
              contador zera.
            </p>
          ) : null}
        </div>
  );

  /* Fora do popup so o resumo; a configuracao completa fica dentro dele. */
  const renderResumo = (cfg: FollowupConfig) => (
    <div className="space-y-2 rounded-panel border border-line-soft bg-card px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-soft">Cadência automática</p>
        <span
          className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${
            cfg.ativo ? 'bg-lime text-ink' : 'bg-stone text-muted'
          }`}
        >
          {cfg.ativo ? 'Ligada' : 'Desligada'}
        </span>
      </div>

      {cfg.ativo && cfg.tentativas.length ? (
        <>
          <ul className="space-y-1.5 pt-1">
            {cfg.tentativas.map((tentativa, indice) => (
              <li key={indice} className="flex items-center gap-2 text-xs text-muted">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-lime text-[10px] font-bold text-ink">
                  {indice + 1}
                </span>
                <span className="font-semibold text-ink">{descreverPrazo(tentativa.horas)}</span>
                <span>· {buscarTemplate(tentativa.template)?.titulo || 'Modelo não encontrado'}</span>
              </li>
            ))}
          </ul>
          <p className="pt-1 text-[11px] leading-5 text-muted-soft">
            Ao esgotar:{' '}
            {[
              cfg.ao_esgotar.marcar_perdido ? 'marca como perdido' : null,
              cfg.ao_esgotar.notificar ? 'notifica o responsável' : null,
            ]
              .filter(Boolean)
              .join(' e ') || 'nada é feito'}
            .
          </p>
        </>
      ) : null}
    </div>
  );

  const descricao = (
    <>
      Quando o KOTTA IA faz uma pergunta durante a cotação e o lead não volta, ele retoma a conversa
      automaticamente pelo mesmo canal do atendimento. Vale enquanto a cotação ainda está coletando
      dados, antes de ir para aprovação. Máximo de {MAX_TENTATIVAS} mensagens, enviadas sempre das 08h às 18h
      (horário de Brasília).
    </>
  );

  if (!podeEditar) {
    return null;
  }

  return (
    <div className="rounded-panel border border-line-soft bg-paper p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-tile bg-card text-muted shadow-sm">
            <AlarmClock size={16} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">Follow-ups</h3>
              <PilulaPendente pendente={!isLoading && !jaConfigurado} />
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">{descricao}</p>
          </div>
        </div>

        {!isLoading ? (
          <button
            type="button"
            onClick={handleEditar}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-panel border border-line bg-card px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-ink/25"
          >
            <Pencil size={13} />
            Editar
          </button>
        ) : null}
      </div>

      {erro && !isEditando ? (
        <div className="mb-4 rounded-panel border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {erro}
        </div>
      ) : null}

      {sucesso ? (
        <div className="mb-4 rounded-panel border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {sucesso}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-panel border border-line-soft bg-card px-4 py-6 text-sm text-muted">
          Carregando configuração de follow-up...
        </div>
      ) : (
        renderResumo(configSalva)
      )}

      {isEditando ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,20,0.55)] px-4 py-6 backdrop-blur-sm">
          <div className="absolute inset-0" aria-hidden="true" onClick={handleCancelar} />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="followups-modal-title"
            className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-card border border-line-soft bg-card shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line-soft px-6 py-5 max-lg:px-4 max-lg:py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-lime/20 text-ink">
                  <AlarmClock size={18} />
                </div>
                <div>
                  <h2 id="followups-modal-title" className="text-base font-semibold tracking-tight text-ink">
                    Follow-ups
                  </h2>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-muted">{descricao}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCancelar}
                  disabled={isSaving}
                  className="rounded-panel border border-line bg-card px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSalvar}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-panel bg-lime px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save size={16} />
                  {isSaving ? 'Salvando...' : 'Salvar follow-ups'}
                </button>
              </div>
            </div>

            {erro ? (
              <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm font-medium text-red-600">{erro}</div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto bg-paper px-6 py-5 max-lg:px-4 max-lg:py-4">
              {renderCampos(config, true)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default FollowUpSection;
