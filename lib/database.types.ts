export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      usuarios: {
        Row: {
          user_id: string
          created_at: string
          user_empresa: string
          user_cnpj: string
          user_nome: string
          user_email: string
          user_telefone: string | null
          user_tipo: string
          user_plano: string
          plano_ciclo: string
          plano_status: string
          user_valor_mensal: number
          dia_vencimento: number
          trial_status: string
          data_final_trial: string | null
          cliente_status: string
          token_instancia_uazapi: string | null
          id_cliente_asaas: string | null
          id_cobranca_asaas: string | null
          cartao_token: string | null
          cartao_final: string | null
          cartao_bandeira: string | null
          cartao_exp_mes: number | null
          cartao_exp_ano: number | null
          aceite_termos_at: string | null
          aceite_privacidade_at: string | null
          metadata: Json | null
        }
        Insert: {
          user_id: string
          created_at?: string
          user_empresa: string
          user_cnpj: string
          user_nome: string
          user_email: string
          user_telefone?: string | null
          user_tipo?: string
          user_plano?: string
          plano_ciclo?: string
          plano_status?: string
          user_valor_mensal?: number
          dia_vencimento: number
          trial_status?: string
          data_final_trial?: string | null
          cliente_status?: string
          token_instancia_uazapi?: string | null
          id_cliente_asaas?: string | null
          id_cobranca_asaas?: string | null
          cartao_token?: string | null
          cartao_final?: string | null
          cartao_bandeira?: string | null
          cartao_exp_mes?: number | null
          cartao_exp_ano?: number | null
          aceite_termos_at?: string | null
          aceite_privacidade_at?: string | null
          metadata?: Json | null
        }
        Update: {
          user_id?: string
          created_at?: string
          user_empresa?: string
          user_cnpj?: string
          user_nome?: string
          user_email?: string
          user_telefone?: string | null
          user_tipo?: string
          user_plano?: string
          plano_ciclo?: string
          plano_status?: string
          user_valor_mensal?: number
          dia_vencimento?: number
          trial_status?: string
          data_final_trial?: string | null
          cliente_status?: string
          token_instancia_uazapi?: string | null
          id_cliente_asaas?: string | null
          id_cobranca_asaas?: string | null
          cartao_token?: string | null
          cartao_final?: string | null
          cartao_bandeira?: string | null
          cartao_exp_mes?: number | null
          cartao_exp_ano?: number | null
          aceite_termos_at?: string | null
          aceite_privacidade_at?: string | null
          metadata?: Json | null
        }
        Relationships: []
      }
      requisicao: {
        Row: {
          requisicao_id: string
          user_id: string
          created_at: string
          updated_at: string
          membro_id: string | null
          comprador_id: string | null
          origem: string
          titulo: string
          descricao: string | null
          urgencia: string
          status: string
          prazo_entrega_desejado: string | null
          observacoes: string | null
          anexos: Json | null
          metadata: Json | null
        }
        Insert: {
          requisicao_id?: string
          user_id: string
          created_at?: string
          updated_at?: string
          membro_id?: string | null
          comprador_id?: string | null
          origem?: string
          titulo: string
          descricao?: string | null
          urgencia?: string
          status?: string
          prazo_entrega_desejado?: string | null
          observacoes?: string | null
          anexos?: Json | null
          metadata?: Json | null
        }
        Update: {
          requisicao_id?: string
          user_id?: string
          created_at?: string
          updated_at?: string
          membro_id?: string | null
          comprador_id?: string | null
          origem?: string
          titulo?: string
          descricao?: string | null
          urgencia?: string
          status?: string
          prazo_entrega_desejado?: string | null
          observacoes?: string | null
          anexos?: Json | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "requisicao_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "usuarios"
            referencedColumns: ["user_id"]
          }
        ]
      }
      requisicao_itens: {
        Row: {
          requisicao_item_id: string
          requisicao_id: string
          user_id: string
          created_at: string
          updated_at: string
          nome_item: string
          item_categoria: string | null
          item_tipo: string | null
          descricao_item: string | null
          dimensao: string | null
          quantidade: number
          unidade_medida: string
          data_necessidade: string | null
          anexos: Json | null
          observacoes: string | null
          metadata: Json | null
        }
        Insert: {
          requisicao_item_id?: string
          requisicao_id: string
          user_id: string
          created_at?: string
          updated_at?: string
          nome_item: string
          item_categoria?: string | null
          item_tipo?: string | null
          descricao_item?: string | null
          dimensao?: string | null
          quantidade: number
          unidade_medida: string
          data_necessidade?: string | null
          anexos?: Json | null
          observacoes?: string | null
          metadata?: Json | null
        }
        Update: {
          requisicao_item_id?: string
          requisicao_id?: string
          user_id?: string
          created_at?: string
          updated_at?: string
          nome_item?: string
          item_categoria?: string | null
          item_tipo?: string | null
          descricao_item?: string | null
          dimensao?: string | null
          quantidade?: number
          unidade_medida?: string
          data_necessidade?: string | null
          anexos?: Json | null
          observacoes?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "requisicao_itens_requisicao_id_fkey"
            columns: ["requisicao_id"]
            referencedRelation: "requisicao"
            referencedColumns: ["requisicao_id"]
          },
          {
            foreignKeyName: "requisicao_itens_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "usuarios"
            referencedColumns: ["user_id"]
          }
        ]
      }
      membros: {
        Row: {
          membro_id: string
          user_id: string
          created_at: string
          membro_nome: string
          membro_email: string
          membro_telefone: string | null
          membro_cargo: string | null
          membro_departamento: string | null
          membro_tipo: string
          membro_status: string
          metadata: Json | null
        }
        Insert: {
          membro_id?: string
          user_id: string
          created_at?: string
          membro_nome: string
          membro_email: string
          membro_telefone?: string | null
          membro_cargo?: string | null
          membro_departamento?: string | null
          membro_tipo?: string
          membro_status?: string
          metadata?: Json | null
        }
        Update: {
          membro_id?: string
          user_id?: string
          created_at?: string
          membro_nome?: string
          membro_email?: string
          membro_telefone?: string | null
          membro_cargo?: string | null
          membro_departamento?: string | null
          membro_tipo?: string
          membro_status?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "membros_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "usuarios"
            referencedColumns: ["user_id"]
          }
        ]
      }
      itens: {
        Row: {
          item_id: string
          user_id: string
          fornecedor_id: string
          created_at: string
          updated_at: string
          item_nome: string
          item_descricao: string | null
          item_categoria: string | null
          unidade_medida: string
          item_preco: number
          item_moeda: string
          quantidade: number
          moq: number | null
          tempo_de_entrega_dias: number | null
          marca: string | null
          modelo: string | null
          peso_liquido_kg: number | null
          dimensoes: Json | null
          ficha_tecnica_url: string | null
          observacao: string | null
          metadata: Json | null
        }
        Insert: {
          item_id?: string
          user_id: string
          fornecedor_id: string
          created_at?: string
          updated_at?: string
          item_nome: string
          item_descricao?: string | null
          item_categoria?: string | null
          unidade_medida: string
          item_preco: number
          item_moeda?: string
          quantidade?: number
          moq?: number | null
          tempo_de_entrega_dias?: number | null
          marca?: string | null
          modelo?: string | null
          peso_liquido_kg?: number | null
          dimensoes?: Json | null
          ficha_tecnica_url?: string | null
          observacao?: string | null
          metadata?: Json | null
        }
        Update: {
          item_id?: string
          user_id?: string
          fornecedor_id?: string
          created_at?: string
          updated_at?: string
          item_nome?: string
          item_descricao?: string | null
          item_categoria?: string | null
          unidade_medida?: string
          item_preco?: number
          item_moeda?: string
          quantidade?: number
          moq?: number | null
          tempo_de_entrega_dias?: number | null
          marca?: string | null
          modelo?: string | null
          peso_liquido_kg?: number | null
          dimensoes?: Json | null
          ficha_tecnica_url?: string | null
          observacao?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "itens_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "usuarios"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "itens_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            referencedRelation: "fornecedores"
            referencedColumns: ["fornecedor_id"]
          }
        ]
      }
      fornecedores: {
        Row: {
          fornecedor_id: string
          user_id: string
          created_at: string
          updated_at: string
          fornecedor_tipo: string
          fornecedor_nome: string
          nome_fantasia: string | null
          fornecedor_cnpj: string
          inscricao_estadual: string | null
          isento_ie: boolean | null
          inscricao_municipal: string | null
          regime_tributario: string | null
          contato_nome: string | null
          contato_email: string | null
          contato_telefone: string | null
          site_url: string | null
          endereco_logradouro: string | null
          endereco_numero: string | null
          endereco_complemento: string | null
          endereco_bairro: string | null
          endereco_cidade: string | null
          endereco_estado: string | null
          endereco_cep: string | null
          endereco_pais: string | null
          categoria: string | null
          fornecedor_status: string
          observacao: string | null
          metadata: Json | null
        }
        Insert: {
          fornecedor_id?: string
          user_id: string
          created_at?: string
          updated_at?: string
          fornecedor_tipo: string
          fornecedor_nome: string
          nome_fantasia?: string | null
          fornecedor_cnpj: string
          inscricao_estadual?: string | null
          isento_ie?: boolean | null
          inscricao_municipal?: string | null
          regime_tributario?: string | null
          contato_nome?: string | null
          contato_email?: string | null
          contato_telefone?: string | null
          site_url?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          endereco_complemento?: string | null
          endereco_bairro?: string | null
          endereco_cidade?: string | null
          endereco_estado?: string | null
          endereco_cep?: string | null
          endereco_pais?: string | null
          categoria?: string | null
          fornecedor_status?: string
          observacao?: string | null
          metadata?: Json | null
        }
        Update: {
          fornecedor_id?: string
          user_id?: string
          created_at?: string
          updated_at?: string
          fornecedor_tipo?: string
          fornecedor_nome?: string
          nome_fantasia?: string | null
          fornecedor_cnpj?: string
          inscricao_estadual?: string | null
          isento_ie?: boolean | null
          inscricao_municipal?: string | null
          regime_tributario?: string | null
          contato_nome?: string | null
          contato_email?: string | null
          contato_telefone?: string | null
          site_url?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          endereco_complemento?: string | null
          endereco_bairro?: string | null
          endereco_cidade?: string | null
          endereco_estado?: string | null
          endereco_cep?: string | null
          endereco_pais?: string | null
          categoria?: string | null
          fornecedor_status?: string
          observacao?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "usuarios"
            referencedColumns: ["user_id"]
          }
        ]
      }
      cotacao: {
        Row: {
          cotacao_id: string
          requisicao_id: string
          user_id: string
          fornecedor_id: string | null
          created_at: string
          updated_at: string
          fornecedor_nome: string
          fornecedor_cnpj: string | null
          contato_nome: string | null
          contato_email: string | null
          contato_telefone: string | null
          endereco_logradouro: string | null
          endereco_numero: string | null
          endereco_complemento: string | null
          endereco_bairro: string | null
          endereco_cidade: string | null
          endereco_estado: string | null
          endereco_cep: string | null
          endereco_pais: string | null
          prazo_entrega_geral: number | null
          condicao_pagamento: string | null
          validade_proposta: string | null
          enviado_em: string | null
          recebido_em: string | null
          anexos: Json | null
          metadata: Json | null
        }
        Insert: {
          cotacao_id?: string
          requisicao_id: string
          user_id: string
          fornecedor_id?: string | null
          created_at?: string
          updated_at?: string
          fornecedor_nome: string
          fornecedor_cnpj?: string | null
          contato_nome?: string | null
          contato_email?: string | null
          contato_telefone?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          endereco_complemento?: string | null
          endereco_bairro?: string | null
          endereco_cidade?: string | null
          endereco_estado?: string | null
          endereco_cep?: string | null
          endereco_pais?: string | null
          prazo_entrega_geral?: number | null
          condicao_pagamento?: string | null
          validade_proposta?: string | null
          enviado_em?: string | null
          recebido_em?: string | null
          anexos?: Json | null
          metadata?: Json | null
        }
        Update: {
          cotacao_id?: string
          requisicao_id?: string
          user_id?: string
          fornecedor_id?: string | null
          created_at?: string
          updated_at?: string
          fornecedor_nome?: string
          fornecedor_cnpj?: string | null
          contato_nome?: string | null
          contato_email?: string | null
          contato_telefone?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          endereco_complemento?: string | null
          endereco_bairro?: string | null
          endereco_cidade?: string | null
          endereco_estado?: string | null
          endereco_cep?: string | null
          endereco_pais?: string | null
          prazo_entrega_geral?: number | null
          condicao_pagamento?: string | null
          validade_proposta?: string | null
          enviado_em?: string | null
          recebido_em?: string | null
          anexos?: Json | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_requisicao_id_fkey"
            columns: ["requisicao_id"]
            referencedRelation: "requisicao"
            referencedColumns: ["requisicao_id"]
          },
          {
            foreignKeyName: "cotacao_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "usuarios"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cotacao_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            referencedRelation: "fornecedores"
            referencedColumns: ["fornecedor_id"]
          }
        ]
      }
      cotacao_itens: {
        Row: {
          cotacao_item_id: string
          cotacao_id: string
          requisicao_item_id: string
          user_id: string
          created_at: string
          updated_at: string
          nome_item: string
          descricao_item: string | null
          marca: string | null
          modelo: string | null
          dimensoes: string | null
          codigo_fornecedor: string | null
          quantidade: number
          unidade_medida: string
          preco_total_item: number | null
          prazo_entrega_dias: number | null
          observacoes: string | null
          metadata: Json | null
        }
        Insert: {
          cotacao_item_id?: string
          cotacao_id: string
          requisicao_item_id: string
          user_id: string
          created_at?: string
          updated_at?: string
          nome_item: string
          descricao_item?: string | null
          marca?: string | null
          modelo?: string | null
          dimensoes?: string | null
          codigo_fornecedor?: string | null
          quantidade: number
          unidade_medida: string
          preco_total_item?: number | null
          prazo_entrega_dias?: number | null
          observacoes?: string | null
          metadata?: Json | null
        }
        Update: {
          cotacao_item_id?: string
          cotacao_id?: string
          requisicao_item_id?: string
          user_id?: string
          created_at?: string
          updated_at?: string
          nome_item?: string
          descricao_item?: string | null
          marca?: string | null
          modelo?: string | null
          dimensoes?: string | null
          codigo_fornecedor?: string | null
          quantidade?: number
          unidade_medida?: string
          preco_total_item?: number | null
          prazo_entrega_dias?: number | null
          observacoes?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_itens_cotacao_id_fkey"
            columns: ["cotacao_id"]
            referencedRelation: "cotacao"
            referencedColumns: ["cotacao_id"]
          },
          {
            foreignKeyName: "cotacao_itens_requisicao_item_id_fkey"
            columns: ["requisicao_item_id"]
            referencedRelation: "requisicao_itens"
            referencedColumns: ["requisicao_item_id"]
          },
          {
            foreignKeyName: "cotacao_itens_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "usuarios"
            referencedColumns: ["user_id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
