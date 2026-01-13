import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import RequisitionsPage from './pages/Requisitions';
import SuppliersPage from './pages/Suppliers';
import SettingsPage from './pages/Settings';
import SubscriptionPage from './pages/Subscription';
import QuotePage from './pages/QuotePage';
import LoginPage from './pages/Login';
import { supabase } from './lib/supabase';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null); // null means loading state
  const [activeTab, setActiveTab] = useState<'requisitions' | 'suppliers' | 'settings' | 'subscription'>(() => {
    const path = window.location.pathname;
    if (path.startsWith('/requisicao/')) return 'requisitions';
    if (path === '/fornecedores') return 'suppliers';
    if (path === '/configuracoes') return 'settings';
    if (path === '/assinatura') return 'subscription';
    return 'requisitions';
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Initialize quoteId from URL synchronously to avoid initial render flash or missed state
  const [quoteId, setQuoteId] = useState<string | null>(() => {
    const path = window.location.pathname;
    if (path.startsWith('/cotacao/')) {
      let id = path.split('/cotacao/')[1];
      if (id) {
        if (id.endsWith('/')) id = id.slice(0, -1);
        if (id.includes('?')) id = id.split('?')[0];
        return id;
      }
    }
    return null;
  });

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path.startsWith('/requisicao/')) setActiveTab('requisitions');
      else if (path === '/fornecedores') setActiveTab('suppliers');
      else if (path === '/configuracoes') setActiveTab('settings');
      else if (path === '/assinatura') setActiveTab('subscription');
      else setActiveTab('requisitions');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // If we are on a quote page, render it directly (bypassing main app layout)
  if (quoteId) {
    return <QuotePage quoteId={quoteId} />;
  }

  if (isAuthenticated === null) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F6F6F6]">
        <div className="w-10 h-10 border-2 border-black/10 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => {}} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={(tab) => {
          setActiveTab(tab);
          let newPath = '/';
          if (tab === 'suppliers') newPath = '/fornecedores';
          if (tab === 'settings') newPath = '/configuracoes';
          if (tab === 'subscription') newPath = '/assinatura';
          window.history.pushState({}, '', newPath);
        }}
        isCollapsed={isSidebarCollapsed}
        toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      
      <main 
        className={`flex-1 h-full overflow-hidden py-6 pr-6 lg:py-10 lg:pr-10 transition-all duration-300 ease-in-out w-full ${
          isSidebarCollapsed ? 'pl-[120px]' : 'pl-[320px]'
        }`}
      >
        <div className="max-w-[1600px] mx-auto h-full w-full">
          {activeTab === 'requisitions' && <RequisitionsPage />}
          {activeTab === 'suppliers' && <SuppliersPage />}
          {activeTab === 'settings' && <SettingsPage />}
          {activeTab === 'subscription' && <SubscriptionPage />}
        </div>
      </main>
    </div>
  );
}

export default App;