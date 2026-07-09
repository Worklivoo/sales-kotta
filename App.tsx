import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/Login';
import CotacoesPage from './pages/Cotacoes';
import CotacaoPage from './pages/Cotacao';
import AtendimentosPage from './pages/Atendimentos';
import RegisterPage from './pages/Register';
import { supabase } from './lib/supabase';
import { validateActiveMemberAccess } from './lib/memberAccess';

function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const isRegisterRoute = currentPath === '/registrar';
  const cotacaoRoutePrefix = '/cotacao/';
  const cotacaoAtendimentoId = currentPath.startsWith(cotacaoRoutePrefix)
    ? decodeURIComponent(currentPath.slice(cotacaoRoutePrefix.length))
    : null;

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  useEffect(() => {
    if (isRegisterRoute) {
      return;
    }

    let isMounted = true;
    const setUnauthenticatedState = (message: string | null = null) => {
      if (!isMounted) {
        return;
      }

      setAuthError(message);
      setIsAuthenticated(false);
    };

    const applySessionAccess = async (session: Awaited<
      ReturnType<typeof supabase.auth.getSession>
    >['data']['session']) => {
      if (!isMounted) {
        return;
      }

      if (!session?.user?.id) {
        setAuthError(null);
        setIsAuthenticated(false);
        return;
      }

      try {
        const accessValidation = await validateActiveMemberAccess(session.user.id);

        if (!isMounted) {
          return;
        }

        if (!accessValidation.allowed) {
          try {
            await supabase.auth.signOut();
          } catch (signOutError) {
            console.error('Error signing out after access denial:', signOutError);
          }

          setUnauthenticatedState(accessValidation.message);
          return;
        }

        setAuthError(null);
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Error validating member access:', error);
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          console.error('Error signing out after validation failure:', signOutError);
        }

        setUnauthenticatedState('Nao foi possivel validar seu acesso agora. Tente novamente.');
      }
    };

    const syncAuthState = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        await applySessionAccess(session);
      } catch (error) {
        console.error('Error syncing auth state:', error);
        setUnauthenticatedState('Nao foi possivel validar sua sessao agora. Tente novamente.');
      }
    };

    syncAuthState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        applySessionAccess(session).catch((error) => {
          console.error('Error handling auth state change:', error);
          setUnauthenticatedState('Nao foi possivel validar sua sessao agora. Tente novamente.');
        });
      }, 0);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [isRegisterRoute]);

  const handleNavigate = (path: string) => {
    if (window.location.pathname === path) {
      return;
    }

    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setAuthError(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Error logging out:', error);
      setAuthError(null);
      setIsAuthenticated(false);
    }
  };

  if (isRegisterRoute) {
    return <RegisterPage />;
  }

  if (isAuthenticated === null) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F6F6F6]">
        <div className="w-10 h-10 border-2 border-black/10 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage initialError={authError} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar 
        isCollapsed={isSidebarCollapsed}
        toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onLogout={handleLogout}
        currentPath={currentPath}
        onNavigate={handleNavigate}
      />
      
      <main 
        className={`flex-1 h-full overflow-hidden pr-6 lg:pr-10 py-6 lg:py-10 transition-all duration-300 ease-in-out w-full ${
          isSidebarCollapsed ? 'pl-[120px]' : 'pl-[320px]'
        }`}
      >
        <div className="h-full w-full transition-all duration-300 ease-in-out">
          {currentPath === '/cotacoes' ? (
            <CotacoesPage
              onOpenCotacao={(atendimentoId) => handleNavigate(`/cotacao/${encodeURIComponent(atendimentoId)}`)}
            />
          ) : currentPath === '/atendimentos' ? (
            <AtendimentosPage />
          ) : cotacaoAtendimentoId ? (
            <CotacaoPage atendimentoId={cotacaoAtendimentoId} />
          ) : (
            <div className="h-full w-full" />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
