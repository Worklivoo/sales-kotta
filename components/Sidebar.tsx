import React from 'react';
import { 
  FileText, 
  Truck, 
  LogOut, 
  ChevronLeft, 
  ChevronRight,
  Package2
} from 'lucide-react';

interface SidebarProps {
  activeTab: 'requisitions' | 'suppliers';
  onTabChange: (tab: 'requisitions' | 'suppliers') => void;
  isCollapsed: boolean;
  toggleCollapse: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, isCollapsed, toggleCollapse }) => {
  const sidebarWidth = isCollapsed ? 'w-20' : 'w-[280px]';

  // Common button style helper
  const getButtonStyle = (isActive: boolean) => {
    const baseStyle = `flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200 group w-full mb-1 ${isCollapsed ? 'justify-center' : ''}`;
    if (isActive) {
      return `${baseStyle} bg-white/90 shadow-sm text-black font-semibold`;
    }
    return `${baseStyle} text-black hover:bg-black/5 font-medium`;
  };

  return (
    <div 
      className={`${sidebarWidth} fixed left-4 top-4 bottom-4 bg-primary rounded-2xl flex flex-col justify-between py-8 px-4 z-20 transition-all duration-300 ease-in-out shadow-xl shadow-primary/10`}
    >
      {/* Top Section */}
      <div>
        {/* Header & Toggle */}
        <div className={`flex items-center ${isCollapsed ? 'justify-center flex-col gap-4' : 'justify-between'} mb-10 px-1`}>
          
          {/* Logo */}
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform hover:scale-105 overflow-hidden bg-black">
            <img src="/logo-worklivoo-fundo-preto.png" alt="Logo" className="w-full h-full object-cover" />
          </div>

          {/* Toggle Button */}
          <button 
            onClick={toggleCollapse}
            className={`w-10 h-10 bg-white rounded-xl flex items-center justify-center text-black hover:bg-gray-50 transition-colors shadow-sm ${isCollapsed ? '' : ''}`}
          >
            {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1">


          <button
            onClick={() => onTabChange('requisitions')}
            className={getButtonStyle(activeTab === 'requisitions')}
          >
            <FileText size={22} className="shrink-0" />
            {!isCollapsed && <span className="whitespace-nowrap overflow-hidden text-ellipsis animate-in fade-in slide-in-from-left-2 duration-200">Requisições</span>}
          </button>

          <button
            onClick={() => onTabChange('suppliers')}
            className={getButtonStyle(activeTab === 'suppliers')}
          >
            <Truck size={22} className="shrink-0" />
            {!isCollapsed && <span className="whitespace-nowrap overflow-hidden text-ellipsis animate-in fade-in slide-in-from-left-2 duration-200">Fornecedores</span>}
          </button>
          

        </nav>
      </div>

      {/* Footer Section */}
      <div className="flex flex-col gap-1">
        <button className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl text-red-600 hover:bg-red-500/10 transition-all group w-full ${isCollapsed ? 'justify-center' : ''}`}>
          <LogOut size={22} className="shrink-0" />
          {!isCollapsed && <span className="font-medium whitespace-nowrap overflow-hidden text-ellipsis animate-in fade-in slide-in-from-left-2 duration-200">Sair</span>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;