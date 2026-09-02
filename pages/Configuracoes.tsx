import React, { useEffect, useMemo, useState } from 'react';
import BaseConhecimentoTab from './configuracoes/BaseConhecimentoTab';
import ClientesTab from './configuracoes/ClientesTab';
import EmailTab from './configuracoes/EmailTab';
import GeralTab from './configuracoes/GeralTab';
import MembrosTab from './configuracoes/MembrosTab';
import MensagensAutomaticasTab from './configuracoes/MensagensAutomaticasTab';
import NotificacoesTab from './configuracoes/NotificacoesTab';
import ProdutosTab from './configuracoes/ProdutosTab';
import { supabase } from '../lib/supabase';

type ConfigTabKey =
  | 'geral'
  | 'membros'
  | 'email'
  | 'notificacoes'
  | 'produtos'
  | 'clientes'
  | 'conhecimento'
  | 'mensagens_automaticas';

const tabs: Array<{ key: ConfigTabKey; label: string }> = [
  { key: 'geral', label: 'Geral' },
  { key: 'membros', label: 'Membros' },
  { key: 'email', label: 'Email' },
  { key: 'notificacoes', label: 'Notificações' },
  { key: 'produtos', label: 'Produtos' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'conhecimento', label: 'Base de Conhecimento' },
  { key: 'mensagens_automaticas', label: 'Mensagens Automáticas' },
];

const ConfiguracoesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ConfigTabKey>('geral');
  const [isAdminMember, setIsAdminMember] = useState(false);
  const [isAccessLoading, setIsAccessLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadMemberAccess = async () => {
      setIsAccessLoading(true);

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session?.user?.id) {
          if (isMounted) {
            setIsAdminMember(false);
          }
          return;
        }

        const { data, error } = await supabase
          .from('sales_membros_v2')
          .select('cargo')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        setIsAdminMember(data?.cargo === 'ADMIN');
      } catch (error) {
        console.error('Erro ao carregar permissao da aba de membros:', error);

        if (!isMounted) {
          return;
        }

        setIsAdminMember(false);
      } finally {
        if (isMounted) {
          setIsAccessLoading(false);
        }
      }
    };

    loadMemberAccess();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isAccessLoading && !isAdminMember && activeTab === 'membros') {
      setActiveTab('geral');
    }
  }, [activeTab, isAccessLoading, isAdminMember]);

  const visibleTabs = useMemo(
    () => tabs.filter((tab) => tab.key !== 'membros' || isAdminMember),
    [isAdminMember],
  );

  return (
    <div className="h-full w-full overflow-y-auto font-sans">
      <div className="flex min-h-full flex-col gap-4">
        <section className="flex flex-wrap items-center justify-between gap-4 px-1 pt-1">
          <div className="space-y-1">
            <h1 className="text-[22px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.02em' }}>
              Configurações
            </h1>
            <p className="text-[13.5px] text-muted" style={{ fontWeight: 500 }}>
              Gerencie as configurações gerais da sua conta e operação.
            </p>
          </div>
        </section>

        <div
          className="flex flex-wrap items-center gap-2 rounded-panel border border-line-soft bg-card p-2"
          role="tablist"
          aria-label="Abas de configurações"
        >
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`configuracoes-tabpanel-${tab.key}`}
                id={`configuracoes-tab-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center rounded-pill px-4 py-2.5 text-[13px] transition-colors ${
                  isActive ? 'bg-lime text-ink' : 'bg-paper text-muted hover:text-ink'
                }`}
                style={{ fontWeight: 700, transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <section
          id={`configuracoes-tabpanel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`configuracoes-tab-${activeTab}`}
          className="rounded-panel border border-line-soft bg-card p-5 sm:p-6"
        >
          {activeTab === 'geral' ? <GeralTab /> : null}
          {activeTab === 'membros' && isAdminMember ? <MembrosTab /> : null}
          {activeTab === 'email' ? <EmailTab /> : null}
          {activeTab === 'notificacoes' ? <NotificacoesTab /> : null}
          {activeTab === 'produtos' ? <ProdutosTab /> : null}
          {activeTab === 'clientes' ? <ClientesTab /> : null}
          {activeTab === 'conhecimento' ? <BaseConhecimentoTab /> : null}
          {activeTab === 'mensagens_automaticas' ? <MensagensAutomaticasTab /> : null}
        </section>
      </div>
    </div>
  );
};

export default ConfiguracoesPage;
