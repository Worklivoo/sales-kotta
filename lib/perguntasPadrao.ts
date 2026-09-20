// Perguntas padrão sugeridas para a base de conhecimento.
//
// Não viram linha no banco enquanto o cliente não responder: a tela mostra
// "sugeridas ainda não respondidas" = esta lista menos o que a empresa já tem
// (comparando por codigo_padrao). Quando ele responde, nasce uma entrada normal,
// ativa, e o embedding é gerado pelo fluxo de sempre.
//
// Vantagem de não gravar antes: nada falso na base do cliente, nenhum embedding
// desperdiçado, o liga/desliga continua significando só uma coisa, e uma
// pergunta nova aqui aparece para todos os clientes sem migração.
//
// A lista saiu dos testes de auditoria de 19 e 20/09 (ver docs/kotta-lab.md):
// são as perguntas que os leads realmente fizeram.
//
// ATENÇÃO: este texto aparece na tela do cliente. Escrever com acento.

export interface PerguntaPadrao {
  codigo: string;
  pergunta: string;
  /** O que a resposta precisa dizer. Aparece como ajuda no formulário. */
  dica: string;
  grupo: 'comercial' | 'catalogo';
}

export const PERGUNTAS_PADRAO: PerguntaPadrao[] = [
  // --- Comerciais: valem para qualquer empresa
  {
    codigo: 'formas_pagamento',
    pergunta: 'Quais as formas de pagamento?',
    dica: 'Liste o que você aceita (Pix, boleto, cartão, faturado) e a condição de cada um.',
    grupo: 'comercial',
  },
  {
    codigo: 'parcelamento',
    pergunta: 'Vocês parcelam? Em quantas vezes?',
    dica: 'Diga em quantas vezes, com ou sem juros, e em qual meio. Vale ter separado das formas de pagamento: o cliente pergunta das duas maneiras.',
    grupo: 'comercial',
  },
  {
    codigo: 'frete',
    pergunta: 'Vocês cobram frete? Tem frete grátis?',
    dica: 'Se houver condição de valor ou de região, escreva a cidade e o estado por extenso — a IA não sabe a que cidade um CEP pertence.',
    grupo: 'comercial',
  },
  {
    codigo: 'prazo_entrega',
    pergunta: 'Qual o prazo de entrega?',
    dica: 'Se o prazo muda conforme a região, escreva as cidades e os estados por extenso e diga o que acontece fora dessas regiões.',
    grupo: 'comercial',
  },
  {
    codigo: 'area_entrega',
    pergunta: 'Vocês entregam em quais regiões?',
    dica: 'Até onde você entrega e o que fazer quando o cliente está fora dessa área.',
    grupo: 'comercial',
  },
  {
    codigo: 'retirada',
    pergunta: 'Posso retirar no local?',
    dica: 'Se sim, informe o endereço, os dias e horários, e como o cliente é avisado de que o pedido está pronto.',
    grupo: 'comercial',
  },
  {
    codigo: 'nota_fiscal',
    pergunta: 'Vocês emitem nota fiscal?',
    dica: 'Responda direto e diga o que você precisa do cliente para emitir.',
    grupo: 'comercial',
  },
  {
    codigo: 'pessoa_fisica',
    pergunta: 'Vocês vendem para pessoa física (CPF)?',
    dica: 'Se vende, diga o que muda: documento necessário e condições de pagamento.',
    grupo: 'comercial',
  },
  {
    codigo: 'por_que_cnpj',
    pergunta: 'Por que vocês precisam do CNPJ?',
    dica: 'Explique em uma frase. Serve para quando o cliente resiste a passar o documento.',
    grupo: 'comercial',
  },
  {
    codigo: 'validade_orcamento',
    pergunta: 'Qual a validade do orçamento?',
    dica: 'Quantos dias o orçamento vale, contados a partir de quando.',
    grupo: 'comercial',
  },
  {
    codigo: 'pedido_minimo',
    pergunta: 'Tem pedido mínimo?',
    dica: 'Valor ou quantidade mínima, se houver. Se não houver, diga que não há.',
    grupo: 'comercial',
  },
  {
    codigo: 'desconto_quantidade',
    pergunta: 'Vocês dão desconto para quantidade?',
    dica: 'Evite prometer percentual. O mais seguro é dizer que o vendedor avalia junto com o orçamento.',
    grupo: 'comercial',
  },
  {
    codigo: 'troca_garantia',
    pergunta: 'Como funciona troca e garantia?',
    dica: 'Prazo para troca, o que o cliente precisa apresentar e qual é a garantia do produto.',
    grupo: 'comercial',
  },
  {
    codigo: 'horario_atendimento',
    pergunta: 'Qual o horário de atendimento?',
    dica: 'Dias e horários, incluindo sábado, se houver.',
    grupo: 'comercial',
  },
  {
    codigo: 'endereco',
    pergunta: 'Onde fica a empresa?',
    dica: 'Cidade e estado já bastam. Coloque o endereço completo se você recebe visita.',
    grupo: 'comercial',
  },
  {
    codigo: 'visita',
    pergunta: 'Posso agendar uma visita?',
    dica: 'Se você recebe visita, diga como o cliente agenda.',
    grupo: 'comercial',
  },

  // --- Catálogo: cada empresa escreve as suas. Dá para editar a pergunta ao responder.
  {
    codigo: 'o_que_vende',
    pergunta: 'Com o que vocês trabalham? Quais são seus produtos?',
    dica: 'Liste as famílias de produto, não o catálogo inteiro. É a pergunta que mais aparece no primeiro contato.',
    grupo: 'catalogo',
  },
  {
    codigo: 'tem_produto_principal',
    pergunta: 'Vocês têm [seu produto principal]?',
    dica: 'Troque o trecho entre colchetes pelo produto que mais te procuram. Responda confirmando e já puxando a cotação.',
    grupo: 'catalogo',
  },
  {
    codigo: 'tipos_produto_principal',
    pergunta: 'Quais tipos ou modelos de [seu produto principal] vocês têm?',
    dica: 'Descreva pelo que varia (tamanho, acabamento, material), sem listar item por item.',
    grupo: 'catalogo',
  },
  {
    codigo: 'nao_vende',
    pergunta: 'Vocês trabalham com [algo que vocês NÃO vendem]?',
    dica: 'A mais valiosa da lista. Coloque aquilo que confundem com o seu produto mas você não vende, e ofereça a alternativa que você tem. Pode cadastrar mais de uma.',
    grupo: 'catalogo',
  },
  {
    codigo: 'usado',
    pergunta: 'Vocês trabalham com usado ou recondicionado?',
    dica: 'Responda direto. Se não trabalha, diga que é só novo.',
    grupo: 'catalogo',
  },
  {
    codigo: 'sob_medida',
    pergunta: 'Vocês fazem sob medida?',
    dica: 'Se faz, diga o que você precisa saber do cliente para orçar.',
    grupo: 'catalogo',
  },
];
