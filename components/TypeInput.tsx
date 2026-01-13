import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

const CATEGORY_TYPES: Record<string, string[]> = {
  'Matéria-Prima Metalúrgica (Aços, ligas e metais)': [
    'Chapas',
    'Barras',
    'Tubos',
    'Bobinas e Tiras',
    'Perfis e Vigas',
    'Arames e Fios',
    'Lingotes e Tarugos',
    'Telas e Grades'
  ],
  'Matéria-Prima Química (Reagentes, solventes e aditivos)': [
    'Líquidos',
    'Gases'
  ],
  'Matéria-Prima Alimentícia (Ingredientes e insumos biológicos)': [],
  'Matéria-Prima Têxtil (Fios, tecidos e fibras)': [
    'Fios', 'Tecidos', 'Fibras', 'Malhas', 'Linhas'
  ],
  'Matéria-Prima de Polímeros e Borrachas (Plásticos e elastômeros)': [
    'Chapas e Placas',
    'Tubos e Perfis',
    'Resinas Líquidas e Pastas'
  ],
  'Matéria-Prima de Madeira e Celulose (Papel, papelão e madeiras)': [
    'Chapas e Placas'
  ],
  'Matéria-Prima de Construção (Vidro, cimento e agregados)': [
    'Chapas e Placas',
    'Blocos e Unidades'
  ],
  'Componentes Elétricos e Eletrônicos (Sensores, placas, cabos e painéis)': [],
  'Componentes Mecânicos (Rolamentos, engrenagens, eixos e polias)': [],
  'Elementos de Fixação (Parafusos, porcas, arruelas e rebites)': [],
  'Embalagens Produtivas (Caixas de papelão, pallets, filmes e rótulos)': [],
  'Ferramental (Brocas, fresas, insertos e ferramentas manuais)': [],
  'Pneumática e Hidráulica (Válvulas, cilindros, mangueiras e conexões)': [],
  'Equipamentos de Segurança (EPI) (Luvas, botas, óculos e uniformes)': [],
  'Materiais de Escritório (Papelaria, toners, teclados e periféricos)': [],
  'Higiene e Limpeza': [],
  'Serviços de Terceiros': []
};

// Flatten all types for fallback
const ALL_TYPES = Array.from(new Set(Object.values(CATEGORY_TYPES).flat())).sort();

interface TypeInputProps {
  value: string;
  onChange: (value: string) => void;
  category?: string;
  className?: string;
  disabled?: boolean;
}

const TypeInput: React.FC<TypeInputProps> = ({ value, onChange, category, className, disabled }) => {
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

  // Determine which list to use
  const getAvailableTypes = () => {
    if (category && CATEGORY_TYPES[category]) {
      return CATEGORY_TYPES[category];
    }
    // If category matches loosely (case insensitive)
    const upperCategory = category?.toUpperCase();
    if (upperCategory) {
       const matchedKey = Object.keys(CATEGORY_TYPES).find(k => k === upperCategory);
       if (matchedKey) return CATEGORY_TYPES[matchedKey];
    }
    
    return ALL_TYPES;
  };

  const availableTypes = getAvailableTypes();
  const filteredTypes = availableTypes.filter(type => 
    type.toLowerCase().includes((value || '').toLowerCase())
  );

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <div className="relative">
        <input
          type="text"
          value={value || ''}
          onChange={(e) => {
            if (!disabled) {
              onChange(e.target.value);
              setIsOpen(true);
            }
          }}
          onFocus={() => !disabled && setIsOpen(true)}
          placeholder="Selecione ou digite o tipo..."
          disabled={disabled}
          className={`w-full px-3 py-2 rounded-lg border border-gray-200 outline-none text-sm transition-all
            ${disabled 
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200' 
              : 'focus:border-primary bg-white'
            }`}
        />
        <div className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${disabled ? 'text-gray-300' : 'text-gray-400'}`}>
          <ChevronDown size={14} />
        </div>
      </div>

      {isOpen && !disabled && filteredTypes.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filteredTypes.length > 0 ? (
            filteredTypes.map((type) => (
              <button
                key={type}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700"
                onClick={() => {
                  onChange(type);
                  setIsOpen(false);
                }}
              >
                {type}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-400">
              Nenhum tipo encontrado
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TypeInput;
