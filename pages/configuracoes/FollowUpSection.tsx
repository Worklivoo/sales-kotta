import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlarmClock, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { FOLLOWUP_TEMPLATES, buscarTemplate, renderizarTemplate } from '../../lib/followupTemplates';

/* Teto duro. A RPC sales_v2_followup_registrar recusa a partir da quarta
   tentativa, entao subir esse numero aqui sozinho nao libera nada - so cria
   uma configuracao que o banco ignora. */
const MAX_TENTATIVAS = 3;

/* Preco de MARKETING para o Brasil na tabela da Meta. Os modelos sao enviados
   como UTILITY (mais barata), mas a Meta pode recategorizar - por isso a tela
   usa o preco de marketing como teto ("ate US$ X"). Nao serve para faturamento. */
const CUSTO_USD_POR_MENSAGEM = 0.0625;

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
    { horas: 24, template: 'sales_kotta_fup_ajuda' },
    { horas: 72, template: 'sales_kotta_fup_ultima' },
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
          { horas: (ultima?.horas ?? 12) * 2, template: FOLLOWUP_TEMPLATES[0].nome },
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

      if (!Number.isFinite(tentativa.horas) || tentativa.horas < 1) {
        return `A ${i + 1}ª tentativa precisa de um prazo de pelo menos 1 hora.`;
      }

      if (i > 0 && tentativa.horas <= config.tentativas[i - 1].horas) {
        return `A ${i + 1}ª tentativa precisa vir depois da ${i}ª — as horas são contadas desde a última mensagem do lead.`;
      }

      if (!buscarTemplate(tentativa.template)) {
        return `Escolha um modelo para a ${i + 1}ª tentativa.`;
      }
    }

    if (
      config.horario_comercial.ativo &&
      config.horario_comercial.inicio >= config.horario_comercial.fim
    ) {
      return 'O horário de início precisa ser menor que o de término.';
    }

    return null;
  }, [config]);

  const custoEstimado = (config.tentativas.length * CUSTO_USD_POR_MENSAGEM).toFixed(2);

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
            <h3 className="text-sm font-semibold text-ink">Follow-ups</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">
              Quando a IA faz uma pergunta e o lead não volta, o KOTTA IA cutuca ele automaticamente
              para retomar a cotação. Máximo de {MAX_TENTATIVAS} mensagens — cada uma é um template
              cobrado pela Meta.
            </p>
          </div>
        </div>

        {!isLoading && !isEditando ? (
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

      {erro ? (
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
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-panel border border-line-soft bg-card px-4 py-4">
            <div>
              <p className="text-xs font-medium text-muted-soft">Cadência automática</p>
              <p className="mt-2 text-sm font-semibold text-ink">
                {config.ativo ? 'Ligada' : 'Desligada'}
              </p>
              <p className="mt-2 max-w-xl text-xs leading-5 text-muted">
                {config.ativo
                  ? `Custo estimado de até US$ ${custoEstimado} por lead que não responder.`
                  : 'Com a cadência desligada, você ainda pode enviar follow-ups manualmente pelo botão na tela da cotação.'}
              </p>
            </div>

            <Alternador
              ligado={config.ativo}
              rotulo="Ativar follow-ups automáticos"
              desabilitado={!isEditando}
              onChange={() => {
                marcarSujo();
                setConfig((atual) => ({ ...atual, ativo: !atual.ativo }));
              }}
            />
          </div>

          <div className="space-y-3 rounded-panel border border-line-soft bg-card px-4 py-4">
            <p className="text-xs font-medium text-muted-soft">Tentativas</p>

            {config.tentativas.map((tentativa, indice) => {
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
                        min={1}
                        max={336}
                        disabled={!isEditando}
                        value={tentativa.horas}
                        onChange={(evento) =>
                          atualizarTentativa(indice, 'horas', Number(evento.target.value))
                        }
                        className="w-20 rounded-panel border border-line bg-card px-3 py-1.5 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25 disabled:cursor-not-allowed disabled:opacity-70"
                      />
                      horas depois da última mensagem do lead
                    </label>

                    {isEditando ? (
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
                      disabled={!isEditando}
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
                        {renderizarTemplate(template.corpo, 'Marcos')}
                      </p>
                      <p className="text-[11px] leading-4 text-muted-soft">{template.descricao}</p>
                    </>
                  ) : null}
                </div>
              );
            })}

            {!isEditando ? null : config.tentativas.length < MAX_TENTATIVAS ? (
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
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-ink">Somente em horário comercial</p>
                <p className="mt-1 max-w-xl text-xs leading-5 text-muted">
                  Follow-up vencido fora da janela espera a próxima janela em vez de tocar o celular
                  do lead de madrugada.
                </p>
              </div>

              <Alternador
                ligado={config.horario_comercial.ativo}
                rotulo="Enviar somente em horário comercial"
                desabilitado={!isEditando}
                onChange={() => {
                  marcarSujo();
                  setConfig((atual) => ({
                    ...atual,
                    horario_comercial: {
                      ...atual.horario_comercial,
                      ativo: !atual.horario_comercial.ativo,
                    },
                  }));
                }}
              />
            </div>

            {config.horario_comercial.ativo ? (
              <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-3">
                <label className="flex items-center gap-2 text-xs text-muted">
                  Das
                  <input
                    type="time"
                    disabled={!isEditando}
                    value={config.horario_comercial.inicio}
                    onChange={(evento) => {
                      marcarSujo();
                      setConfig((atual) => ({
                        ...atual,
                        horario_comercial: {
                          ...atual.horario_comercial,
                          inicio: evento.target.value,
                        },
                      }));
                    }}
                    className="rounded-panel border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink outline-none focus:border-ink/25 disabled:cursor-not-allowed disabled:opacity-70"
                  />
                  às
                  <input
                    type="time"
                    disabled={!isEditando}
                    value={config.horario_comercial.fim}
                    onChange={(evento) => {
                      marcarSujo();
                      setConfig((atual) => ({
                        ...atual,
                        horario_comercial: { ...atual.horario_comercial, fim: evento.target.value },
                      }));
                    }}
                    className="rounded-panel border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink outline-none focus:border-ink/25 disabled:cursor-not-allowed disabled:opacity-70"
                  />
                </label>

                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    disabled={!isEditando}
                    checked={config.horario_comercial.dias_uteis}
                    onChange={() => {
                      marcarSujo();
                      setConfig((atual) => ({
                        ...atual,
                        horario_comercial: {
                          ...atual.horario_comercial,
                          dias_uteis: !atual.horario_comercial.dias_uteis,
                        },
                      }));
                    }}
                    className="h-3.5 w-3.5 accent-lime disabled:cursor-not-allowed"
                  />
                  Apenas de segunda a sexta
                </label>

                <span className="text-[11px] text-muted-soft">Horário de Brasília</span>
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded-panel border border-line-soft bg-card px-4 py-4">
            <p className="text-xs font-medium text-muted-soft">Quando as tentativas se esgotarem</p>

            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                disabled={!isEditando}
                checked={config.ao_esgotar.marcar_perdido}
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
                disabled={!isEditando}
                checked={config.ao_esgotar.notificar}
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

          {config.ativo && config.tentativas.length ? (
            <p className="text-[11px] leading-5 text-muted-soft">
              Resumo: {config.tentativas.map((t) => descreverPrazo(t.horas)).join(' · ')} depois da
              última mensagem do lead. Se ele responder a qualquer momento, a cadência para e o
              contador zera.
            </p>
          ) : null}

          {isEditando ? (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelar}
                disabled={isSaving}
                className="rounded-panel border border-line bg-card px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSalvar}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-panel bg-lime px-5 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save size={16} />
                {isSaving ? 'Salvando...' : 'Salvar follow-ups'}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default FollowUpSection;
