-- Modelo de proposta (PDF do orcamento)
--
-- Migracao ADITIVA: so cria duas colunas nullable. Nenhuma coluna existente muda,
-- nada e apagado, e empresa/orcamento sem valor continua funcionando com os padroes.
--
-- modelo_proposta: configuracao da empresa (cor, titulo, colunas, condicoes...). Formato em
--   lib/modeloProposta.ts (ModeloProposta). Nulo = tudo no padrao.
-- dados_proposta:  fotografia dos dados do orcamento no dia da emissao (itens, precos,
--   cliente...), formato DadosProposta. Permite re-renderizar o documento sem voltar ao
--   catalogo, cujos precos mudam. Nulo nos orcamentos antigos, que so tem html_orcamento.

alter table sales_empresas_v2   add column if not exists modelo_proposta jsonb;
alter table sales_orcamentos_v2 add column if not exists dados_proposta  jsonb;
