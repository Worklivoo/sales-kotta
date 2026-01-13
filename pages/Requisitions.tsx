import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, FileText, Loader2, LayoutList, LayoutGrid, Download, Calendar } from 'lucide-react';
import { requisitionService } from '../services/requisitionService';
import { KanbanStatus, Requisition, RequisitionItem } from '../types';
import RequisitionCard from '../components/RequisitionCard';
import NewRequisitionModal from '../components/NewRequisitionModal';
import RequisitionDetail from './RequisitionDetail';

const columns: KanbanStatus[] = [
  'Novas Requisições',
  'Em análise',
  'Recebendo Propostas',
  'Avaliação/Negociações'
];

const RequisitionsPage: React.FC = () => {
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [stats, setStats] = useState({ suppliersCount: 0, itemsCount: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isNewReqModalOpen, setIsNewReqModalOpen] = useState(false);
  const [selectedRequisition, setSelectedRequisition] = useState<Requisition | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [statusFilter, setStatusFilter] = useState<KanbanStatus | 'Todos'>('Todos');
  
  // New filters states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusCategoryFilter, setStatusCategoryFilter] = useState<'Todos' | 'Aberto' | 'Finalizado' | 'Negado'>('Todos');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  const parseDate = (dateStr: string) => {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(year, month - 1, day);
  };

  const filteredRequisitions = requisitions.filter(req => {
    // 1. Kanban Status Filter (existing)
    const matchesKanbanStatus = statusFilter === 'Todos' || req.status === statusFilter;
    
    // 2. Search Term
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      req.title.toLowerCase().includes(searchLower) || 
      req.displayId.toLowerCase().includes(searchLower) ||
      req.requester.toLowerCase().includes(searchLower);

    // 3. Status Category
    const matchesCategory = statusCategoryFilter === 'Todos' || req.statusCategory === statusCategoryFilter;

    // 4. Date Range
    let matchesDate = true;
    if (dateStart || dateEnd) {
      const reqDate = parseDate(req.createdAt);
      if (dateStart) {
        const start = new Date(dateStart);
        if (reqDate < start) matchesDate = false;
      }
      if (dateEnd) {
        const end = new Date(dateEnd);
        // Set end date to end of day
        end.setHours(23, 59, 59, 999);
        if (reqDate > end) matchesDate = false;
      }
    }

    return matchesKanbanStatus && matchesSearch && matchesCategory && matchesDate;
  });

  const handleExport = () => {
    const headers = ['ID', 'Título', 'Solicitante', 'Departamento', 'Prioridade', 'Status', 'Categoria', 'Data Criação'];
    const csvContent = [
      headers.join(','),
      ...filteredRequisitions.map(req => [
        req.displayId,
        `"${req.title.replace(/"/g, '""')}"`,
        `"${req.requester.replace(/"/g, '""')}"`,
        `"${req.department.replace(/"/g, '""')}"`,
        req.priority,
        req.status,
        req.statusCategory || 'Aberto',
        req.createdAt
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `requisicoes_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [reqsData, statsData] = await Promise.all([
        requisitionService.getAll(),
        requisitionService.getStats()
      ]);
      setRequisitions(reqsData);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRequisitionCreated = () => {
    fetchData();
    setIsNewReqModalOpen(false);
  };

  // Calculate dynamic counts
  const { suppliersCount, itemsCount } = stats;
  
  // Generate next requisition ID
  const nextRequisitionId = requisitions.length > 0 
    ? `#${Math.max(...requisitions.map(r => parseInt(r.displayId.replace('#', '') || '0'))) + 1}`
    : '#1000';

  const handleCreateClick = () => setIsNewReqModalOpen(true);
  const handleCloseModal = () => setIsNewReqModalOpen(false);
  
  const handleCardClick = (req: Requisition) => {
    setSelectedRequisition(req);
    window.history.pushState({}, '', `/requisicao/${req.id}`);
  };

  useEffect(() => {
    if (isLoading) return;

    const handleUrlChange = () => {
       const path = window.location.pathname;
       if (path.startsWith('/requisicao/')) {
         let id = path.split('/requisicao/')[1];
         if (id) {
            // Remove trailing slash and query params
            id = id.split('/')[0].split('?')[0];
            const found = requisitions.find(r => r.id === id);
            if (found) {
                setSelectedRequisition(found);
            }
         }
       } else if (path === '/' || path === '/requisicoes') {
         setSelectedRequisition(null);
       }
     };

    // Check on initial load (after data fetch)
    handleUrlChange();

    // Listen for popstate (browser back/forward)
    window.addEventListener('popstate', handleUrlChange);
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, [requisitions, isLoading]);

  const handleUpdateStatus = async (newStatus: KanbanStatus) => {
    if (!selectedRequisition) return;
    
    // Optimistic update
    const previousRequisitions = [...requisitions];
    const previousSelected = { ...selectedRequisition };
    
    const updatedRequisitions = requisitions.map(req => 
      req.id === selectedRequisition.id 
        ? { ...req, status: newStatus, statusCategory: 'Aberto' as const } 
        : req
    );
    
    setRequisitions(updatedRequisitions);
    setSelectedRequisition({ ...selectedRequisition, status: newStatus, statusCategory: 'Aberto' });

    try {
      await requisitionService.updateStatus(selectedRequisition.id, newStatus);
    } catch (error) {
      console.error('Failed to update status:', error);
      // Revert changes on error
      setRequisitions(previousRequisitions);
      setSelectedRequisition(previousSelected);
    }
  };

  const handleDeny = async () => {
    if (!selectedRequisition) return;

    const previousRequisitions = [...requisitions];
    const previousSelected = { ...selectedRequisition };

    // Update locally
    const updatedRequisitions = requisitions.map(req => 
      req.id === selectedRequisition.id 
        ? { ...req, statusCategory: 'Negado' as const } 
        : req
    );
    
    setRequisitions(updatedRequisitions);
    setSelectedRequisition({ ...selectedRequisition, statusCategory: 'Negado' });

    try {
      await requisitionService.deny(selectedRequisition.id);
    } catch (error) {
      console.error('Failed to deny requisition:', error);
      // Revert changes on error
      setRequisitions(previousRequisitions);
      setSelectedRequisition(previousSelected);
    }
  };

  const handleFinalize = async () => {
    if (!selectedRequisition) return;

    const previousRequisitions = [...requisitions];
    const previousSelected = { ...selectedRequisition };

    // Update locally
    const updatedRequisitions = requisitions.map(req => 
      req.id === selectedRequisition.id 
        ? { ...req, statusCategory: 'Finalizado' as const } 
        : req
    );
    
    setRequisitions(updatedRequisitions);
    setSelectedRequisition({ ...selectedRequisition, statusCategory: 'Finalizado' });

    try {
      await requisitionService.finalize(selectedRequisition.id);
    } catch (error) {
      console.error('Failed to finalize requisition:', error);
      // Revert changes on error
      setRequisitions(previousRequisitions);
      setSelectedRequisition(previousSelected);
    }
  };

  const handleUpdateItem = async (itemId: string, data: Partial<RequisitionItem>) => {
    if (!selectedRequisition) return;

    // Optimistic update
    const previousRequisitions = [...requisitions];
    const previousSelected = { ...selectedRequisition };

    // Create updated item object
    const updatedItems = selectedRequisition.items.map(item => 
      item.id === itemId ? { ...item, ...data } : item
    );

    const updatedRequisition = { ...selectedRequisition, items: updatedItems };

    // Update state
    const updatedRequisitions = requisitions.map(req => 
      req.id === selectedRequisition.id ? updatedRequisition : req
    );

    setRequisitions(updatedRequisitions);
    setSelectedRequisition(updatedRequisition);

    try {
      await requisitionService.updateItem(itemId, data);
    } catch (error) {
      console.error('Failed to update item:', error);
      // Revert changes on error
      setRequisitions(previousRequisitions);
      setSelectedRequisition(previousSelected);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetStatus: KanbanStatus) => {
    e.preventDefault();
    const requisitionId = e.dataTransfer.getData('requisitionId');
    
    if (requisitionId) {
      // Optimistic update
      const previousRequisitions = [...requisitions];
      const updatedRequisitions = requisitions.map(req => {
        if (req.id === requisitionId) {
          return { ...req, status: targetStatus, statusCategory: 'Aberto' as const };
        }
        return req;
      });
      setRequisitions(updatedRequisitions);

      try {
        await requisitionService.updateStatus(requisitionId, targetStatus);
      } catch (error) {
        console.error('Failed to update status:', error);
        // Revert changes on error
        setRequisitions(previousRequisitions);
      }
    }
  };

  const columnTheme = {
    dot: 'bg-gray-400',
    card: 'border-gray-200/80 bg-gradient-to-b from-gray-50/70 to-white',
    count: 'text-gray-600 border-gray-200/80 bg-white/80'
  };

  if (selectedRequisition) {
    return (
      <RequisitionDetail 
        requisition={selectedRequisition} 
        onBack={() => {
          setSelectedRequisition(null);
          window.history.pushState({}, '', '/');
        }}
        onUpdateStatus={handleUpdateStatus}
        onDeny={handleDeny}
        onFinalize={handleFinalize}
        onUpdateItem={handleUpdateItem}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Requisições</h1>
            <p className="text-gray-500 text-sm mt-1">Gerencie seu fluxo de cotação</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'kanban' ? 'bg-gray-100 text-black shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              title="Visualização Kanban"
            >
              <LayoutGrid size={20} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-gray-100 text-black shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              title="Visualização em Lista"
            >
              <LayoutList size={20} />
            </button>
          </div>

          <button 
            onClick={handleCreateClick}
            className="relative inline-flex h-[38px] overflow-hidden rounded-lg p-[2px] focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 focus:ring-offset-gray-50 group shrink-0"
          >
            <span className="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#000000_0%,#EBF57D_50%,#000000_100%)]" />
            <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-md bg-black px-4 text-sm font-medium text-white backdrop-blur-3xl transition-all group-hover:bg-gray-900/90">
              <Plus size={16} className="mr-2 text-[#EBF57D]" />
              Nova Requisição
            </span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex items-end gap-2 mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm w-full">
        {/* Search */}
        <div className={`${viewMode === 'list' ? 'w-[30%]' : 'w-[45%]'} transition-all duration-300`}>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 font-medium ml-1">Pesquisar</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Pesquisar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Status Category Filter */}
        <div className={`flex flex-col gap-1 ${viewMode === 'list' ? 'w-[15%]' : 'w-[20%]'} transition-all duration-300`}>
            <span className="text-xs text-gray-500 font-medium ml-1">Status Geral</span>
            <select
                value={statusCategoryFilter}
                onChange={(e) => setStatusCategoryFilter(e.target.value as any)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-black/5 bg-white w-full"
            >
                <option value="Todos">Todos</option>
                <option value="Aberto">Aberto</option>
                <option value="Finalizado">Finalizado</option>
                <option value="Negado">Negado</option>
            </select>
        </div>

        {/* Kanban Stage Filter (only if in List mode) */}
        {viewMode === 'list' && (
            <div className="flex flex-col gap-1 w-[20%] transition-all duration-300">
                <span className="text-xs text-gray-500 font-medium ml-1">Etapa da Requisição</span>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-black/5 bg-white w-full"
                >
                    <option value="Todos">Todas as Etapas</option>
                    {columns.map(col => (
                        <option key={col} value={col}>{col}</option>
                    ))}
                </select>
            </div>
        )}

        {/* Date Filter */}
        <div className={`flex flex-col gap-1 ${viewMode === 'list' ? 'w-[30%]' : 'w-[30%]'} transition-all duration-300`}>
             <span className="text-xs text-gray-500 font-medium ml-1">Período</span>
             <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1 w-full">
                <Calendar size={16} className="text-gray-400 shrink-0" />
                <input
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className="border-none p-1 text-sm text-gray-600 focus:ring-0 outline-none w-full flex-1 min-w-0"
                />
                <span className="text-gray-400 text-xs shrink-0">-</span>
                <input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  className="border-none p-1 text-sm text-gray-600 focus:ring-0 outline-none w-full flex-1 min-w-0"
                />
             </div>
        </div>

        {/* Export Button */}
        <div className="flex flex-col gap-1 w-auto">
             <span className="text-xs text-transparent select-none">Ação</span>
             <button
                onClick={handleExport}
                className="flex items-center justify-center p-2 border border-transparent rounded-lg text-gray-900 bg-[#EBF57D] hover:brightness-95 transition-all shadow-sm h-[38px] w-[38px]"
                title="Exportar CSV"
             >
                <Download size={18} />
             </button>
        </div>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-gray-300" />
        </div>
      ) : viewMode === 'kanban' ? (
        // Kanban Board
        <div className="flex-1 overflow-x-auto pb-4 w-full min-w-0">
          <div className="flex gap-4 sm:gap-6 h-full w-full">
            {columns.map((column) => {
              const theme = columnTheme;
              return (
                <div
                  key={column}
                  className={`flex-1 flex flex-col min-w-[220px] rounded-3xl border shadow-sm ring-1 ring-black/5 p-3 sm:p-4 ${theme.card}`}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, column)}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wider flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${theme.dot}`} />
                      {column}
                    </h2>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-md shadow-sm border ${theme.count}`}>
                      {filteredRequisitions.filter(r => r.status === column).length}
                    </span>
                  </div>

                  <div className="flex-1 bg-white/70 rounded-2xl p-3 border border-gray-100/70 space-y-3 overflow-y-auto max-h-[calc(100vh-220px)] custom-scrollbar">
                    {filteredRequisitions
                      .filter(r => r.status === column)
                      .map(req => (
                        <RequisitionCard key={req.id} requisition={req} onClick={handleCardClick} />
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // List View
        <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex-1 overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-gray-50 z-10">
               <tr className="border-b border-gray-100">
                 <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">ID</th>
                 <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Título</th>
                 <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Solicitante</th>
                 <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Departamento</th>
                 <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Prioridade</th>
                 <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                 <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Data</th>
                 <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Ações</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
               {filteredRequisitions.map(req => (
                   <tr 
                     key={req.id} 
                     onClick={() => handleCardClick(req)}
                     className="hover:bg-gray-50 cursor-pointer transition-colors group"
                   >
                     <td className="p-4 font-mono text-sm text-gray-500">{req.displayId}</td>
                     <td className="p-4 font-medium text-gray-900">{req.title}</td>
                     <td className="p-4 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                                {req.requester.charAt(0).toUpperCase()}
                            </div>
                            {req.requester}
                        </div>
                     </td>
                     <td className="p-4 text-sm text-gray-600">{req.department}</td>
                     <td className="p-4">
                       <span className={`px-2 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${
                         req.priority === 'Alta' ? 'bg-red-50 text-red-700 border border-red-100' :
                         req.priority === 'Média' ? 'bg-yellow-50 text-yellow-700 border border-yellow-100' :
                         'bg-green-50 text-green-700 border border-green-100'
                       }`}>
                         <div className={`w-1.5 h-1.5 rounded-full ${
                             req.priority === 'Alta' ? 'bg-red-500' :
                             req.priority === 'Média' ? 'bg-yellow-500' :
                             'bg-green-500'
                         }`} />
                         {req.priority}
                       </span>
                     </td>
                     <td className="p-4">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                          {req.status}
                        </span>
                     </td>
                     <td className="p-4 text-sm text-gray-500">{req.createdAt}</td>
                     <td className="p-4 text-right">
                        <button className="p-2 hover:bg-white hover:shadow-sm hover:border-gray-200 border border-transparent rounded-lg text-gray-400 hover:text-primary transition-all opacity-0 group-hover:opacity-100">
                          <FileText size={18} />
                        </button>
                     </td>
                   </tr>
                 ))}
               {filteredRequisitions.length === 0 && (
                 <tr>
                    <td colSpan={8} className="p-8 text-center text-gray-400">
                        Nenhuma requisição encontrada com os filtros selecionados.
                    </td>
                 </tr>
               )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <NewRequisitionModal 
        isOpen={isNewReqModalOpen} 
        onClose={handleCloseModal} 
        onSuccess={handleRequisitionCreated} 
      />
    </div>
  );
};

export default RequisitionsPage;
