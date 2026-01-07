export type KanbanStatus = 'Novas Requisições' | 'Em análise' | 'Recebendo Propostas' | 'Avaliação/Negociações';

export interface RequisitionItem {
  id: string;
  type: string;
  name: string;
  dimensions: string;
  cost: number;
  quantity: number;
  lastAiUpdate: string;
}

export interface Proposal {
  id: string;
  supplierName: string;
  value: number;
  deliveryDays: number;
}

export interface Requisition {
  id: string;
  displayId: string;
  title: string;
  requester: string;
  department: string;
  priority: 'Baixa' | 'Média' | 'Alta';
  status: KanbanStatus;
  items: RequisitionItem[];
  createdAt: string;
  proposals?: Proposal[];
}

export interface SupplierItem {
  id: string;
  name: string;
  historicalCost: number;
  lastQuoteDate: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  cnpj: string;
  city: string;
  state: string;
  category: string;
  lastAiUpdate: string;
  rating: number;
  items: SupplierItem[];
}
