import { HttpError } from './createMemberService.js';
import {
  resolveAdminRequester,
  registrarFatura,
  reavaliarSuspensao,
  type PlanoServiceEnv,
} from './planoAuth.js';
import { buscarCupom, type CupomEncontrado } from './planoCupom.js';
import { buscarCiclo, calcularPreco } from './planosCiclos.js';
import {
  buscarClientePorCpfCnpj,
  criarCliente,
  atualizarCliente,
  criarAssinatura,
  criarAssinaturaComCartao,
  atualizarAssinatura,
  listarCobrancasDaAssinatura,
  obterQrCodePix,
} from './asaasClient.js';

interface DadosCobrancaPayload {
  nome?: string;
  cnpj?: string;
  email?: string;
  celular?: string;
}

interface CartaoPayload {
  numero?: string;
  nomeImpresso?: string;
  validadeMes?: string;
  validadeAno?: string;
  cvv?: string;
  cep?: string;
  numeroEndereco?: string;
  complemento?: string;
}

interface PlanoAssinarPayload {
  planoCodigo: string;
  ciclo: string;
  dadosCobranca: DadosCobrancaPayload;
  cupom?: string;
  pagamento?: { forma?: 'PIX' | 'CREDIT_CARD'; cartao?: CartaoPayload };
}

interface PlanoAssinarServiceOptions {
  env: PlanoServiceEnv;
  requesterAccessToken: string;
  remoteIp: string;
  payload: PlanoAssinarPayload;
}

const somenteDigitos = (valor: string | null | undefined) => (valor || '').replace(/\D/g, '');
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hojeISO = () => new Date().toISOString().slice(0, 10);

/* Checksum de Luhn - pega erro de digitacao no numero do cartao antes de
   mandar pro provedor. Nao substitui a validacao deles, so evita uma
   chamada desnecessaria por um numero obviamente errado. */
const passaNoLuhn = (numero: string) => {
  let soma = 0;
  let dobrar = false;

  for (let i = numero.length - 1; i >= 0; i -= 1) {
    let digito = Number(numero[i]);
    if (dobrar) {
      digito *= 2;
      if (digito > 9) digito -= 9;
    }
    soma += digito;
    dobrar = !dobrar;
  }

  return soma % 10 === 0;
};

const validarDadosCobranca = (dados: DadosCobrancaPayload) => {
  const nome = (dados.nome || '').trim();
  const cnpj = somenteDigitos(dados.cnpj);
  const email = (dados.email || '').trim();
  const celular = somenteDigitos(dados.celular);

  if (!nome) {
    throw new HttpError(400, 'Informe a razão social/nome do responsável.');
  }

  if (cnpj.length !== 14) {
    throw new HttpError(400, 'Informe um CNPJ válido (14 dígitos).');
  }

  if (!EMAIL_REGEX.test(email)) {
    throw new HttpError(400, 'Informe um e-mail válido.');
  }

  if (celular.length !== 11 || celular[2] !== '9') {
    throw new HttpError(400, 'Informe um celular válido, com DDD (ex: 11 91234-5678).');
  }

  return { nome, cnpj, email, celular };
};

const validarCartao = (cartao: CartaoPayload | undefined) => {
  const numero = somenteDigitos(cartao?.numero);
  const nomeImpresso = (cartao?.nomeImpresso || '').trim();
  const validadeMes = (cartao?.validadeMes || '').trim().padStart(2, '0');
  const validadeAno = (cartao?.validadeAno || '').trim();
  const cvv = somenteDigitos(cartao?.cvv);
  const cep = somenteDigitos(cartao?.cep);
  const numeroEndereco = (cartao?.numeroEndereco || '').trim();
  const complemento = (cartao?.complemento || '').trim();

  if (numero.length < 13 || numero.length > 19 || !passaNoLuhn(numero)) {
    throw new HttpError(400, 'Número do cartão inválido.');
  }

  if (!nomeImpresso) {
    throw new HttpError(400, 'Informe o nome impresso no cartão.');
  }

  const mesNumero = Number(validadeMes);
  if (!mesNumero || mesNumero < 1 || mesNumero > 12) {
    throw new HttpError(400, 'Mês de validade do cartão inválido.');
  }

  if (validadeAno.length !== 4 || Number(validadeAno) < new Date().getFullYear()) {
    throw new HttpError(400, 'Ano de validade do cartão inválido.');
  }

  if (cvv.length < 3 || cvv.length > 4) {
    throw new HttpError(400, 'Código de segurança (CVV) do cartão inválido.');
  }

  if (cep.length !== 8) {
    throw new HttpError(400, 'Informe um CEP válido para o endereço de cobrança.');
  }

  if (!numeroEndereco) {
    throw new HttpError(400, 'Informe o número do endereço de cobrança.');
  }

  return { numero, nomeImpresso, validadeMes, validadeAno, cvv, cep, numeroEndereco, complemento };
};

export const planoAssinarService = async ({
  env,
  requesterAccessToken,
  remoteIp,
  payload,
}: PlanoAssinarServiceOptions) => {
  const { adminClient, asaasConfig, empresaId } = await resolveAdminRequester(env, requesterAccessToken);

  const planoCodigo = (payload?.planoCodigo || '').trim();
  const ciclo = buscarCiclo((payload?.ciclo || '').trim());
  const dadosCobranca = validarDadosCobranca(payload?.dadosCobranca || {});

  const [{ data: plano, error: planoError }, { data: empresa, error: empresaError }] = await Promise.all([
    adminClient
      .from('sales_planos_v2')
      .select('plano_codigo, nome, limite_atendimentos_mes, valor_mensal_base')
      .eq('plano_codigo', planoCodigo)
      .eq('ativo', true)
      .maybeSingle(),
    adminClient
      .from('sales_empresas_v2')
      .select('asaas_customer_id, asaas_subscription_id, pagamento')
      .eq('empresa_id', empresaId)
      .maybeSingle(),
  ]);

  if (planoError) throw new HttpError(500, planoError.message);
  if (empresaError) throw new HttpError(500, empresaError.message);

  if (!plano) {
    throw new HttpError(400, 'Plano inválido ou indisponível.');
  }

  const pagamentoAtual = (empresa?.pagamento || {}) as {
    forma?: string;
    cartao?: { bandeira?: string; final4?: string };
    cupom?: { codigo?: string; desconto_pct?: number | null; desconto_valor?: number | null };
  };

  /* Cupom: se o cliente informou um novo, vale o novo. Se nao informou mas a
     empresa ja tinha um cupom aplicado, ele continua valendo (o desconto
     negociado nao se perde numa troca de plano). */
  let cupom: CupomEncontrado | null = null;

  if ((payload?.cupom || '').trim()) {
    cupom = await buscarCupom(adminClient, payload.cupom as string);
  } else if (pagamentoAtual.cupom?.codigo) {
    cupom = {
      codigo: pagamentoAtual.cupom.codigo,
      descricao: null,
      descontoPct: pagamentoAtual.cupom.desconto_pct ?? null,
      descontoValor: pagamentoAtual.cupom.desconto_valor ?? null,
    };
  }

  const preco = calcularPreco(Number(plano.valor_mensal_base), ciclo, cupom);
  const descricao = `Sales Kotta - ${plano.nome} (${ciclo.label.toLowerCase()})`;

  let asaasCustomerId = empresa?.asaas_customer_id as string | null;

  const dadosClienteAsaas = {
    name: dadosCobranca.nome,
    cpfCnpj: dadosCobranca.cnpj,
    email: dadosCobranca.email,
    mobilePhone: dadosCobranca.celular,
  };

  if (asaasCustomerId) {
    await atualizarCliente(asaasConfig, asaasCustomerId, dadosClienteAsaas);
  } else {
    const existente = await buscarClientePorCpfCnpj(asaasConfig, dadosCobranca.cnpj);

    if (existente) {
      asaasCustomerId = existente.id;
      await atualizarCliente(asaasConfig, asaasCustomerId, dadosClienteAsaas);
    } else {
      const criado = await criarCliente(asaasConfig, dadosClienteAsaas);
      asaasCustomerId = criado.id;
    }
  }

  const asaasSubscriptionId = empresa?.asaas_subscription_id as string | null;
  const jaTinhaAssinatura = Boolean(asaasSubscriptionId);

  const novoPagamento: Record<string, unknown> = {
    ...(pagamentoAtual.forma ? { forma: pagamentoAtual.forma } : {}),
    ...(pagamentoAtual.cartao ? { cartao: pagamentoAtual.cartao } : {}),
    ...(cupom
      ? {
          cupom: {
            codigo: cupom.codigo,
            desconto_pct: cupom.descontoPct,
            desconto_valor: cupom.descontoValor,
          },
        }
      : {}),
  };

  const atualizacaoEmpresa: Record<string, unknown> = {
    plano_codigo: plano.plano_codigo,
    plano: plano.nome,
    plano_ciclo: ciclo.codigo,
    valor_mensal: preco.precoMesEquivalente,
    limite_atendimentos_mes: plano.limite_atendimentos_mes,
    asaas_customer_id: asaasCustomerId,
    nome_responsavel: dadosCobranca.nome,
    cnpj: dadosCobranca.cnpj,
    email_responsavel: dadosCobranca.email,
    telefone_responsavel: `55${dadosCobranca.celular}`,
    // Contratacao nova ou troca de plano reinicia o ciclo de consumo: o
    // limite mensal passa a contar a partir de hoje.
    data_contratacao_atual: new Date().toISOString(),
  };

  let resultado: Record<string, unknown>;

  if (jaTinhaAssinatura) {
    // Troca de plano numa assinatura existente: so muda valor/ciclo. A forma
    // de pagamento (Pix ou cartao ja tokenizado) e mantida pelo Asaas.
    const assinatura = await atualizarAssinatura(asaasConfig, asaasSubscriptionId as string, {
      value: preco.precoFinal,
      cycle: ciclo.asaasCycle,
      description: descricao,
    });

    atualizacaoEmpresa.asaas_subscription_id = assinatura.id;
    atualizacaoEmpresa.assinatura_periodo_fim = assinatura.nextDueDate;
    atualizacaoEmpresa.pagamento = novoPagamento;

    resultado = { tipo: 'ATUALIZADO', ...preco };
  } else if (payload?.pagamento?.forma === 'CREDIT_CARD') {
    const cartao = validarCartao(payload?.pagamento?.cartao);

    const assinatura = await criarAssinaturaComCartao(asaasConfig, {
      customer: asaasCustomerId as string,
      value: preco.precoFinal,
      cycle: ciclo.asaasCycle,
      nextDueDate: hojeISO(),
      description: descricao,
      remoteIp,
      creditCard: {
        holderName: cartao.nomeImpresso,
        number: cartao.numero,
        expiryMonth: cartao.validadeMes,
        expiryYear: cartao.validadeAno,
        ccv: cartao.cvv,
      },
      creditCardHolderInfo: {
        name: dadosCobranca.nome,
        email: dadosCobranca.email,
        cpfCnpj: dadosCobranca.cnpj,
        postalCode: cartao.cep,
        addressNumber: cartao.numeroEndereco,
        addressComplement: cartao.complemento || undefined,
        phone: dadosCobranca.celular,
      },
    });

    const aprovado = assinatura.status === 'ACTIVE';

    atualizacaoEmpresa.asaas_subscription_id = assinatura.id;
    atualizacaoEmpresa.assinatura_periodo_fim = assinatura.nextDueDate;
    atualizacaoEmpresa.endereco_faturamento = {
      cep: cartao.cep,
      numero: cartao.numeroEndereco,
      complemento: cartao.complemento || null,
    };
    atualizacaoEmpresa.pagamento = {
      ...novoPagamento,
      forma: 'CREDIT_CARD',
      /* Guardamos o token do cartao (nao o numero) para poder cobrar
         cotacoes extras depois sem pedir o cartao de novo. */
      cartao: assinatura.creditCard
        ? {
            bandeira: assinatura.creditCard.creditCardBrand,
            final4: assinatura.creditCard.creditCardNumber,
            token: assinatura.creditCard.creditCardToken || null,
          }
        : null,
    };

    /* Assinatura nova comeca sem status ate a cobranca ser confirmada. Sem
       isso, quem cancelou e assinou de novo continuaria marcado como
       CANCELADO na tela. */
    atualizacaoEmpresa.plano_status = aprovado ? 'ATIVO' : null;

    if (aprovado) {
      atualizacaoEmpresa.cliente_status = 'ATIVO';
    }

    const [primeiraCobranca] = await listarCobrancasDaAssinatura(asaasConfig, assinatura.id);

    if (primeiraCobranca) {
      await registrarFatura(adminClient, empresaId, 'ASSINATURA', primeiraCobranca);
    }

    resultado = {
      tipo: 'CARTAO',
      ...preco,
      aprovado,
      cartao: assinatura.creditCard
        ? { bandeira: assinatura.creditCard.creditCardBrand, final4: assinatura.creditCard.creditCardNumber }
        : null,
    };
  } else if (payload?.pagamento?.forma === 'PIX') {
    const assinatura = await criarAssinatura(asaasConfig, {
      customer: asaasCustomerId as string,
      value: preco.precoFinal,
      cycle: ciclo.asaasCycle,
      nextDueDate: hojeISO(),
      description: descricao,
      billingType: 'PIX',
    });

    atualizacaoEmpresa.asaas_subscription_id = assinatura.id;
    atualizacaoEmpresa.assinatura_periodo_fim = assinatura.nextDueDate;
    atualizacaoEmpresa.pagamento = { ...novoPagamento, forma: 'PIX' };
    // Pix so vira ATIVO quando o pagamento e confirmado (webhook ou "Ja paguei").
    atualizacaoEmpresa.plano_status = null;

    const [primeiraCobranca] = await listarCobrancasDaAssinatura(asaasConfig, assinatura.id);
    const qrCode = primeiraCobranca ? await obterQrCodePix(asaasConfig, primeiraCobranca.id) : null;

    if (primeiraCobranca) {
      await registrarFatura(adminClient, empresaId, 'ASSINATURA', primeiraCobranca);
    }

    resultado = {
      tipo: 'PIX',
      ...preco,
      paymentId: primeiraCobranca?.id || null,
      pix: qrCode
        ? { qrCodeBase64: qrCode.encodedImage, copiaCola: qrCode.payload, expiracao: qrCode.expirationDate }
        : null,
    };
  } else {
    throw new HttpError(400, 'Escolha uma forma de pagamento (Pix ou cartão de crédito).');
  }

  const { error: updateError } = await adminClient
    .from('sales_empresas_v2')
    .update(atualizacaoEmpresa)
    .eq('empresa_id', empresaId);

  if (updateError) {
    throw new HttpError(500, updateError.message);
  }

  /* Troca de plano reinicia o ciclo e o contador de cotacoes, entao quem
     estava suspenso por limite volta a ser atendido. Assinatura nova depois
     do periodo gratis so reativa quando o pagamento e confirmado - a funcao
     do banco cuida dessa diferenca. */
  await reavaliarSuspensao(adminClient, empresaId);

  return resultado;
};
