import React, { useEffect, useState } from 'react';
import { MessageSquareText, Pencil, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PilulaPendente } from '../../components/StatusConfiguracao';
import { avisarConfiguracaoAlterada, mensagemAutomaticaConfigurada } from '../../lib/pendenciasConfiguracao';

interface CategoriaMensagem {
  ativo: boolean;
  mensagem: string;
}

type MensagensPorCategoria = Record<string, CategoriaMensagem | undefined>;

interface CategoriaDefinicao {
  key: string;
  titulo: string;
  descricao: string;
  placeholder: string;
}

const CATEGORIAS: CategoriaDefinicao[] = [
  {
    key: 'FINANCEIRO',
    titulo: 'Financeiro',
    descricao: 'Mensagens sobre boletos, notas fiscais, cobrança, dados bancários.',
    placeholder:
      'Recebemos sua mensagem sobre o assunto financeiro. Nosso time vai verificar e retornar em breve.',
  },
  {
    key: 'DUVIDA_TECNICA',
    titulo: 'Dúvida técnica',
    descricao: 'Perguntas técnicas sobre produto, aplicação, especificação, compatibilidade.',
    placeholder:
      'Obrigado pela sua pergunta! Um de nossos especialistas vai te responder em breve.',
  },
  {
    key: 'RECLAMACAO',
    titulo: 'Reclamação',
    descricao: 'Reclamações sobre produto, prazo, atendimento ou entrega.',
    placeholder:
      'Lamentamos pelo ocorrido. Sua mensagem foi registrada e nosso time vai entrar em contato o quanto antes.',
  },
  {
    key: 'OUTROS',
    titulo: 'Outros assuntos',
    descricao: 'Qualquer assunto que não se encaixe nas demais categorias.',
    placeholder: 'Recebemos sua mensagem! Nosso time vai analisar e retornar em breve.',
  },
  {
    key: 'PEDIDO_COMPRA',
    titulo: 'Pedido de compra',
    descricao:
      'Autorização de faturamento, envio de pedido de compra/PO, aprovação de orçamento pedindo nota fiscal.',
    placeholder:
      'Recebemos seu pedido de compra! Nosso time vai confirmar os detalhes e dar sequência o quanto antes.',
  },
];

const EMPTY_MENSAGENS: MensagensPorCategoria = CATEGORIAS.reduce((acc, cat) => {
  acc[cat.key] = { ativo: false, mensagem: '' };
  return acc;
}, {} as MensagensPorCategoria);

const MensagensAutomaticasTab: React.FC = () => {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagensPorCategoria>(EMPTY_MENSAGENS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  /* O que esta gravado no banco: e o que o resumo mostra e para onde o
     Cancelar volta. */
  const [mensagensSalvas, setMensagensSalvas] = useState<MensagensPorCategoria>(EMPTY_MENSAGENS);
  const [isEditando, setIsEditando] = useState(false);

  const pendente = !isLoading && !loadError && !mensagemAutomaticaConfigurada(mensagensSalvas);

  useEffect(() => {
    if (!isLoading) avisarConfiguracaoAlterada();
  }, [isLoading, pendente]);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setIsLoading(true);
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

        const { data: memberRow, error: memberError } = await supabase
          .from('sales_membros_v2')
          .select('empresa_id')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (memberError) {
          throw memberError;
        }

        if (!memberRow?.empresa_id) {
          throw new Error('Não foi possível identificar a empresa vinculada ao usuário.');
        }

        const { data: empresaRow, error: empresaError } = await supabase
          .from('sales_empresas_v2')
          .select('mensagens_automaticas_categoria')
          .eq('empresa_id', memberRow.empresa_id)
          .maybeSingle();

        if (empresaError) {
          throw empresaError;
        }

        if (!isMounted) {
          return;
        }

        setCompanyId(memberRow.empresa_id);

        const carregado = (empresaRow?.mensagens_automaticas_categoria as MensagensPorCategoria) || {};
        const mesclado: MensagensPorCategoria = {};
        CATEGORIAS.forEach((cat) => {
          mesclado[cat.key] = {
            ativo: Boolean(carregado[cat.key]?.ativo),
            mensagem: carregado[cat.key]?.mensagem || '',
          };
        });
        setMensagens(mesclado);
        setMensagensSalvas(mesclado);
      } catch (error: any) {
        console.error('Erro ao carregar mensagens automáticas:', error);

        if (!isMounted) {
          return;
        }

        setLoadError(error?.message || 'Não foi possível carregar as mensagens automáticas.');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggle = (categoriaKey: string) => {
    setMensagens((current) => ({
      ...current,
      [categoriaKey]: {
        ativo: !current[categoriaKey]?.ativo,
        mensagem: current[categoriaKey]?.mensagem || '',
      },
    }));
    setSaveError(null);
    setSaveSuccess(null);
  };

  const handleMensagemChange = (categoriaKey: string, valor: string) => {
    setMensagens((current) => ({
      ...current,
      [categoriaKey]: {
        ativo: Boolean(current[categoriaKey]?.ativo),
        mensagem: valor,
      },
    }));
    setSaveError(null);
    setSaveSuccess(null);
  };

  const handleSave = async () => {
    if (!companyId) {
      setSaveError('Não foi possível identificar a empresa do usuário.');
      return;
    }

    const ativandoSemTexto = CATEGORIAS.find(
      (cat) => mensagens[cat.key]?.ativo && !mensagens[cat.key]?.mensagem?.trim(),
    );

    if (ativandoSemTexto) {
      setSaveError(
        `Preencha o texto da mensagem de "${ativandoSemTexto.titulo}" antes de ativar, ou desative essa categoria.`,
      );
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const { error } = await supabase
        .from('sales_empresas_v2')
        .update({ mensagens_automaticas_categoria: mensagens })
        .eq('empresa_id', companyId);

      if (error) {
        throw error;
      }

      setMensagensSalvas(mensagens);
      setIsEditando(false);
      setSaveSuccess('Mensagens automáticas salvas com sucesso.');
    } catch (error: any) {
      console.error('Erro ao salvar mensagens automáticas:', error);
      setSaveError(error?.message || 'Não foi possível salvar as mensagens automáticas.');
    } finally {
      setIsSaving(false);
    }
  };

  const abrirEdicao = () => {
    setMensagens(mensagensSalvas);
    setSaveError(null);
    setSaveSuccess(null);
    setIsEditando(true);
  };

  const cancelarEdicao = () => {
    setMensagens(mensagensSalvas);
    setSaveError(null);
    setIsEditando(false);
  };

  const descricao =
    'Quando um lead manda uma mensagem que não é pedido de cotação (financeiro, dúvida técnica, reclamação, etc), o KOTTA IA não gera orçamento — só notifica seu time. Aqui você configura uma resposta automática opcional para cada categoria, que é enviada pro lead na hora (por e-mail ou WhatsApp, dependendo de onde ele mandou a mensagem), além da notificação interna que já acontece.';

  return (
    <div className="space-y-5">
      <section className="rounded-panel border border-line-soft bg-paper p-5 max-lg:p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-lime text-ink">
              <MessageSquareText className="h-5 w-5" />
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-ink">Mensagens Automáticas</h2>
                <PilulaPendente pendente={pendente} />
              </div>
              <p className="max-w-2xl text-sm leading-6 text-muted">{descricao}</p>
            </div>
          </div>

          {!isLoading && !loadError ? (
            <button
              type="button"
              onClick={abrirEdicao}
              className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-panel border border-line bg-card px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-ink/25"
            >
              <Pencil size={13} />
              Editar
            </button>
          ) : null}
        </div>
      </section>

      {loadError ? (
        <div className="rounded-panel border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {loadError}
        </div>
      ) : null}

      {saveSuccess ? (
        <div className="rounded-panel border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {saveSuccess}
        </div>
      ) : null}

      <section className="rounded-panel border border-line-soft bg-card shadow-[0_16px_50px_rgba(15,23,42,0.04)]">
        {isLoading ? (
          <div className="px-5 py-10 text-sm text-muted">Carregando mensagens automáticas...</div>
        ) : (
          <div className="divide-y divide-line-soft">
            {CATEGORIAS.map((categoria) => {
              const config = mensagensSalvas[categoria.key] || { ativo: false, mensagem: '' };
              const ativa = config.ativo && Boolean(config.mensagem.trim());

              return (
                <div key={categoria.key} className="flex items-start justify-between gap-4 px-5 py-4 max-lg:px-4">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-ink">{categoria.titulo}</p>
                    <p className="line-clamp-2 text-sm leading-6 text-muted">
                      {ativa ? config.mensagem : 'Sem resposta automática.'}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-semibold ${
                      ativa ? 'bg-lime text-ink' : 'bg-stone text-muted'
                    }`}
                  >
                    {ativa ? 'Ativa' : 'Desativada'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {isEditando ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,20,0.55)] px-4 py-6 backdrop-blur-sm">
          <div className="absolute inset-0" aria-hidden="true" onClick={cancelarEdicao} />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mensagens-modal-title"
            className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-card border border-line-soft bg-card shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line-soft px-6 py-5 max-lg:px-4 max-lg:py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-lime/20 text-ink">
                  <MessageSquareText size={18} />
                </div>
                <div>
                  <h2 id="mensagens-modal-title" className="text-base font-semibold tracking-tight text-ink">
                    Mensagens Automáticas
                  </h2>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
                    Ative as categorias que devem receber resposta automática e escreva o texto de cada uma.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={cancelarEdicao}
                  disabled={isSaving}
                  className="rounded-panel border border-line bg-card px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-panel bg-lime px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save size={16} />
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>

            {saveError ? (
              <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm font-medium text-red-600">{saveError}</div>
            ) : null}

            <div className="min-h-0 flex-1 divide-y divide-line-soft overflow-y-auto bg-card">
              {CATEGORIAS.map((categoria) => {
                const config = mensagens[categoria.key] || { ativo: false, mensagem: '' };

                return (
                  <div key={categoria.key} className="space-y-3 px-6 py-5 max-lg:px-4">
                    <div className="flex items-start justify-between gap-4 max-lg:flex-wrap">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-ink">{categoria.titulo}</p>
                        <p className="text-sm leading-6 text-muted">{categoria.descricao}</p>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={config.ativo}
                        aria-label={categoria.titulo}
                        onClick={() => handleToggle(categoria.key)}
                        className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-pill transition-colors ${
                          config.ativo ? 'bg-lime' : 'bg-stone'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-pill bg-card shadow-sm transition-transform ${
                            config.ativo ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <textarea
                      value={config.mensagem}
                      onChange={(event) => handleMensagemChange(categoria.key, event.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-panel border border-line bg-paper px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25"
                      placeholder={categoria.placeholder}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MensagensAutomaticasTab;
