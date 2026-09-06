import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, ChevronLeft, ChevronRight, FileText, Mail, MessageCircle, Settings, Bell, X, ArrowUpRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SidebarProps {
  isCollapsed: boolean;
  toggleCollapse: () => void;
  onLogout: () => void;
  currentPath: string;
  onNavigate: (path: string) => void;
}

interface NotificationRecord {
  notificacao_id: string;
  notificacao_tipo: string | null;
  notificacao_titulo: string | null;
  notificacao_descricao: string | null;
  atendimento_id: string | null;
  criado_em: string;
  notificacao_lida?: boolean | null;
}

const EASE = 'cubic-bezier(.22,1,.36,1)';

const formatNotificationDate = (value: string) => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsedDate);
};

const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  toggleCollapse,
  onLogout,
  currentPath,
  onNavigate,
}) => {
  const sidebarWidth = isCollapsed ? 'w-20' : 'w-[280px]';
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notificationsFilter, setNotificationsFilter] = useState<'UNREAD' | 'ALL'>('UNREAD');
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const notificationsPanelLeft = isCollapsed
    ? 'calc(1rem + 5rem + 1rem)'
    : 'calc(1rem + 17.5rem + 1rem)';
  const navigationItems = [
    {
      label: 'Cotações',
      path: '/cotacoes',
      icon: FileText,
    },
    {
      label: 'E-mails',
      path: '/email',
      icon: Mail,
    },
    {
      label: 'WhatsApp',
      path: '/whatsapp',
      icon: MessageCircle,
    },
    {
      label: 'Configurações',
      path: '/configuracoes',
      icon: Settings,
    },
  ];

  const loadNotifications = useCallback(async () => {
    setIsLoadingNotifications(true);
    setNotificationsError(null);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.user?.id) {
        setNotifications([]);
        return;
      }

      const { data: memberRow, error: memberError } = await supabase
        .from('sales_membros_v2')
        .select('membro_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (memberError) {
        throw memberError;
      }

      if (!memberRow?.membro_id) {
        setNotifications([]);
        return;
      }

      const { data, error } = await supabase
        .from('sales_notificacoes_v2')
        .select('notificacao_id, tipo, titulo, descricao, atendimento_id, created_at, lida')
        .eq('membro_id', memberRow.membro_id)
        .neq('tipo', 'ERRO_AUTOMACAO')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const mappedNotifications: NotificationRecord[] = (data ?? []).map((item) => ({
        notificacao_id: item.notificacao_id,
        notificacao_tipo: item.tipo,
        notificacao_titulo: item.titulo,
        notificacao_descricao: item.descricao,
        atendimento_id: item.atendimento_id,
        criado_em: item.created_at,
        notificacao_lida: item.lida,
      }));

      setNotifications(mappedNotifications);
    } catch (error: any) {
      console.error('Erro ao carregar notificacoes:', error);
      setNotificationsError(error?.message || 'Nao foi possivel carregar as notificacoes.');
      setNotifications([]);
    } finally {
      setIsLoadingNotifications(false);
    }
  }, []);

  const handleOpenNotification = useCallback(
    async (notification: NotificationRecord) => {
      if (!notification.atendimento_id) {
        return;
      }

      const wasUnread = !notification.notificacao_lida;

      if (wasUnread) {
        setNotifications((currentNotifications) =>
          currentNotifications.map((item) =>
            item.notificacao_id === notification.notificacao_id
              ? { ...item, notificacao_lida: true }
              : item,
          ),
        );
      }

      const { data: atendimentoData, error: atendimentoError } = await supabase
        .from('sales_atendimentos_v2')
        .select('empresa_id, numero_ticket')
        .eq('atendimento_id', notification.atendimento_id)
        .maybeSingle();

      if (atendimentoError) {
        console.error('Erro ao localizar rota da cotacao:', atendimentoError);
        return;
      }

      const empresaId =
        atendimentoData && typeof atendimentoData.empresa_id === 'string'
          ? atendimentoData.empresa_id
          : null;
      const numeroTicket =
        atendimentoData?.numero_ticket !== null && atendimentoData?.numero_ticket !== undefined
          ? String(atendimentoData.numero_ticket)
          : null;

      if (!empresaId || !numeroTicket) {
        return;
      }

      setIsNotificationsOpen(false);
      onNavigate(`/cotacao/${encodeURIComponent(empresaId)}/${encodeURIComponent(numeroTicket)}`);

      if (!wasUnread) {
        return;
      }

      const { error } = await supabase
        .from('sales_notificacoes_v2')
        .update({ lida: true })
        .eq('notificacao_id', notification.notificacao_id);

      if (error) {
        console.error('Erro ao marcar notificacao como lida:', error);

        setNotifications((currentNotifications) =>
          currentNotifications.map((item) =>
            item.notificacao_id === notification.notificacao_id
              ? { ...item, notificacao_lida: false }
              : item,
          ),
        );
      }
    },
    [onNavigate],
  );

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (isNotificationsOpen) {
      loadNotifications();
    }
  }, [isNotificationsOpen, loadNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.notificacao_lida).length,
    [notifications],
  );

  const filteredNotifications = useMemo(() => {
    if (notificationsFilter === 'UNREAD') {
      return notifications.filter((notification) => !notification.notificacao_lida);
    }

    return notifications;
  }, [notifications, notificationsFilter]);

  return (
    <>
      {isNotificationsOpen && (
        <button
          type="button"
          aria-label="Fechar painel de notificações"
          onClick={() => setIsNotificationsOpen(false)}
          className="fixed inset-0 z-10 bg-ink/10 backdrop-blur-[2px]"
        />
      )}

      {isNotificationsOpen && (
        <aside
          className="fixed top-4 bottom-4 z-30 w-[430px] max-w-[calc(100vw-8rem)] overflow-hidden rounded-card border border-line-soft bg-card max-lg:!left-3 max-lg:right-3 max-lg:w-auto max-lg:max-w-none"
          style={{
            left: notificationsPanelLeft,
            boxShadow: '0 34px 64px -34px rgba(20,20,20,.45)',
            ...(typeof window !== 'undefined' && window.innerWidth < 1024
              ? {
                  top: 'calc(var(--mobile-header-h) + 12px)',
                  bottom: 'calc(var(--mobile-bottom-nav-h) + 12px)',
                }
              : {}),
          }}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-line-soft px-6 py-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="text-[16px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.02em' }}>
                  Notificações
                </div>

                <button
                  type="button"
                  onClick={() => setIsNotificationsOpen(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-stone text-ink transition-colors hover:bg-stone-deep"
                  style={{ transitionDuration: '.22s', transitionTimingFunction: EASE }}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="inline-flex rounded-pill border border-line bg-stone p-1">
                <button
                  type="button"
                  onClick={() => setNotificationsFilter('UNREAD')}
                  className="rounded-pill px-4 py-2 text-[13px] transition-all"
                  style={{
                    fontWeight: 700,
                    transitionDuration: '.22s',
                    transitionTimingFunction: EASE,
                    ...(notificationsFilter === 'UNREAD'
                      ? { background: 'var(--white)', color: 'var(--ink)', boxShadow: '0 6px 18px rgba(20,20,20,.08)' }
                      : { color: 'var(--muted)' }),
                  }}
                >
                  Não lidas
                </button>
                <button
                  type="button"
                  onClick={() => setNotificationsFilter('ALL')}
                  className="rounded-pill px-4 py-2 text-[13px] transition-all"
                  style={{
                    fontWeight: 700,
                    transitionDuration: '.22s',
                    transitionTimingFunction: EASE,
                    ...(notificationsFilter === 'ALL'
                      ? { background: 'var(--white)', color: 'var(--ink)', boxShadow: '0 6px 18px rgba(20,20,20,.08)' }
                      : { color: 'var(--muted)' }),
                  }}
                >
                  Todos
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="flex min-h-full flex-col gap-3 rounded-panel bg-paper p-3">
                {isLoadingNotifications ? (
                  <>
                    {[0, 1, 2].map((item) => (
                      <div
                        key={item}
                        className="animate-pulse rounded-tile border border-line-soft bg-card p-5"
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="h-6 w-32 rounded-pill bg-stone-deep/70" />
                          <div className="h-4 w-24 rounded-pill bg-stone-deep/70" />
                        </div>
                        <div className="h-5 w-4/5 rounded-pill bg-stone-deep/70" />
                        <div className="mt-3 h-4 w-full rounded-pill bg-stone-deep/70" />
                        <div className="mt-2 h-4 w-3/4 rounded-pill bg-stone-deep/70" />
                      </div>
                    ))}
                  </>
                ) : notificationsError ? (
                  <div className="flex min-h-full flex-1 flex-col items-center justify-center rounded-tile border border-rose-200 bg-rose-50 px-6 py-10 text-center">
                    <div className="text-[14px] text-rose-700" style={{ fontWeight: 700 }}>
                      Não foi possível carregar as notificações
                    </div>
                    <div className="mt-2 max-w-[280px] text-[13px] leading-6 text-rose-700/80" style={{ fontWeight: 500 }}>
                      {notificationsError}
                    </div>
                    <button
                      type="button"
                      onClick={loadNotifications}
                      className="mt-5 rounded-[9px] bg-rose-600 px-4 py-2.5 text-[13px] text-white transition-colors hover:bg-rose-700"
                      style={{ fontWeight: 700, transitionDuration: '.22s', transitionTimingFunction: EASE }}
                    >
                      Tentar novamente
                    </button>
                  </div>
                ) : filteredNotifications.length === 0 ? (
                  <div className="flex min-h-full flex-1 flex-col items-center justify-center rounded-tile border border-dashed border-line px-6 py-10 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-tile bg-lime/20 text-ink">
                      <Bell size={24} />
                    </div>
                    <div className="mt-4 text-[14px] text-ink" style={{ fontWeight: 700 }}>
                      {notificationsFilter === 'UNREAD'
                        ? 'Nenhuma notificação não lida'
                        : 'Nenhuma notificação por enquanto'}
                    </div>
                    <div className="mt-2 max-w-[280px] text-[13px] leading-6 text-muted" style={{ fontWeight: 500 }}>
                      {notificationsFilter === 'UNREAD'
                        ? 'As notificações pendentes de leitura aparecerão aqui.'
                        : 'Quando houver atualizações importantes das suas cotações, elas aparecerão aqui.'}
                    </div>
                  </div>
                ) : (
                  filteredNotifications.map((notification) => {
                    const isUnread = !notification.notificacao_lida;

                    return (
                      <article
                        key={notification.notificacao_id}
                        className={`rounded-tile border px-4 py-3.5 transition-all ${
                          isUnread
                            ? 'border-line bg-card shadow-[0_12px_28px_rgba(20,20,20,.08)]'
                            : 'border-line-soft bg-card/80 shadow-[0_6px_18px_rgba(20,20,20,.03)]'
                        }`}
                        style={{ transitionDuration: '.22s', transitionTimingFunction: EASE }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-[14.5px] leading-5 text-ink" style={{ fontWeight: 700 }}>
                              {notification.notificacao_titulo || 'Notificação sem título'}
                            </div>

                            <div className="mt-1.5 text-[13px] leading-5 text-muted" style={{ fontWeight: 500 }}>
                              {notification.notificacao_descricao || 'Sem descrição disponível.'}
                            </div>

                            <div className="mt-3 text-[11.5px] text-muted-soft" style={{ fontWeight: 500 }}>
                              {formatNotificationDate(notification.criado_em)}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              void handleOpenNotification(notification);
                            }}
                            aria-label="Abrir atendimento"
                            disabled={!notification.atendimento_id}
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-line bg-stone transition-colors ${
                              notification.atendimento_id
                                ? 'text-muted hover:bg-stone-deep hover:text-ink'
                                : 'cursor-not-allowed text-muted-soft/60'
                            }`}
                            style={{ transitionDuration: '.22s', transitionTimingFunction: EASE }}
                          >
                            <ArrowUpRight size={15} />
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </aside>
      )}

      <div
        className={`${sidebarWidth} hidden lg:flex fixed left-4 top-4 bottom-4 bg-ink rounded-card flex-col justify-between py-8 px-4 z-20 transition-all duration-300 font-sans`}
        style={{ transitionTimingFunction: EASE, boxShadow: '0 34px 64px -34px rgba(20,20,20,.6)' }}
      >
        <div>
          <div className={`flex items-center ${isCollapsed ? 'justify-center flex-col gap-4' : 'justify-between'} mb-10 px-1`}>
            <div className={`flex min-w-0 items-center ${isCollapsed ? '' : 'gap-2.5'}`}>
              <div className="w-12 h-12 rounded-tile flex items-center justify-center shrink-0 overflow-hidden">
                <img src="/Símbolo_Worklivoo_Fundo_Amarelo.png" alt="Logo" className="w-full h-full object-cover" />
              </div>

              {!isCollapsed && (
                <div className="min-w-0">
                  <div
                    className="truncate text-[13px] leading-tight text-white"
                    style={{ fontWeight: 800, letterSpacing: '-.01em' }}
                  >
                    KOTTA IA
                  </div>
                  <div
                    className="truncate text-[9px] leading-tight text-white/50"
                    style={{ fontWeight: 700, letterSpacing: '.12em' }}
                  >
                    MÓDULO DE VENDAS
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={toggleCollapse}
              className="w-10 h-10 rounded-tile flex items-center justify-center text-white bg-white/10 hover:bg-white/16 transition-colors"
              style={{ transitionDuration: '.22s', transitionTimingFunction: EASE }}
            >
              {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                currentPath === item.path ||
                (item.path === '/cotacoes' && currentPath.startsWith('/cotacao/'));

              return (
                <button
                  key={item.path}
                  onClick={() => onNavigate(item.path)}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-tile transition-all w-full ${
                    isCollapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-white/8 text-lime'
                      : 'text-white/55 hover:bg-white/8 hover:text-white'
                  }`}
                  style={{ transitionDuration: '.22s', transitionTimingFunction: EASE }}
                >
                  <Icon size={22} className="shrink-0" strokeWidth={isActive ? 2.25 : 2} />
                  {!isCollapsed && (
                    <span
                      className="whitespace-nowrap overflow-hidden text-ellipsis animate-in fade-in slide-in-from-left-2 duration-200 text-[14px]"
                      style={{ fontWeight: 700 }}
                    >
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setIsNotificationsOpen((current) => !current)}
            aria-expanded={isNotificationsOpen}
            aria-haspopup="dialog"
            className={`flex items-center gap-3 px-4 py-3.5 rounded-tile transition-all w-full ${
              isCollapsed ? 'justify-center' : ''
            } ${
              isNotificationsOpen
                ? 'bg-white/8 text-lime'
                : 'text-white/55 hover:bg-white/8 hover:text-white'
            }`}
            style={{ transitionDuration: '.22s', transitionTimingFunction: EASE }}
          >
            <div className="relative shrink-0">
              <Bell size={22} className="shrink-0" strokeWidth={isNotificationsOpen ? 2.25 : 2} />
              {unreadCount > 0 && (
                <span
                  className="absolute -right-2 -top-2 flex min-w-[20px] items-center justify-center rounded-pill bg-red-500 px-1.5 py-0.5 text-[10px] leading-none text-white"
                  style={{ fontWeight: 700, boxShadow: '0 6px 18px rgba(220,38,38,.4)' }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1 overflow-hidden text-left">
                <div
                  className="whitespace-nowrap overflow-hidden text-ellipsis animate-in fade-in slide-in-from-left-2 duration-200 text-[14px]"
                  style={{ fontWeight: 700 }}
                >
                  Notificações
                </div>
                <div className="text-[11.5px] text-white/45" style={{ fontWeight: 500 }}>
                  {unreadCount > 0
                    ? `${unreadCount} nova${unreadCount > 1 ? 's' : ''}`
                    : 'Sem pendências'}
                </div>
              </div>
            )}
          </button>
          <button
            onClick={onLogout}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-tile text-red-400/90 hover:bg-red-500/15 hover:text-red-300 transition-all w-full ${isCollapsed ? 'justify-center' : ''}`}
            style={{ transitionDuration: '.22s', transitionTimingFunction: EASE }}
          >
            <LogOut size={22} className="shrink-0" />
            {!isCollapsed && (
              <span
                className="whitespace-nowrap overflow-hidden text-ellipsis animate-in fade-in slide-in-from-left-2 duration-200 text-[14px]"
                style={{ fontWeight: 700 }}
              >
                Sair
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Mobile top bar (visible below lg only) */}
      <header
        className="lg:hidden fixed top-0 inset-x-0 z-20 flex items-center justify-between bg-ink px-4 font-sans"
        style={{ height: 'var(--mobile-header-h)', paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-tile shrink-0">
          <img src="/Símbolo_Worklivoo_Fundo_Amarelo.png" alt="Logo" className="w-full h-full object-cover" />
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsNotificationsOpen((current) => !current)}
            aria-expanded={isNotificationsOpen}
            aria-haspopup="dialog"
            aria-label="Notificações"
            className={`relative flex h-9 w-9 items-center justify-center rounded-tile transition-colors ${
              isNotificationsOpen ? 'bg-white/8 text-lime' : 'text-white/70 hover:bg-white/8 hover:text-white'
            }`}
            style={{ transitionDuration: '.22s', transitionTimingFunction: EASE }}
          >
            <Bell size={20} strokeWidth={isNotificationsOpen ? 2.25 : 2} />
            {unreadCount > 0 && (
              <span
                className="absolute -right-1 -top-1 flex min-w-[17px] items-center justify-center rounded-pill bg-red-500 px-1 py-0.5 text-[9px] leading-none text-white"
                style={{ fontWeight: 700 }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onLogout}
            aria-label="Sair"
            className="flex h-9 w-9 items-center justify-center rounded-tile text-red-400/90 transition-colors hover:bg-red-500/15 hover:text-red-300"
            style={{ transitionDuration: '.22s', transitionTimingFunction: EASE }}
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Mobile bottom navigation (visible below lg only) */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-20 flex items-stretch justify-around bg-ink px-1 pt-1.5 font-sans"
        style={{ minHeight: 'var(--mobile-bottom-nav-h)', paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}
      >
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            currentPath === item.path ||
            (item.path === '/cotacoes' && currentPath.startsWith('/cotacao/'));

          return (
            <button
              key={item.path}
              onClick={() => onNavigate(item.path)}
              className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-tile px-1 py-2 transition-colors ${
                isActive ? 'text-lime' : 'text-white/55 hover:text-white'
              }`}
              style={{ transitionDuration: '.22s', transitionTimingFunction: EASE }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.25 : 2} />
              <span className="text-[10.5px] leading-none" style={{ fontWeight: 700 }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
};

export default Sidebar;
