export type SituacaoFinal = 'GANHO' | 'PERDIDO' | 'FINALIZADO' | null;

export interface PipelineEtapa {
  etapa_id: string;
  nome: string;
  codigo: string | null;
  ordem: number;
  is_fixed: boolean;
  is_ai_stage: boolean;
}

export const SITUACAO_FINAL_LABEL: Record<Exclude<SituacaoFinal, null>, string> = {
  GANHO: 'Ganho',
  PERDIDO: 'Perdido',
  FINALIZADO: 'Finalizado',
};
