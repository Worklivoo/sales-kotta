import React, { useEffect, useMemo, useState } from 'react';
import EmailTab from './configuracoes/EmailTab';
import GeralTab from './configuracoes/GeralTab';
import MembrosTab from './configuracoes/MembrosTab';
import { supabase } from '../lib/supabase';

type ConfigTabKey = 'geral' | 'membros' | 'email';

const tabs: Array<{ key: ConfigTabKey; label: string }> = [
  { key: 'geral', label: 'Geral' },
  { key: 'membros', label: 'Membros' },
  { key: 'email', label: 'Email' },
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
          .from('sales_membros_empresa')
          .select('cargo')
          .eq('membro_id', session.user.id)
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
    <div className="h-full w-full overflow-y-auto">
      <div className="flex min-h-full flex-col gap-4">
        <section className="rounded-2xl border border-black/5 bg-white shadow-[0_16px_50px_rgba(15,23,42,0.06)]">
          <div className="border-b border-black/5 px-5 py-5 sm:px-6">
            <div className="space-y-1">
              <h1 className="text-lg font-semibold tracking-tight text-gray-900">Configuracoes</h1>
              <p className="text-sm text-gray-500">
                Gerencie as configuracoes gerais da sua conta e operacao.
              </p>
            </div>
          </div>

          <div className="border-b border-black/5 px-5 py-4 sm:px-6">
            <div
              className="flex flex-wrap items-center gap-2"
              role="tablist"
              aria-label="Abas de configuracoes"
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
                    className={`inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[#EBF57D] text-gray-900'
                        : 'bg-[#FAFAFA] text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            id={`configuracoes-tabpanel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`configuracoes-tab-${activeTab}`}
            className="px-5 py-5 sm:px-6"
          >
            {activeTab === 'geral' ? <GeralTab /> : null}
            {activeTab === 'membros' && isAdminMember ? <MembrosTab /> : null}
            {activeTab === 'email' ? <EmailTab /> : null}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ConfiguracoesPage;
