export type KanbanStatus = 'Novas Requisições' | 'Em análise' | 'Recebendo Propostas' | 'Avaliação/Negociações';

export interface RequisitionItem {
  id: string;
  type: string;
  name: string;
  category?: string;
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
  paymentConditions?: string;
  proposalValidity?: string;
  items?: any[];
  attachments?: string[];
  originalData?: any;
}

export interface Requisition {
  id: string;
  displayId: string;
  title: string;
  requester: string;
  department: string;
  priority: 'Baixa' | 'Média' | 'Alta';
  status: KanbanStatus;
  statusCategory: 'Aberto' | 'Finalizado' | 'Negado';
  items: RequisitionItem[];
  createdAt: string;
  attachments?: string[];
  proposals?: Proposal[];
}

export interface SupplierItem {
  id: string;
  name: string;
  type: string;
  unit: string;
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
