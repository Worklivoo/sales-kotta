import React from 'react';
import { Requisition } from '../types';
import { Clock, User } from 'lucide-react';

interface RequisitionCardProps {
  requisition: Requisition;
  onClick: (req: Requisition) => void;
}

const RequisitionCard: React.FC<RequisitionCardProps> = ({ requisition, onClick }) => {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Alta': return 'bg-red-100 text-red-700 border-red-200';
      case 'Média': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Baixa': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('requisitionId', requisition.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div 
      draggable
      onDragStart={handleDragStart}
      onClick={() => onClick(requisition)}
      className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-primary/50 cursor-grab active:cursor-grabbing transition-all duration-200 group relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-semibold text-gray-400">{requisition.displayId}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getPriorityColor(requisition.priority)}`}>
          {requisition.priority}
        </span>
      </div>
      
      <h3 className="font-bold text-gray-900 text-sm mb-3 line-clamp-2 leading-snug">
        {requisition.title}
      </h3>
      
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <User size={14} className="text-gray-400" />
          <span>{requisition.requester}</span>
        </div>
        
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
          <div className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-md">
            {requisition.department}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-gray-400">
            <Clock size={12} />
            <span>2d</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RequisitionCard;
