import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

const CATEGORIES = [
  'Matéria-Prima Metalúrgica (Aços, ligas e metais)',
  'Matéria-Prima Química (Reagentes, solventes e aditivos)',
  'Matéria-Prima Alimentícia (Ingredientes e insumos biológicos)',
  'Matéria-Prima Têxtil (Fios, tecidos e fibras)',
  'Matéria-Prima de Polímeros e Borrachas (Plásticos e elastômeros)',
  'Matéria-Prima de Madeira e Celulose (Papel, papelão e madeiras)',
  'Matéria-Prima de Construção (Vidro, cimento e agregados)',
  'Componentes Elétricos e Eletrônicos (Sensores, placas, cabos e painéis)',
  'Componentes Mecânicos (Rolamentos, engrenagens, eixos e polias)',
  'Elementos de Fixação (Parafusos, porcas, arruelas e rebites)',
  'Embalagens Produtivas (Caixas de papelão, pallets, filmes e rótulos)',
  'Ferramental (Brocas, fresas, insertos e ferramentas manuais)',
  'Pneumática e Hidráulica (Válvulas, cilindros, mangueiras e conexões)',
  'Equipamentos de Segurança (EPI) (Luvas, botas, óculos e uniformes)',
  'Materiais de Escritório (Papelaria, toners, teclados e periféricos)',
  'Higiene e Limpeza',
  'Serviços de Terceiros'
];

interface CategoryInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const CategoryInput: React.FC<CategoryInputProps> = ({ value, onChange, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCategories = CATEGORIES.filter(cat => 
    cat.toLowerCase().includes((value || '').toLowerCase())
  );

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <div className="relative">
        <input
          type="text"
          value={value || ''}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Selecione ou digite..."
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary outline-none text-sm pr-8"
        />
        <ChevronDown 
          size={16} 
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filteredCategories.length > 0 ? (
            filteredCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700"
                onClick={() => {
                  onChange(cat);
                  setIsOpen(false);
                }}
              >
                {cat}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-400">
              Nenhuma categoria encontrada
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CategoryInput;
