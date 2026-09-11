/**
 * Catalogo de templates de follow-up.
 *
 * Os seis modelos abaixo sao criados de uma vez na WABA da empresa, no momento
 * em que a WABA e definida. Criar todos de antemao e o que permite o cliente
 * trocar de modelo nas Configuracoes e ver o efeito no disparo seguinte: se
 * cada modelo so fosse criado quando escolhido, toda troca ficaria esperando a
 * aprovacao da Meta, que leva de minutos a horas.
 *
 * Os textos nao citam numero da cotacao nem nome da empresa - decisao de
 * produto. A unica variavel e o nome do lead.
 *
 * Regras da Meta que o formato abaixo respeita (mexer aqui sem respeitar
 * significa template reprovado, e template reprovado nao pode ser corrigido -
 * so recriado com outro nome):
 *   - corpo nao pode comecar nem terminar com variavel;
 *   - todo template precisa de exemplo para cada variavel.
 *
 * Categoria: os modelos sao enviados como UTILITY, que e bem mais barata. Se a
 * Meta entender que o conteudo e promocional, ela mesma recategoriza para
 * MARKETING na aprovacao - o template continua valido, so muda o preco.
 *
 * IMPORTANTE: depois de aprovado, o texto de um template NAO pode ser editado.
 * Editar `corpo` aqui so afeta empresas cuja WABA ainda nao foi provisionada.
 */

export interface FollowupTemplate {
  /** Nome do template na Meta. Minusculas, digitos e underline. */
  nome: string;
  titulo: string;
  descricao: string;
  /** Texto com {{1}} = primeiro nome do lead. */
  corpo: string;
  exemplo: [string];
}

/**
 * Rotulo do botao de opt-out.
 *
 * No WhatsApp o clique chega na Triagem como mensagem type=button, com este
 * texto exato em button.text; o no "Texto (Mensagem)" da Triagem le esse campo
 * e o passa adiante como conteudo. A RPC sales_v2_triagem_aplicar reconhece o
 * rotulo, pausa os follow-ups e devolve followup_optout=true, e a Triagem
 * encerra o fluxo no no "Lead Pediu para Parar?". No e-mail o lead digita a
 * mesma frase. Mudar o rotulo so aqui faz o opt-out parar de funcionar em
 * silencio.
 */
export const BOTAO_OPT_OUT = 'Parar de receber';

export const FOLLOWUP_TEMPLATES: FollowupTemplate[] = [
  {
    nome: 'sales_kotta_fup_lembrete',
    titulo: 'Lembrete simples',
    descricao: 'Neutro e curto. Boa primeira tentativa, logo depois do lead sumir.',
    corpo:
      'Olá, {{1}}! Sua cotação ficou pendente e continua aberta por aqui. ' +
      'Quer que a gente siga com ela?',
    exemplo: ['Marcos'],
  },
  {
    nome: 'sales_kotta_fup_pendencia',
    titulo: 'Cobrar informação que falta',
    descricao: 'Para quando a IA fez uma pergunta objetiva e ficou sem resposta.',
    corpo:
      'Olá, {{1}}! Para fechar sua cotação ainda falta uma informação que pedimos na conversa. ' +
      'Pode responder esta mensagem para darmos sequência?',
    exemplo: ['Marcos'],
  },
  {
    nome: 'sales_kotta_fup_disponibilidade',
    titulo: 'Consegue retomar hoje?',
    descricao: 'Cria uma janela concreta de retomada. Boa segunda tentativa.',
    corpo:
      'Olá, {{1}}! Sua cotação continua aberta. Consegue retomar hoje? ' +
      'É rápido: basta responder esta mensagem e seguimos de onde paramos.',
    exemplo: ['Marcos'],
  },
  {
    nome: 'sales_kotta_fup_ajuda',
    titulo: 'Oferecer um vendedor humano',
    descricao: 'Tira o peso do lead ter que responder a IA. Boa segunda tentativa.',
    corpo:
      'Olá, {{1}}! Vimos que sua cotação parou no meio do caminho. ' +
      'Se preferir, um de nossos vendedores assume daqui e te ajuda a concluir. É só responder por aqui.',
    exemplo: ['Marcos'],
  },
  {
    nome: 'sales_kotta_fup_urgencia',
    titulo: 'Preço e disponibilidade podem mudar',
    descricao: 'Cria urgência real. Use com parcimônia, normalmente na última tentativa.',
    corpo:
      'Olá, {{1}}! Sua cotação ainda está aberta, mas preços e disponibilidade podem mudar sem aviso. ' +
      'Responda esta mensagem que confirmamos as condições para você.',
    exemplo: ['Marcos'],
  },
  {
    nome: 'sales_kotta_fup_ultima',
    titulo: 'Última tentativa',
    descricao: 'Avisa que o atendimento vai ser encerrado. Fecha a cadência.',
    corpo:
      'Olá, {{1}}! Como não tivemos retorno, vamos encerrar sua cotação por aqui. ' +
      'Se ainda tiver interesse, é só responder esta mensagem que retomamos o atendimento.',
    exemplo: ['Marcos'],
  },
];

export function buscarTemplate(nome: string | null | undefined): FollowupTemplate | null {
  if (!nome) {
    return null;
  }

  return FOLLOWUP_TEMPLATES.find((template) => template.nome === nome) ?? null;
}

/** Troca {{1}} pelo primeiro nome do lead. */
export function renderizarTemplate(corpo: string, leadNome: string): string {
  return corpo.replace(/\{\{1\}\}/g, leadNome);
}

/**
 * Corpo do template no formato que a Graph API espera em
 * POST /{waba_id}/message_templates.
 */
export function montarPayloadMeta(template: FollowupTemplate) {
  return {
    name: template.nome,
    language: 'pt_BR',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: template.corpo,
        example: { body_text: [template.exemplo] },
      },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'QUICK_REPLY', text: BOTAO_OPT_OUT }],
      },
    ],
  };
}
