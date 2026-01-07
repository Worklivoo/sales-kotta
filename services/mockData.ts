import { Requisition, Supplier } from '../types';

export const mockRequisitions: Requisition[] = [
  {
    id: '1',
    displayId: '#1024',
    title: 'Chapas de Aço Carbono',
    requester: 'Carlos Eduardo',
    department: 'Produção',
    priority: 'Alta',
    status: 'Novas Requisições',
    createdAt: '2023-10-25',
    items: [
      { id: 'i1', type: 'Matéria Prima', name: 'Chapa Aço 1020', dimensions: '2000x1000mm', cost: 450.00, quantity: 50, lastAiUpdate: 'Hoje, 10:30' },
      { id: 'i2', type: 'Matéria Prima', name: 'Chapa Aço 1045', dimensions: '2000x1000mm', cost: 520.00, quantity: 20, lastAiUpdate: 'Hoje, 10:30' },
    ]
  },
  {
    id: '2',
    displayId: '#1025',
    title: 'Rolamentos Industriais',
    requester: 'Ana Silva',
    department: 'Manutenção',
    priority: 'Média',
    status: 'Novas Requisições',
    createdAt: '2023-10-24',
    items: [
      { id: 'i3', type: 'Peça', name: 'Rolamento SKF 6205', dimensions: '25x52x15mm', cost: 45.90, quantity: 100, lastAiUpdate: 'Ontem, 14:00' },
    ]
  },
  {
    id: '3',
    displayId: '#1022',
    title: 'Lubrificantes Sintéticos',
    requester: 'Roberto Costa',
    department: 'Manutenção',
    priority: 'Baixa',
    status: 'Em análise',
    createdAt: '2023-10-20',
    items: [
      { id: 'i4', type: 'Consumível', name: 'Óleo Hidráulico 68', dimensions: 'Tambor 200L', cost: 1200.00, quantity: 5, lastAiUpdate: '23/10/2023' },
    ]
  },
  {
    id: '4',
    displayId: '#1018',
    title: 'Equipamentos de Proteção',
    requester: 'Juliana Paes',
    department: 'Segurança',
    priority: 'Alta',
    status: 'Recebendo Propostas',
    createdAt: '2023-10-15',
    items: [
      { id: 'i5', type: 'EPI', name: 'Luva Nitrílica', dimensions: 'G', cost: 12.50, quantity: 500, lastAiUpdate: '20/10/2023' },
    ],
    proposals: [
      { id: 'p1', supplierName: 'Segurança Total EPIs', value: 5950.00, deliveryDays: 5 },
      { id: 'p2', supplierName: 'Proteção Máxima Ltda', value: 6100.00, deliveryDays: 3 },
      { id: 'p3', supplierName: 'EPIs do Brasil', value: 5800.00, deliveryDays: 7 }
    ]
  },
  {
    id: '5',
    displayId: '#1010',
    title: 'Parafusos Inox',
    requester: 'Marcos Souza',
    department: 'Montagem',
    priority: 'Média',
    status: 'Avaliação/Negociações',
    createdAt: '2023-10-01',
    items: [
      { id: 'i6', type: 'Fixação', name: 'Parafuso Sextavado M8', dimensions: '50mm', cost: 0.85, quantity: 2000, lastAiUpdate: '15/10/2023' },
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
    category: 'Matéria Prima',
    lastAiUpdate: 'Hoje, 09:15',
    rating: 4.8,
    items: [
      { id: 'si1', name: 'Chapa Aço 1020', historicalCost: 445.00, lastQuoteDate: '2023-10-01' },
      { id: 'si2', name: 'Barra Chata', historicalCost: 22.00, lastQuoteDate: '2023-09-15' },
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
    category: 'Ferramentas',
    lastAiUpdate: 'Ontem, 16:45',
    rating: 4.5,
    items: [
      { id: 'si3', name: 'Broca HSS 10mm', historicalCost: 15.00, lastQuoteDate: '2023-10-10' },
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
    category: 'Peças',
    lastAiUpdate: '22/10/2023',
    rating: 4.9,
    items: [
      { id: 'si4', name: 'Rolamento SKF 6205', historicalCost: 44.50, lastQuoteDate: '2023-10-05' },
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
    category: 'EPI',
    lastAiUpdate: 'Hoje, 11:00',
    rating: 4.2,
    items: [
      { id: 'si5', name: 'Luva Nitrílica', historicalCost: 11.90, lastQuoteDate: '2023-10-20' },
    ]
  }
];
