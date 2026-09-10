import { HttpError } from './createMemberService.js';
import { resolveAdminRequester, type PlanoServiceEnv } from './planoAuth.js';
import { CICLOS, calcularPreco } from './planosCiclos.js';

interface PlanoCatalogoServiceOptions {
  env: PlanoServiceEnv;
  requesterAccessToken: string;
}

export interface CatalogoOpcao {
  planoCodigo: string;
  nome: string;
  limiteAtendimentosMes: number;
  ciclo: string;
  cicloLabel: string;
  meses: number;
  descontoPct: number;
  valorMensalBase: number;
  precoCicloTotal: number;
  precoMesEquivalente: number;
}

export const planoCatalogoService = async ({
  env,
  requesterAccessToken,
}: PlanoCatalogoServiceOptions) => {
  const { adminClient } = await resolveAdminRequester(env, requesterAccessToken);

  const { data: planos, error: planosError } = await adminClient
    .from('sales_planos_v2')
    .select('plano_codigo, nome, limite_atendimentos_mes, valor_mensal_base')
    .eq('ativo', true)
    .order('limite_atendimentos_mes', { ascending: true });

  if (planosError) {
    throw new HttpError(500, planosError.message);
  }

  const opcoes: CatalogoOpcao[] = [];

  for (const plano of planos || []) {
    for (const ciclo of CICLOS) {
      const preco = calcularPreco(Number(plano.valor_mensal_base), ciclo);

      opcoes.push({
        planoCodigo: plano.plano_codigo as string,
        nome: plano.nome as string,
        limiteAtendimentosMes: plano.limite_atendimentos_mes as number,
        ciclo: ciclo.codigo,
        cicloLabel: ciclo.label,
        meses: ciclo.meses,
        descontoPct: ciclo.descontoPct,
        valorMensalBase: Number(plano.valor_mensal_base),
        precoCicloTotal: preco.precoFinal,
        precoMesEquivalente: preco.precoMesEquivalente,
      });
    }
  }

  return { planos: opcoes };
};
