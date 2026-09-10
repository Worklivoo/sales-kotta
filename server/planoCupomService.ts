import { HttpError } from './createMemberService.js';
import { resolveAdminRequester, type PlanoServiceEnv } from './planoAuth.js';
import { buscarCupom } from './planoCupom.js';
import { buscarCiclo, calcularPreco } from './planosCiclos.js';

interface PlanoCupomServiceOptions {
  env: PlanoServiceEnv;
  requesterAccessToken: string;
  codigo: string;
  planoCodigo: string;
  ciclo: string;
}

/* Valida o cupom e devolve o preco ja com desconto, para a tela mostrar
   "de R$X por R$Y" antes do cliente confirmar. Quem realmente aplica o
   desconto na assinatura e o planoAssinarService - aqui e so previa. */
export const planoCupomService = async ({
  env,
  requesterAccessToken,
  codigo,
  planoCodigo,
  ciclo: cicloCodigo,
}: PlanoCupomServiceOptions) => {
  const { adminClient } = await resolveAdminRequester(env, requesterAccessToken);

  const ciclo = buscarCiclo(cicloCodigo);
  const cupom = await buscarCupom(adminClient, codigo);

  const { data: plano, error: planoError } = await adminClient
    .from('sales_planos_v2')
    .select('valor_mensal_base')
    .eq('plano_codigo', (planoCodigo || '').trim())
    .eq('ativo', true)
    .maybeSingle();

  if (planoError) {
    throw new HttpError(500, planoError.message);
  }

  if (!plano) {
    throw new HttpError(400, 'Plano inválido ou indisponível.');
  }

  const preco = calcularPreco(Number(plano.valor_mensal_base), ciclo, cupom);

  return {
    codigo: cupom.codigo,
    descricao: cupom.descricao,
    descontoPct: cupom.descontoPct,
    descontoValor: cupom.descontoValor,
    ...preco,
  };
};
