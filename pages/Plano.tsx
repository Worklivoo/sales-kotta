import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  cancelarPlano,
  fetchCatalogoPlanos,
  fetchConsumoPlano,
  resgatarTrial,
  verificarStatusPagamento,
  type CatalogoOpcao,
  type ConsumoResposta,
} from '../lib/planoApi';
import PlanoCards from '../components/plano/PlanoCards';
import PlanoAtualCard from '../components/plano/PlanoAtualCard';
import ConsumoCard from '../components/plano/ConsumoCard';
import ProximaFaturaCard from '../components/plano/ProximaFaturaCard';
import FormaPagamentoCard from '../components/plano/FormaPagamentoCard';
import FaturasTable from '../components/plano/FaturasTable';
import TrialBanner from '../components/plano/TrialBanner';
import TrocarPlanoModal from '../components/plano/TrocarPlanoModal';
import AssinarModal from '../components/plano/AssinarModal';
import CreditosExtraModal from '../components/plano/CreditosExtraModal';
import ResgatarTrialModal from '../components/plano/ResgatarTrialModal';

const PlanoPage: React.FC = () => {
  const [carregandoAcesso, setCarregandoAcesso] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [consumo, setConsumo] = useState<ConsumoResposta | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoOpcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  const [mostrarTrocarPlano, setMostrarTrocarPlano] = useState(false);
  const [mostrarCreditosExtra, setMostrarCreditosExtra] = useState(false);
  const [opcaoParaAssinar, setOpcaoParaAssinar] = useState<CatalogoOpcao | null>(null);

  useEffect(() => {
    let ativo = true;

    const carregarAcesso = async () => {
      setCarregandoAcesso(true);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user?.id) {
          if (ativo) setIsAdmin(false);
          return;
        }

        const { data, error } = await supabase
          .from('sales_membros_v2')
          .select('cargo')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (error) throw error;
        if (ativo) setIsAdmin(data?.cargo === 'ADMIN');
      } catch (error) {
        console.error('Erro ao carregar permissao da pagina de plano:', error);
        if (ativo) setIsAdmin(false);
      } finally {
        if (ativo) setCarregandoAcesso(false);
      }
    };

    carregarAcesso();

    return () => {
      ativo = false;
    };
  }, []);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    setErroCarregamento(null);

    try {
      const [consumoResposta, catalogoResposta] = await Promise.all([
        fetchConsumoPlano(),
        fetchCatalogoPlanos(),
      ]);

      setConsumo(consumoResposta);
      setCatalogo(catalogoResposta.planos);
    } catch (error: any) {
      setErroCarregamento(error?.message || 'Não foi possível carregar os dados do plano.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      carregarDados();
    }
  }, [isAdmin, carregarDados]);

  const executar = async (acao: () => Promise<void>) => {
    setEnviando(true);
    setAviso(null);

    try {
      await acao();
    } catch (error: any) {
      setAviso({ tipo: 'erro', texto: error?.message || 'Não foi possível completar a operação.' });
    } finally {
      setEnviando(false);
    }
  };

  const abrirAssinatura = (planoCodigo: string, ciclo: string) => {
    const opcao = catalogo.find((item) => item.planoCodigo === planoCodigo && item.ciclo === ciclo);
    if (!opcao) return;

    setMostrarTrocarPlano(false);
    setOpcaoParaAssinar(opcao);
  };

  const aoConcluirAssinatura = async () => {
    setOpcaoParaAssinar(null);
    await carregarDados();
    setAviso({ tipo: 'sucesso', texto: 'Assinatura confirmada com sucesso.' });
  };

  const cancelar = () =>
    executar(async () => {
      const resultado = await cancelarPlano();
      await carregarDados();
      setAviso({ tipo: 'sucesso', texto: resultado.message });
    });

  /* Fechar o modal sempre recarrega: mesmo sem pagar, a cobranca ja existe e
     precisa aparecer no historico de faturas. */
  const fecharCreditosExtra = async () => {
    setMostrarCreditosExtra(false);
    await carregarDados();
  };

  const aoConcluirCreditosExtra = async () => {
    setMostrarCreditosExtra(false);
    await carregarDados();
    setAviso({
      tipo: 'sucesso',
      texto: 'Pagamento confirmado. As cotações extras já estão no seu limite.',
    });
  };

  /* Fallback do webhook: o cliente confirma na hora que pagou uma fatura
     pendente. Se o pagamento ja caiu, o proprio endpoint atualiza a fatura
     (e o limite, no caso de cotacoes extras). */
  const confirmarPagamentoFatura = async (paymentId: string) => {
    setAviso(null);

    try {
      const resultado = await verificarStatusPagamento(paymentId);
      await carregarDados();

      setAviso(
        resultado.pago
          ? { tipo: 'sucesso', texto: 'Pagamento confirmado. A fatura já está quitada.' }
          : {
              tipo: 'erro',
              texto:
                'Ainda não identificamos o pagamento desta fatura. Se você acabou de pagar, aguarde alguns instantes e tente de novo.',
            },
      );
    } catch (error: any) {
      setAviso({ tipo: 'erro', texto: error?.message || 'Não foi possível verificar o pagamento.' });
    }
  };

  const resgatar = async (codigo: string) => {
    const resultado = await resgatarTrial(codigo);
    await carregarDados();
    setAviso({ tipo: 'sucesso', texto: resultado.message });
  };

  if (carregandoAcesso) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink/10 border-t-ink" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-full w-full items-center justify-center px-4 text-center">
        <div>
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-tile bg-stone">
            <ShieldCheck size={19} className="text-muted" />
          </div>
          <p className="mt-3 text-[14px] text-ink" style={{ fontWeight: 700 }}>
            Acesso restrito
          </p>
          <p className="mt-1 text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
            Somente administradores podem ver o plano e a cobrança da empresa.
          </p>
        </div>
      </div>
    );
  }

  const empresa = consumo?.empresa;
  const temAssinatura = Boolean(empresa?.temAssinaturaAtiva);
  const emTrial = !temAssinatura && Boolean(empresa?.emTrialAtivo);

  return (
    <div className="h-full w-full overflow-y-auto font-sans">
      <div className="flex min-h-full flex-col gap-5 pb-10">
        <section className="flex flex-wrap items-end justify-between gap-3 px-1 pt-1">
          <div>
            <h1 className="text-[22px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.02em' }}>
              Planos e Cobrança
            </h1>
            <p className="text-[13.5px] text-muted" style={{ fontWeight: 500 }}>
              Acompanhe o consumo, a cobrança e a assinatura da sua empresa.
            </p>
          </div>

          {/* Com plano ativo nao ha o que resgatar - o link fica so no trial,
              onde serve para estender o periodo com um codigo maior. */}
          {emTrial ? <ResgatarTrialModal onResgatar={resgatar} /> : null}
        </section>

        {aviso ? (
          <div
            className={`rounded-panel p-4 text-[13px] ${
              aviso.tipo === 'sucesso' ? 'bg-lime/25 text-ink' : 'bg-red-50 text-red-700'
            }`}
            style={{ fontWeight: 600 }}
          >
            {aviso.texto}
          </div>
        ) : null}

        {erroCarregamento ? (
          <div className="rounded-panel bg-red-50 p-4 text-[13px] text-red-700" style={{ fontWeight: 600 }}>
            {erroCarregamento}
          </div>
        ) : null}

        {carregando || !consumo || !empresa ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink/10 border-t-ink" />
          </div>
        ) : temAssinatura ? (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <PlanoAtualCard
                empresa={empresa}
                isSubmitting={enviando}
                onCancelar={cancelar}
                onUpgrade={() => setMostrarTrocarPlano(true)}
              />
              <ConsumoCard
                consumo={consumo.consumoCiclo}
                isSubmitting={enviando}
                onUpgrade={() => setMostrarTrocarPlano(true)}
                onComprarCreditos={() => setMostrarCreditosExtra(true)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ProximaFaturaCard empresa={empresa} />
              <FormaPagamentoCard empresa={empresa} />
            </div>

            <FaturasTable faturas={consumo.faturas} onConfirmarPagamento={confirmarPagamentoFatura} />
          </>
        ) : emTrial ? (
          <>
            <TrialBanner
              dataFinalTrial={empresa.dataFinalTrial}
              qtdCotacoes={consumo.consumoCiclo.qtdCotacoes}
            />

            <div className="rounded-panel bg-card p-6 sm:p-8">
              <PlanoCards
                opcoes={catalogo}
                planoAtualCodigo={null}
                cicloAtual={null}
                isSubmitting={enviando}
                onEscolher={abrirAssinatura}
              />
            </div>

            {consumo.faturas.length ? <FaturasTable faturas={consumo.faturas} onConfirmarPagamento={confirmarPagamentoFatura} /> : null}
          </>
        ) : (
          <>
            <div className="rounded-panel bg-card p-6 sm:p-8">
              <PlanoCards
                opcoes={catalogo}
                planoAtualCodigo={null}
                cicloAtual={null}
                isSubmitting={enviando}
                onEscolher={abrirAssinatura}
              />

              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-line-soft pt-6 text-center">
                <span className="inline-flex items-center gap-1.5 text-[12px] text-muted" style={{ fontWeight: 500 }}>
                  <ShieldCheck size={14} /> Pagamento processado com segurança
                </span>
                <ResgatarTrialModal onResgatar={resgatar} />
              </div>
            </div>

            {consumo.faturas.length ? <FaturasTable faturas={consumo.faturas} onConfirmarPagamento={confirmarPagamentoFatura} /> : null}
          </>
        )}

        {mostrarTrocarPlano && empresa ? (
          <TrocarPlanoModal
            opcoes={catalogo}
            planoAtualCodigo={empresa.planoCodigo}
            cicloAtual={empresa.planoCiclo}
            onEscolher={abrirAssinatura}
            onFechar={() => setMostrarTrocarPlano(false)}
          />
        ) : null}

        {mostrarCreditosExtra && empresa ? (
          <CreditosExtraModal
            pacotes={consumo?.pacotesExtras || []}
            empresa={empresa}
            onSucesso={aoConcluirCreditosExtra}
            onFechar={fecharCreditosExtra}
          />
        ) : null}

        {opcaoParaAssinar && empresa ? (
          <AssinarModal
            opcao={opcaoParaAssinar}
            empresa={empresa}
            jaTemAssinatura={temAssinatura}
            onSucesso={aoConcluirAssinatura}
            onFechar={() => setOpcaoParaAssinar(null)}
          />
        ) : null}
      </div>
    </div>
  );
};

export default PlanoPage;
