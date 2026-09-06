/* Catalogos de destino da importacao por planilha.
 *
 * Um lugar so para produtos e clientes: a mesma tela, o mesmo servico e o
 * mesmo fluxo do n8n atendem os dois. Este projeto ja registrou varias
 * vezes o padrao de corrigir um canal e esquecer o outro - duplicar aqui
 * seria criar mais uma ocorrencia.
 *
 * A "ajuda" viaja junto para a IA: e o lugar de colocar a regra especifica
 * de um campo, em vez de encher o prompt de excecoes.
 */

export type TipoImportacao = 'produtos' | 'clientes';

export interface CampoCatalogo {
  campo: string;
  rotulo: string;
  obrigatorio: boolean;
  tipo: 'texto' | 'numero';
  varias: boolean;
  ajuda: string;
  sinonimos: string[];
}

export interface Catalogo {
  tipo: TipoImportacao;
  assunto: string;
  tabela: string;
  campos: CampoCatalogo[];
  /* Campos que identificam o registro. Pelo menos um precisa estar
     mapeado, e e por eles que se decide criar x atualizar. */
  chaves: string[];
  chaveTexto: string;
}

const PRODUTOS: Catalogo = {
  tipo: 'produtos',
  assunto: 'produtos',
  tabela: 'sales_produtos_v2',
  chaves: ['codigo_sku'],
  chaveTexto: 'Código / SKU',
  campos: [
    {
      campo: 'codigo_sku',
      rotulo: 'Código / SKU',
      obrigatorio: true,
      tipo: 'texto',
      varias: false,
      ajuda:
        'codigo INTERNO do produto, o que a empresa usa no dia a dia. Codigo de barras NAO serve: EAN/GTIN e so digitos, com 8, 12, 13 ou 14 deles. Se uma coluna e so digitos nesse comprimento e outra tem letras ou hifen (exemplo FER-001), a segunda e o codigo_sku.',
      sinonimos: ['sku', 'codigo', 'cod', 'code', 'referencia', 'ref', 'interno'],
    },
    {
      campo: 'nome',
      rotulo: 'Nome do produto',
      obrigatorio: true,
      tipo: 'texto',
      varias: true,
      ajuda:
        'texto que identifica o produto para uma pessoa. Planilha costuma chamar isso de descricao do item - nesse caso ela e o NOME, e a coluna de detalhe tecnico e que vira descricao.',
      sinonimos: ['nome', 'produto', 'item', 'name', 'title', 'titulo', 'mercadoria', 'material'],
    },
    {
      campo: 'descricao',
      rotulo: 'Descrição',
      obrigatorio: false,
      tipo: 'texto',
      varias: true,
      ajuda: 'detalhe tecnico complementar, especificacao',
      sinonimos: ['descricao', 'description', 'detalhe', 'detalhamento', 'observacao', 'obs', 'especificacao', 'tecnico'],
    },
    {
      campo: 'preco_venda',
      rotulo: 'Preço de venda',
      obrigatorio: false,
      tipo: 'numero',
      varias: false,
      ajuda: 'preco de VENDA ao cliente. Se houver coluna de custo, ela NAO e esta.',
      sinonimos: ['preco', 'valor', 'vlr', 'price', 'venda'],
    },
    {
      campo: 'moeda',
      rotulo: 'Moeda',
      obrigatorio: false,
      tipo: 'texto',
      varias: false,
      ajuda: 'quando a planilha nao tem essa coluna, o sistema assume BRL sozinho',
      sinonimos: ['moeda', 'currency'],
    },
    {
      campo: 'unidade_medida',
      rotulo: 'Unidade de medida',
      obrigatorio: false,
      tipo: 'texto',
      varias: false,
      ajuda: 'PC, CX, KG, M, JG',
      sinonimos: ['unidade', 'un', 'um', 'medida', 'unit', 'embalagem'],
    },
    {
      campo: 'estoque',
      rotulo: 'Quantidade em estoque',
      obrigatorio: false,
      tipo: 'numero',
      varias: false,
      ajuda:
        'quantas unidades a empresa tem, na unidade de medida do produto. NAO e valor em dinheiro: coluna calculada como quantidade x preco fica de fora.',
      sinonimos: ['estoque', 'quantidade', 'qtd', 'qtde', 'saldo', 'stock', 'disponivel', 'disp'],
    },
    {
      campo: 'categoria',
      rotulo: 'Categoria',
      obrigatorio: false,
      tipo: 'texto',
      varias: true,
      ajuda: 'grupo, familia ou linha de produto',
      sinonimos: ['categoria', 'grupo', 'familia', 'linha', 'category', 'segmento', 'departamento'],
    },
    {
      campo: 'link_referencia',
      rotulo: 'Link de referência',
      obrigatorio: false,
      tipo: 'texto',
      varias: false,
      ajuda: 'endereco de site ou PDF: ficha tecnica, catalogo, pagina do produto no fabricante',
      sinonimos: ['link', 'url', 'site', 'pdf', 'ficha', 'catalogo', 'datasheet', 'endereco'],
    },
    {
      campo: 'metadata',
      rotulo: 'Informações extras',
      obrigatorio: false,
      tipo: 'texto',
      varias: true,
      ajuda: '',
      sinonimos: [],
    },
  ],
};

const CLIENTES: Catalogo = {
  tipo: 'clientes',
  assunto: 'clientes',
  tabela: 'sales_clientes_v2',
  /* O banco tem dois indices unicos parciais: (empresa, codigo_erp) e
     (empresa, cnpj). Qualquer um identifica o cliente, entao a exigencia
     e ter PELO MENOS UM dos dois - diferente de produtos, onde a chave
     e uma so. */
  chaves: ['codigo_erp', 'cnpj'],
  chaveTexto: 'Código no seu sistema ou CNPJ',
  campos: [
    {
      campo: 'codigo_erp',
      rotulo: 'Código no seu sistema',
      obrigatorio: false,
      tipo: 'texto',
      varias: false,
      ajuda: 'codigo do cliente no ERP da empresa. Junto com o CNPJ, e o que identifica o cliente.',
      sinonimos: ['codigo', 'cod', 'erp', 'code', 'interno', 'ref', 'referencia', 'cadastro'],
    },
    {
      campo: 'cnpj',
      rotulo: 'CNPJ',
      obrigatorio: false,
      tipo: 'texto',
      varias: false,
      ajuda: '14 digitos, pode vir formatado. Aceite CPF tambem, se a planilha misturar pessoa fisica.',
      sinonimos: ['cnpj', 'cpf', 'documento', 'doc', 'inscricao'],
    },
    {
      campo: 'nome',
      rotulo: 'Nome / Nome fantasia',
      obrigatorio: true,
      tipo: 'texto',
      varias: true,
      ajuda: 'como a empresa chama esse cliente no dia a dia. Se houver Fantasia e Razao Social, a Fantasia e o nome.',
      sinonimos: ['nome', 'fantasia', 'cliente', 'name', 'apelido'],
    },
    {
      campo: 'razao_social',
      rotulo: 'Razão social',
      obrigatorio: false,
      tipo: 'texto',
      varias: false,
      ajuda: 'nome juridico completo, costuma terminar em LTDA, ME, EIRELI ou SA',
      sinonimos: ['razao', 'razaosocial', 'juridica', 'empresa'],
    },
    {
      campo: 'email',
      rotulo: 'E-mail',
      obrigatorio: false,
      tipo: 'texto',
      varias: false,
      ajuda: 'e-mail de contato do cliente',
      sinonimos: ['email', 'mail', 'correio'],
    },
    {
      campo: 'telefone',
      rotulo: 'Telefone',
      obrigatorio: false,
      tipo: 'texto',
      varias: false,
      ajuda: 'telefone fixo ou comercial',
      sinonimos: ['telefone', 'fone', 'tel', 'phone', 'comercial', 'fixo'],
    },
    {
      campo: 'whatsapp',
      rotulo: 'WhatsApp',
      obrigatorio: false,
      tipo: 'texto',
      varias: false,
      ajuda: 'celular. Se a planilha tiver so um telefone e ele for celular, prefira este campo.',
      sinonimos: ['whatsapp', 'zap', 'celular', 'cel', 'movel', 'mobile'],
    },
    {
      campo: 'metadata',
      rotulo: 'Informações extras',
      obrigatorio: false,
      tipo: 'texto',
      varias: true,
      ajuda: '',
      sinonimos: [],
    },
  ],
};

export const CATALOGOS: Record<TipoImportacao, Catalogo> = {
  produtos: PRODUTOS,
  clientes: CLIENTES,
};

export const pegarCatalogo = (tipo: unknown): Catalogo =>
  tipo === 'clientes' ? CLIENTES : PRODUTOS;

/* Enviado ao n8n: so o que a IA precisa saber, sem os sinonimos (que sao
   da heuristica de reserva) nem o campo metadata (escolha da pessoa, nao
   palpite automatico). */
export const catalogoParaIa = (c: Catalogo) =>
  c.campos
    .filter((campo) => campo.campo !== 'metadata')
    .map(({ campo, rotulo, obrigatorio, tipo, ajuda }) => ({ campo, rotulo, obrigatorio, tipo, ajuda }));
