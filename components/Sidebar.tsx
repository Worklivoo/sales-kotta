import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, ChevronLeft, ChevronRight, FileText, Users, Settings, Bell, X, ArrowUpRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SidebarProps {
  isCollapsed: boolean;
  toggleCollapse: () => void;
  onLogout: () => void;
  currentPath: string;
  onNavigate: (path: string) => void;
}

interface NotificationRecord {
  notificacao_id: number;
  notificacao_tipo: string | null;
  notificacao_titulo: string | null;
  notificacao_descricao: string | null;
  atendimento_id: string | null;
  criado_em: string;
  notificacao_lida?: boolean | null;
}

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
      label: 'Atendimentos',
      path: '/atendimentos',
      icon: Users,
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

      const { data, error } = await supabase
        .from('sales_notificacoes')
        .select(
          'notificacao_id, notificacao_tipo, notificacao_titulo, notificacao_descricao, atendimento_id, criado_em, notificacao_lida',
        )
        .eq('membro_id', session.user.id)
        .order('criado_em', { ascending: false });

      if (error) {
        throw error;
      }

      setNotifications((data ?? []) as NotificationRecord[]);
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
        .from('sales_atendimento')
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
        .from('sales_notificacoes')
        .update({ notificacao_lida: true })
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
          className="fixed inset-0 z-10 bg-black/10 backdrop-blur-[2px]"
        />
      )}

      {isNotificationsOpen && (
        <aside
          className="fixed top-4 bottom-4 z-30 w-[430px] max-w-[calc(100vw-8rem)] overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.18)]"
          style={{ left: notificationsPanelLeft }}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-black/5 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,0.90)_100%)] px-6 py-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold text-black">Notificacoes</div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsNotificationsOpen(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-black/[0.04] text-black transition-colors hover:bg-black/[0.08]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="inline-flex rounded-[22px] border border-black/6 bg-black/[0.03] p-1">
                <button
                  type="button"
                  onClick={() => setNotificationsFilter('UNREAD')}
                  className={`rounded-[18px] px-4 py-2 text-sm font-medium transition-all ${
                    notificationsFilter === 'UNREAD'
                      ? 'bg-white text-black shadow-[0_6px_18px_rgba(15,23,42,0.08)]'
                      : 'text-black/55 hover:text-black'
                  }`}
                >
                  Nao lidas
                </button>
                <button
                  type="button"
                  onClick={() => setNotificationsFilter('ALL')}
                  className={`rounded-[18px] px-4 py-2 text-sm font-medium transition-all ${
                    notificationsFilter === 'ALL'
                      ? 'bg-white text-black shadow-[0_6px_18px_rgba(15,23,42,0.08)]'
                      : 'text-black/55 hover:text-black'
                  }`}
                >
                  Todos
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="flex min-h-full flex-col gap-3 rounded-[26px] bg-[#F8FAFC] p-3">
                {isLoadingNotifications ? (
                  <>
                    {[0, 1, 2].map((item) => (
                      <div
                        key={item}
                        className="animate-pulse rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="h-6 w-32 rounded-full bg-black/6" />
                          <div className="h-4 w-24 rounded-full bg-black/6" />
                        </div>
                        <div className="h-5 w-4/5 rounded-full bg-black/6" />
                        <div className="mt-3 h-4 w-full rounded-full bg-black/6" />
                        <div className="mt-2 h-4 w-3/4 rounded-full bg-black/6" />
                      </div>
                    ))}
                  </>
                ) : notificationsError ? (
                  <div className="flex min-h-full flex-1 flex-col items-center justify-center rounded-[24px] border border-rose-200 bg-rose-50 px-6 py-10 text-center">
                    <div className="text-base font-semibold text-rose-700">
                      Nao foi possivel carregar as notificacoes
                    </div>
                    <div className="mt-2 max-w-[280px] text-sm leading-6 text-rose-700/80">
                      {notificationsError}
                    </div>
                    <button
                      type="button"
                      onClick={loadNotifications}
                      className="mt-5 rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-700"
                    >
                      Tentar novamente
                    </button>
                  </div>
                ) : filteredNotifications.length === 0 ? (
                  <div className="flex min-h-full flex-1 flex-col items-center justify-center rounded-[24px] border border-dashed border-black/10 bg-white px-6 py-10 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-primary/18 text-black">
                      <Bell size={24} />
                    </div>
                    <div className="mt-4 text-base font-semibold text-black">
                      {notificationsFilter === 'UNREAD'
                        ? 'Nenhuma notificacao nao lida'
                        : 'Nenhuma notificacao por enquanto'}
                    </div>
                    <div className="mt-2 max-w-[280px] text-sm leading-6 text-black/50">
                      {notificationsFilter === 'UNREAD'
                        ? 'As notificacoes pendentes de leitura aparecerao aqui.'
                        : 'Quando houver atualizacoes importantes das suas cotacoes, elas aparecerao aqui.'}
                    </div>
                  </div>
                ) : (
                  filteredNotifications.map((notification) => {
                    const isUnread = !notification.notificacao_lida;

                    return (
                      <article
                        key={notification.notificacao_id}
                        className={`rounded-[20px] border px-4 py-3.5 transition-all ${
                          isUnread
                            ? 'border-black/12 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.08)]'
                            : 'border-black/6 bg-white/78 shadow-[0_6px_18px_rgba(15,23,42,0.03)]'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-[15px] font-semibold leading-5 text-black">
                              {notification.notificacao_titulo || 'Notificacao sem titulo'}
                            </div>

                            <div className="mt-1.5 text-sm leading-5 text-black/58">
                              {notification.notificacao_descricao || 'Sem descricao disponivel.'}
                            </div>

                            <div className="mt-3 text-[12px] font-medium text-black/42">
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
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-[#F8FAFC] transition-colors ${
                              notification.atendimento_id
                                ? 'text-black/55 hover:bg-black/[0.04] hover:text-black'
                                : 'cursor-not-allowed text-black/25'
                            }`}
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
        className={`${sidebarWidth} fixed left-4 top-4 bottom-4 bg-primary rounded-2xl flex flex-col justify-between py-8 px-4 z-20 transition-all duration-300 ease-in-out shadow-[0_10px_26px_rgba(0,0,0,0.10)]`}
      >
        <div>
          <div className={`flex items-center ${isCollapsed ? 'justify-center flex-col gap-4' : 'justify-between'} mb-10 px-1`}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform hover:scale-105 overflow-hidden bg-black">
              <img src="/logo-worklivoo-fundo-preto.png" alt="Logo" className="w-full h-full object-cover" />
            </div>

            <button 
              onClick={toggleCollapse}
              className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-black hover:bg-gray-50 transition-colors shadow-sm"
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
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all w-full ${
                    isCollapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-white text-black shadow-sm'
                      : 'text-black hover:bg-white/10'
                  }`}
                >
                  <Icon size={22} className="shrink-0" />
                  {!isCollapsed && (
                    <span className="font-medium whitespace-nowrap overflow-hidden text-ellipsis animate-in fade-in slide-in-from-left-2 duration-200">
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
            className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl text-black hover:bg-white/10 transition-all w-full ${
              isCollapsed ? 'justify-center' : ''
            } ${isNotificationsOpen ? 'bg-white/10 shadow-sm' : ''}`}
          >
            <div className="relative shrink-0">
              <Bell size={22} className="shrink-0" />
              {unreadCount > 0 && (
                <span className="absolute -right-2 -top-2 flex min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-[0_6px_18px_rgba(220,38,38,0.32)]">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="font-medium whitespace-nowrap overflow-hidden text-ellipsis animate-in fade-in slide-in-from-left-2 duration-200">
                  Notificacoes
                </div>
                <div className="text-xs text-black/55">
                  {unreadCount > 0
                    ? `${unreadCount} nova${unreadCount > 1 ? 's' : ''}`
                    : 'Sem pendencias'}
                </div>
              </div>
            )}
          </button>
          <button 
            onClick={onLogout}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl text-red-600 hover:bg-red-500/10 transition-all group w-full ${isCollapsed ? 'justify-center' : ''}`}
          >
            <LogOut size={22} className="shrink-0" />
            {!isCollapsed && <span className="font-medium whitespace-nowrap overflow-hidden text-ellipsis animate-in fade-in slide-in-from-left-2 duration-200">Sair</span>}
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
