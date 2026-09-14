/**
 * Catalogo das mensagens de follow-up.
 *
 * Desde 14/09/2026 o follow-up NAO usa template da Meta. As seis mensagens
 * abaixo sao enviadas ao lead como mensagem de texto comum, dentro da janela de
 * 24h de atendimento que a Meta abre a cada mensagem que o lead manda. Nao ha
 * aprovacao da Meta envolvida, entao o texto pode ser ajustado aqui.
 *
 * Os textos nao citam numero da cotacao nem nome da empresa - decisao de
 * produto. A unica variavel e {{1}}, o primeiro nome do lead; sem nome
 * cadastrado ela vira "tudo bem", por isso todos comecam com "Olá, {{1}}!".
 *
 * IMPORTANTE: os corpos tem uma copia no Code node "Montar mensagem" do
 * workflow "Follow-up de Leads (v2)" no n8n, que e quem renderiza o texto
 * enviado e gravado no historico. Mexeu no texto aqui, mexa la - acentos
 * inclusive.
 *
 * O `nome` de cada mensagem continua no formato sales_kotta_fup_* porque e a
 * chave gravada em sales_empresas_v2.followup_config e no metadata das
 * mensagens ja enviadas.
 *
 * Opt-out: o lead que responder "parar de receber", "parar", "sair" ou
 * "descadastrar" tem os follow-ups pausados pela RPC sales_v2_triagem_aplicar.
 */

export interface FollowupTemplate {
  /** Chave da mensagem, gravada na configuracao da empresa. */
  nome: string;
  titulo: string;
  descricao: string;
  /** Texto com {{1}} = primeiro nome do lead. */
  corpo: string;
}

export const FOLLOWUP_TEMPLATES: FollowupTemplate[] = [
  {
    nome: 'sales_kotta_fup_lembrete',
    titulo: 'Lembrete simples',
    descricao: 'Neutro e curto. Boa primeira tentativa, logo depois do lead sumir.',
    corpo:
      'Olá, {{1}}! Sua cotação ficou pendente e continua aberta por aqui. ' +
      'Quer que a gente siga com ela?',
  },
  {
    nome: 'sales_kotta_fup_pendencia',
    titulo: 'Cobrar informação que falta',
    descricao: 'Para quando a IA fez uma pergunta objetiva e ficou sem resposta.',
    corpo:
      'Olá, {{1}}! Para fechar sua cotação ainda falta uma informação que pedimos na conversa. ' +
      'Pode responder esta mensagem para darmos sequência?',
  },
  {
    nome: 'sales_kotta_fup_disponibilidade',
    titulo: 'Consegue retomar hoje?',
    descricao: 'Cria uma janela concreta de retomada. Boa segunda tentativa.',
    corpo:
      'Olá, {{1}}! Sua cotação continua aberta. Consegue retomar hoje? ' +
      'É rápido: basta responder esta mensagem e seguimos de onde paramos.',
  },
  {
    nome: 'sales_kotta_fup_ajuda',
    titulo: 'Oferecer um vendedor humano',
    descricao: 'Tira o peso do lead ter que responder a IA. Boa segunda tentativa.',
    corpo:
      'Olá, {{1}}! Vimos que sua cotação parou no meio do caminho. ' +
      'Se preferir, um de nossos vendedores assume daqui e te ajuda a concluir. É só responder por aqui.',
  },
  {
    nome: 'sales_kotta_fup_urgencia',
    titulo: 'Preço e disponibilidade podem mudar',
    descricao: 'Cria urgência real. Use com parcimônia, normalmente na última tentativa.',
    corpo:
      'Olá, {{1}}! Sua cotação ainda está aberta, mas preços e disponibilidade podem mudar sem aviso. ' +
      'Responda esta mensagem que confirmamos as condições para você.',
  },
  {
    nome: 'sales_kotta_fup_ultima',
    titulo: 'Última tentativa',
    descricao: 'Avisa que o atendimento vai ser encerrado. Fecha a cadência.',
    corpo:
      'Olá, {{1}}! Como não tivemos retorno, vamos encerrar sua cotação por aqui. ' +
      'Se ainda tiver interesse, é só responder esta mensagem que retomamos o atendimento.',
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
