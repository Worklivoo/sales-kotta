import React, { useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/Login';
import CotacoesPage from './pages/Cotacoes';
import CotacaoPage from './pages/Cotacao';
import EmailPage from './pages/Email';
import WhatsAppPage from './pages/WhatsApp';
import ConfiguracoesPage from './pages/Configuracoes.tsx';
import PlanoPage from './pages/Plano';
import SandboxPage from './pages/Sandbox';
import RegisterPage from './pages/Register';
import { supabase } from './lib/supabase';
import { validateActiveMemberAccess } from './lib/memberAccess';
import { consumeHubHandoff } from './lib/hubHandoff';
import { irParaLoginCentral, sairPelaCentral, usarLoginLocal, voltarParaProdutos } from './lib/hubLogin';

function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  // Marca os signOut que o proprio App dispara ao barrar o acesso (ver listener).
  const barrandoAcesso = useRef(false);
  const isRegisterRoute = currentPath === '/registrar';
  const cotacaoRouteMatch = currentPath.match(/^\/cotacao\/([^/]+)\/([^/]+)$/);
  const cotacaoEmpresaId = cotacaoRouteMatch ? decodeURIComponent(cotacaoRouteMatch[1]) : null;
  const cotacaoNumeroTicket = cotacaoRouteMatch ? decodeURIComponent(cotacaoRouteMatch[2]) : null;

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
    if (currentPath !== '/' || isRegisterRoute || isAuthenticated !== true) {
      return;
    }

    window.history.replaceState({}, '', '/cotacoes');
    setCurrentPath('/cotacoes');
  }, [currentPath, isAuthenticated, isRegisterRoute]);

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
            // So deste navegador/produto: a sessao da central continua valendo
            // para a pessoa entrar no modulo que ela tem.
            barrandoAcesso.current = true;
            await supabase.auth.signOut({ scope: 'local' });
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
          barrandoAcesso.current = true;
          await supabase.auth.signOut({ scope: 'local' });
        } catch (signOutError) {
          console.error('Error signing out after validation failure:', signOutError);
        }

        setUnauthenticatedState('Nao foi possivel validar seu acesso agora. Tente novamente.');
      }
    };

    const syncAuthState = async () => {
      try {
        const handoff = await consumeHubHandoff();

        if (handoff.error) {
          setUnauthenticatedState(handoff.error);
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        /* Sessao guardada pode ter sido encerrada em outro lugar (Sair na
           central ou em outro modulo). getUser confere no servidor. */
        if (session) {
          const { error: userError } = await supabase.auth.getUser();
          if (userError) {
            await supabase.auth.signOut({ scope: 'local' });
            setUnauthenticatedState(null);
            return;
          }
        }

        await applySessionAccess(session);
      } catch (error) {
        console.error('Error syncing auth state:', error);
        setUnauthenticatedState('Nao foi possivel validar sua sessao agora. Tente novamente.');
      }
    };

    syncAuthState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      /* O SIGNED_OUT que nos mesmos disparamos ao barrar o acesso chegaria
         aqui e apagaria a mensagem, mandando a pessoa de volta pra central
         sem explicacao. A mensagem ja foi mostrada, entao ignora. */
      if (event === 'SIGNED_OUT' && barrandoAcesso.current) {
        barrandoAcesso.current = false;
        return;
      }

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
      // Encerra a sessao no servidor: vale para a central e para os outros modulos.
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error logging out:', error);
    }

    if (usarLoginLocal()) {
      setAuthError(null);
      setIsAuthenticated(false);
      return;
    }

    sairPelaCentral();
  };

  const semSessaoSemErro = isAuthenticated === false && !authError && !usarLoginLocal() && !isRegisterRoute;

  useEffect(() => {
    if (semSessaoSemErro) {
      irParaLoginCentral();
    }
  }, [semSessaoSemErro]);

  if (isRegisterRoute) {
    return <RegisterPage />;
  }

  if (isAuthenticated === null || semSessaoSemErro) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F6F6F6]">
        <div className="w-10 h-10 border-2 border-black/10 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (usarLoginLocal()) {
      return <LoginPage initialError={authError} />;
    }

    return (
      <div className="flex h-screen w-full items-center justify-center bg-paper p-6 font-sans">
        <div
          className="w-full max-w-[440px] rounded-card border border-line-soft bg-card p-8 text-center md:p-12"
          style={{ boxShadow: '0 34px 64px -34px rgba(20,20,20,.45)' }}
        >
          <h1 className="text-[21px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.025em' }}>
            Não foi possível entrar
          </h1>
          <p className="mt-2 text-[13.5px] text-muted" style={{ fontWeight: 500 }}>
            {authError}
          </p>
          <div className="mt-7 flex flex-col gap-2">
            <button
              type="button"
              onClick={voltarParaProdutos}
              className="h-[47px] rounded-[9px] bg-lime text-[14px] text-ink hover:bg-lime-deep"
              style={{ fontWeight: 700 }}
            >
              Voltar para os produtos
            </button>
            <button
              type="button"
              onClick={sairPelaCentral}
              className="text-[13px] text-muted hover:text-ink"
              style={{ fontWeight: 600 }}
            >
              Entrar com outra conta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen h-dvh overflow-hidden bg-background">
      <Sidebar 
        isCollapsed={isSidebarCollapsed}
        toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onLogout={handleLogout}
        currentPath={currentPath}
        onNavigate={handleNavigate}
      />
      
      <main
        className={`min-h-0 flex-1 h-full overflow-hidden px-4 pt-[calc(var(--mobile-header-h)_+_12px)] pb-[calc(var(--mobile-bottom-nav-h)_+_12px)] lg:pr-10 lg:pt-5 lg:pb-5 transition-all duration-300 ease-in-out w-full ${
          isSidebarCollapsed ? 'lg:pl-[120px]' : 'lg:pl-[320px]'
        }`}
      >
        <div className="h-full min-h-0 w-full transition-all duration-300 ease-in-out">
          {currentPath === '/cotacoes' ? (
            <CotacoesPage
              onOpenCotacao={(empresaId, numeroTicket) =>
                handleNavigate(
                  `/cotacao/${encodeURIComponent(empresaId)}/${encodeURIComponent(numeroTicket)}`,
                )
              }
            />
          ) : currentPath === '/email' ? (
            <EmailPage />
          ) : currentPath === '/whatsapp' ? (
            <WhatsAppPage />
          ) : currentPath === '/configuracoes' ? (
            <ConfiguracoesPage />
          ) : currentPath === '/plano' ? (
            <PlanoPage />
          ) : currentPath === '/sandbox' ? (
            <SandboxPage onNavigate={handleNavigate} />
          ) : cotacaoEmpresaId && cotacaoNumeroTicket ? (
            <CotacaoPage
              empresaId={cotacaoEmpresaId}
              numeroTicket={cotacaoNumeroTicket}
            />
          ) : (
            <div className="h-full w-full" />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
