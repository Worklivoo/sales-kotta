import React, { useEffect, useState } from 'react';
import { MessageSquareText, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';

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

      setSaveSuccess('Mensagens automáticas salvas com sucesso.');
    } catch (error: any) {
      console.error('Erro ao salvar mensagens automáticas:', error);
      setSaveError(error?.message || 'Não foi possível salvar as mensagens automáticas.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-panel border border-line-soft bg-paper p-5 max-lg:p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-lime text-ink">
            <MessageSquareText className="h-5 w-5" />
          </div>

          <div className="space-y-1">
            <h2 className="text-base font-semibold text-ink">Mensagens Automáticas</h2>
            <p className="max-w-2xl text-sm leading-6 text-muted">
              Quando um lead manda uma mensagem que não é pedido de cotação (financeiro, dúvida
              técnica, reclamação, etc), o KOTTA IA não gera orçamento — só notifica seu time. Aqui você
              configura uma resposta automática opcional para cada categoria, que é enviada pro
              lead na hora (por e-mail ou WhatsApp, dependendo de onde ele mandou a mensagem),
              além da notificação interna que já acontece.
            </p>
          </div>
        </div>
      </section>

      {loadError ? (
        <div className="rounded-panel border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {loadError}
        </div>
      ) : null}

      {saveError ? (
        <div className="rounded-panel border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {saveError}
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
              const config = mensagens[categoria.key] || { ativo: false, mensagem: '' };

              return (
                <div key={categoria.key} className="space-y-3 px-5 py-5 max-lg:px-4">
                  <div className="flex items-start justify-between gap-4 max-lg:flex-wrap">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-ink">{categoria.titulo}</p>
                      <p className="text-sm leading-6 text-muted">{categoria.descricao}</p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={config.ativo}
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
        )}
      </section>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || isLoading}
          className="inline-flex items-center gap-2 rounded-panel bg-lime px-5 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save size={16} />
          {isSaving ? 'Salvando...' : 'Salvar mensagens'}
        </button>
      </div>
    </div>
  );
};

export default MensagensAutomaticasTab;
