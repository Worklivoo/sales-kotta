import React from 'react';
import { LogOut, ChevronLeft, ChevronRight, FileText, Users } from 'lucide-react';

interface SidebarProps {
  isCollapsed: boolean;
  toggleCollapse: () => void;
  onLogout: () => void;
  currentPath: string;
  onNavigate: (path: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  toggleCollapse,
  onLogout,
  currentPath,
  onNavigate,
}) => {
  const sidebarWidth = isCollapsed ? 'w-20' : 'w-[280px]';
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
  ];

  return (
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
          onClick={onLogout}
          className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl text-red-600 hover:bg-red-500/10 transition-all group w-full ${isCollapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={22} className="shrink-0" />
          {!isCollapsed && <span className="font-medium whitespace-nowrap overflow-hidden text-ellipsis animate-in fade-in slide-in-from-left-2 duration-200">Sair</span>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
