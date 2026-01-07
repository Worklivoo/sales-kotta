import React, { useState } from 'react';
import { Search, MapPin, Mail, Sparkles } from 'lucide-react';
import { mockSuppliers } from '../services/mockData';
import { Supplier } from '../types';
import SupplierModal from '../components/SupplierModal';

const SuppliersPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  const filteredSuppliers = mockSuppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
       <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Fornecedores</h1>
            <p className="text-gray-500 text-sm mt-1">Base de parceiros e histórico de performance</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1 mb-6">
        <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
                type="text" 
                placeholder="Buscar fornecedores por nome, categoria ou ID..." 
                className="w-full pl-12 pr-4 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-gray-700 bg-transparent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto pb-6">
        {filteredSuppliers.map(supplier => (
            <div 
                key={supplier.id}
                onClick={() => setSelectedSupplier(supplier)}
                className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all cursor-pointer"
            >
                <h3 className="font-bold text-lg text-gray-900 mb-1 mt-2">{supplier.name}</h3>
                <p className="text-sm text-gray-500 mb-4">{supplier.category}</p>

                <div className="space-y-3 text-sm text-gray-600 mb-6">
                    <div className="flex items-center gap-3">
                        <MapPin size={16} className="text-gray-400" />
                        <span>São Paulo, SP</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Mail size={16} className="text-gray-400" />
                        <span className="truncate">{supplier.email}</span>
                    </div>
                </div>

                <div className="bg-purple-50 rounded-xl p-3 flex items-center gap-3">
                    <div className="bg-white p-1.5 rounded-lg shadow-sm">
                         <Sparkles size={14} className="text-purple-600" />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] font-bold text-purple-900 uppercase tracking-wide">Última atualização da IA</p>
                        <p className="text-xs text-purple-700 font-medium">{supplier.lastAiUpdate}</p>
                    </div>
                </div>
            </div>
        ))}
      </div>

      <SupplierModal 
        supplier={selectedSupplier}
        isOpen={!!selectedSupplier}
        onClose={() => setSelectedSupplier(null)}
      />
    </div>
  );
};

export default SuppliersPage;
