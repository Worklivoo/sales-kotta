import { Requisition, Supplier } from '../types';

export const mockRequisitions: Requisition[] = [
  {
    id: '1',
    displayId: '#1024',
    title: 'Estrutura Metálica Principal',
    requester: 'Carlos Eduardo',
    department: 'Produção',
    priority: 'Alta',
    status: 'Novas Requisições',
    createdAt: '07/01/2026',
    items: [
      { id: 'i1', type: 'Chapa', name: 'Aço Carbono ASTM A36', dimensions: 'Espessura 1/8"', cost: 8.65, quantity: 500, lastAiUpdate: '07/01/2026, 10:30' },
      { id: 'i2', type: 'Viga', name: 'Viga I (W) Aço ASTM A572', dimensions: '6" - 150mm', cost: 215.00, quantity: 20, lastAiUpdate: '07/01/2026, 10:30' },
    ]
  },
  {
    id: '2',
    displayId: '#1025',
    title: 'Tubulação Industrial',
    requester: 'Ana Silva',
    department: 'Manutenção',
    priority: 'Média',
    status: 'Novas Requisições',
    createdAt: '06/01/2026',
    items: [
      { id: 'i3', type: 'Tubo', name: 'Tubo Industrial Redondo Galvanizado', dimensions: '2" - Parede 2mm', cost: 235.00, quantity: 30, lastAiUpdate: '06/01/2026, 14:00' },
      { id: 'i4', type: 'Tubo', name: 'Tubo de Cobre Flexível', dimensions: 'Classe E - 1/2"', cost: 51.50, quantity: 100, lastAiUpdate: '06/01/2026, 14:00' },
    ]
  },
  {
    id: '3',
    displayId: '#1022',
    title: 'Componentes de Inox',
    requester: 'Roberto Costa',
    department: 'Manutenção',
    priority: 'Baixa',
    status: 'Em análise',
    createdAt: '05/01/2026',
    items: [
      { id: 'i5', type: 'Barra', name: 'Barra Redonda Aço Inox 304', dimensions: 'Diâmetro 1"', cost: 162.50, quantity: 15, lastAiUpdate: '05/01/2026' },
      { id: 'i6', type: 'Chapa', name: 'Aço Inox 316L', dimensions: 'Fina Frio 1.2mm', cost: 615.00, quantity: 5, lastAiUpdate: '05/01/2026' },
    ]
  },
  {
    id: '4',
    displayId: '#1018',
    title: 'Usinagem de Precisão',
    requester: 'Juliana Paes',
    department: 'Usinagem',
    priority: 'Alta',
    status: 'Recebendo Propostas',
    createdAt: '04/01/2026',
    items: [
      { id: 'i7', type: 'Barra', name: 'Barra Sextavada de Latão CLA', dimensions: '3/4"', cost: 72.50, quantity: 50, lastAiUpdate: '04/01/2026' },
      { id: 'i8', type: 'Barra', name: 'Barra Chata Aço Carbono 1045', dimensions: '2" x 1/2"', cost: 97.50, quantity: 40, lastAiUpdate: '04/01/2026' },
    ],
    proposals: [
      { id: 'p1', supplierName: 'Metalúrgica Steel Ltda', value: 7500.00, deliveryDays: 5 },
      { id: 'p2', supplierName: 'Ferramentas do Sul', value: 7800.00, deliveryDays: 3 },
      { id: 'p3', supplierName: 'TechSolutions Distribuidora', value: 7200.00, deliveryDays: 7 }
    ]
  },
  {
    id: '5',
    displayId: '#1010',
    title: 'Acabamentos Navais',
    requester: 'Marcos Souza',
    department: 'Montagem',
    priority: 'Média',
    status: 'Avaliação/Negociações',
    createdAt: '02/01/2026',
    items: [
      { id: 'i9', type: 'Chapa', name: 'Alumínio Naval 5052', dimensions: 'Espessura 2.0mm', cost: 48.50, quantity: 200, lastAiUpdate: '03/01/2026' },
      { id: 'i10', type: 'Perfil', name: 'Cantoneira de Ferro Laminado', dimensions: '1" x 1/8"', cost: 110.00, quantity: 60, lastAiUpdate: '03/01/2026' },
    ]
  }
];

export const mockSuppliers: Supplier[] = [
  {
    id: 's1',
    name: 'Metalúrgica Steel Ltda',
    contactName: 'Jorge Mendes',
    email: 'vendas@steel.com.br',
    phone: '(11) 3456-7890',
    website: 'https://www.steel.com.br',
    cnpj: '12.345.678/0001-90',
    city: 'São Paulo',
    state: 'SP',
    category: 'Metais',
    lastAiUpdate: '07/01/2026, 09:15',
    rating: 4.8,
    items: [
      { id: 'si1', name: 'Aço Carbono ASTM A36 (Espessura 1/8")', type: 'Chapa', unit: 'kg', historicalCost: 8.65, lastQuoteDate: '02/01/2026' },
      { id: 'si2', name: 'Barra Redonda Aço Inox 304 (Diâmetro 1")', type: 'Barra', unit: 'metro', historicalCost: 162.50, lastQuoteDate: '01/01/2026' },
      { id: 'si3', name: 'Viga I (W) Aço ASTM A572 (6" - 150mm)', type: 'Viga', unit: 'metro', historicalCost: 215.00, lastQuoteDate: '05/01/2026' },
    ]
  },
  {
    id: 's2',
    name: 'Ferramentas do Sul',
    contactName: 'Mariana Lima',
    email: 'contato@ferrasul.com.br',
    phone: '(51) 3344-5566',
    website: 'https://www.ferrasul.com.br',
    cnpj: '98.765.432/0001-10',
    city: 'Porto Alegre',
    state: 'RS',
    category: 'Tubos e Perfis',
    lastAiUpdate: '06/01/2026, 16:45',
    rating: 4.5,
    items: [
      { id: 'si4', name: 'Tubo Industrial Redondo Galvanizado (2" - Parede 2mm)', type: 'Tubo', unit: 'barra (6m)', historicalCost: 235.00, lastQuoteDate: '05/01/2026' },
      { id: 'si5', name: 'Cantoneira de Ferro Laminado (1" x 1/8")', type: 'Perfil', unit: 'barra (6m)', historicalCost: 110.00, lastQuoteDate: '05/01/2026' },
    ]
  },
  {
    id: 's3',
    name: 'Global Rolamentos',
    contactName: 'Felipe Santos',
    email: 'felipe@globalrolamentos.com',
    phone: '(41) 3020-1010',
    website: 'https://www.globalrolamentos.com',
    cnpj: '45.678.901/0001-23',
    city: 'Curitiba',
    state: 'PR',
    category: 'Peças Especiais',
    lastAiUpdate: '06/01/2026',
    rating: 4.9,
    items: [
      { id: 'si6', name: 'Barra Sextavada de Latão CLA (3/4")', type: 'Barra', unit: 'kg', historicalCost: 72.50, lastQuoteDate: '03/01/2026' },
      { id: 'si7', name: 'Tubo de Cobre Flexível (Classe E - 1/2")', type: 'Tubo', unit: 'metro', historicalCost: 51.50, lastQuoteDate: '03/01/2026' },
    ]
  },
  {
    id: 's4',
    name: 'Segurança Total EPIs',
    contactName: 'Renata Oliveira',
    email: 'vendas@segurancatotal.com',
    phone: '(31) 3210-9876',
    website: 'https://www.segurancatotal.com',
    cnpj: '10.293.847/0001-56',
    city: 'Belo Horizonte',
    state: 'MG',
    category: 'Diversos',
    lastAiUpdate: '07/01/2026, 11:00',
    rating: 4.2,
    items: [
      { id: 'si8', name: 'Alumínio Naval 5052 (Espessura 2.0mm)', type: 'Chapa', unit: 'kg', historicalCost: 48.50, lastQuoteDate: '04/01/2026' },
      { id: 'si9', name: 'Barra Chata Aço Carbono 1045 (2" x 1/2")', type: 'Barra', unit: 'metro', historicalCost: 97.50, lastQuoteDate: '04/01/2026' },
    ]
  },
  {
    id: 's5',
    name: 'TechSolutions Distribuidora',
    contactName: 'Ricardo Almeida',
    email: 'comercial@techsolutions.com.br',
    phone: '(19) 3344-5566',
    website: 'https://www.techsolutions.com.br',
    cnpj: '55.444.333/0001-22',
    city: 'Campinas',
    state: 'SP',
    category: 'Inox',
    lastAiUpdate: '07/01/2026, 14:20',
    rating: 4.7,
    items: [
      { id: 'si10', name: 'Aço Inox 316L (Fina Frio 1.2mm)', type: 'Chapa', unit: 'm²', historicalCost: 615.00, lastQuoteDate: '06/01/2026' },
      { id: 'si11', name: 'Barra Redonda Aço Inox 304 (Diâmetro 1")', type: 'Barra', unit: 'metro', historicalCost: 165.00, lastQuoteDate: '06/01/2026' },
    ]
  },
  {
    id: 's6',
    name: 'Embalagens Premium',
    contactName: 'Fernanda Costa',
    email: 'vendas@embalagenspremium.com.br',
    phone: '(11) 2233-4455',
    website: 'https://www.embalagenspremium.com.br',
    cnpj: '66.777.888/0001-99',
    city: 'Guarulhos',
    state: 'SP',
    category: 'Geral',
    lastAiUpdate: '06/01/2026, 09:00',
    rating: 4.6,
    items: [
      { id: 'si12', name: 'Tubo Industrial Redondo Galvanizado (2" - Parede 2mm)', type: 'Tubo', unit: 'barra (6m)', historicalCost: 240.00, lastQuoteDate: '05/01/2026' },
      { id: 'si13', name: 'Cantoneira de Ferro Laminado (1" x 1/8")', type: 'Perfil', unit: 'barra (6m)', historicalCost: 115.00, lastQuoteDate: '05/01/2026' },
    ]
  }
];
