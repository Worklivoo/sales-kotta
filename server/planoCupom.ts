import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './createMemberService.js';
import type { DescontoCupom } from './planosCiclos.js';

export interface CupomEncontrado extends DescontoCupom {
  descricao: string | null;
}

/* Busca o cupom em sales_codigos_v2. Codigo inexistente, inativo ou que na
   verdade e um codigo de TRIAL nao serve como cupom - todos caem no mesmo
   erro generico, de proposito: quem digita nao precisa saber por que falhou. */
export const buscarCupom = async (
  adminClient: SupabaseClient,
  codigoBruto: string,
): Promise<CupomEncontrado> => {
  const codigo = (codigoBruto || '').trim().toUpperCase();

  if (!codigo) {
    throw new HttpError(400, 'Informe o código do cupom.');
  }

  const { data, error } = await adminClient
    .from('sales_codigos_v2')
    .select('codigo, descricao, desconto_pct, desconto_valor')
    .eq('codigo', codigo)
    .eq('tipo', 'CUPOM')
    .eq('ativo', true)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message);
  }

  if (!data) {
    throw new HttpError(400, 'Cupom inválido ou expirado.');
  }

  return {
    codigo: data.codigo as string,
    descricao: (data.descricao as string) || null,
    descontoPct: data.desconto_pct === null ? null : Number(data.desconto_pct),
    descontoValor: data.desconto_valor === null ? null : Number(data.desconto_valor),
  };
};
