# Sales Kotta

SaaS multi-tenant B2B para o segmento industrial. Cada cliente assinante conecta seu próprio WhatsApp Business API oficial e e-mail (SMTP/IMAP); leads pedem cotação, uma IA faz a triagem e conduz o atendimento até a proposta.

Stack: React 19 + Vite + TypeScript (front, Vercel), Supabase (auth/dados), N8N no Railway (automações/orquestração da IA — fora deste repo).

Esta pasta (`SALES KOTTA .v2`) é o ambiente de desenvolvimento da reconstrução do Sales Kotta — n8n rodando numa instância própria, separada da instância de produção que atende o cliente-piloto.

## Escopo do banco de dados (Supabase MCP)

O MCP `supabase` está conectado ao projeto **KOTTA WORKLIVOO** (`wppdbqeulhjwdcpljyks`) — **e apenas a esse projeto**. Esse projeto Supabase é compartilhado com outros produtos além do Sales Kotta.

- **Só trabalhar com tabelas prefixadas `sales_`** (ex: `sales_empresa`, `sales_atendimento`). Qualquer tabela sem esse prefixo pertence a outro produto e está fora de escopo — não listar, consultar, alterar ou usar como referência, mesmo que apareça em `list_tables`.
- Antes de explorar o schema, filtrar por `table_name like 'sales_%'`.
- Se o usuário pedir algo que exigiria tocar em tabela fora desse prefixo, avisar antes de prosseguir.
- Nunca trocar para outro projeto Supabase sem instrução explícita do usuário — o trabalho é sempre restrito a `wppdbqeulhjwdcpljyks`.
- **Nas automações N8N, nunca usar o node Postgres para falar com o Supabase.** Sempre usar o node HTTP Request direto contra a API do Supabase (REST/PostgREST, ou RPC para lógica mais complexa que precise rodar no banco). Isso é regra fixa, não uma preferência pontual.

## Convenção de automações N8N (MCP)

O MCP `n8n-mcp` está conectado à instância n8n de desenvolvimento (`primary-production-b86f1`, Railway) — separada da instância que roda o cliente-piloto em produção. Padrão de nomenclatura observado nos workflows existentes: prefixo de emoji indicando o estado.

- **Criando/editando uma automação**: nome prefixado com 🟡 (círculo amarelo), e **não publicar** (`publish_workflow`) até o usuário autorizar explicitamente. Fica como rascunho/inativo.
- **Quando o usuário autorizar a publicação**: publicar o workflow e atualizar o título, trocando o 🟡 por 🟢 (círculo verde) e um nome curto e objetivo (sem o "rascunho" no meio do caminho).
- **Layout sempre organizado**: nós dispostos em grid limpo — fluxo principal numa linha horizontal, ramos paralelos (ex: diferentes tipos de integração, diferentes tipos de mídia) em linhas separadas alinhadas verticalmente, sem sobreposição nem posições soltas. Espaçamento consistente entre colunas (ex: 240px) e entre linhas de ramos paralelos. Nós terminais (fim de caminho, tipo "Fim - X") ficam deslocados acima/abaixo da linha principal do fluxo em vez de misturados nela. Nunca deixar nós criados em posições aleatórias/tortas, mesmo em rascunho. Ao adicionar nós num workflow existente, se o layout ficar apertado ou desalinhado, reorganizar antes de seguir — não empilhar em cima do que já existe.
- **Nó "No Operation" (No Op) só no fim de um caminho**, quando não existe mais nada depois dele (ex: "Fim - Sem mensagem", "Fim - Membro inativo"). Nunca usar No Operation como ponto de convergência/checkpoint no meio do fluxo (ex: para múltiplos ramos se juntarem antes de continuar, ou só para dar nome a um ponto de referência) — nesses casos usar um node Set sem nenhum assignment (passthrough, com "Include Other Fields" ligado), que também serve de referência nomeada via `$('Nome do Node')` mas deixa claro visualmente que o fluxo continua dali.

## Regra: etiqueta `restrito` no n8n

A instância `primary-production-b86f1` é compartilhada. Nela convivem os
fluxos do **Kotta** e do **Sales Kotta** (nossos) e os fluxos internos da
**Worklivoo** (prospecção, conteúdo, CRM, painéis).

**Quem decide o que pode ser tocado é a ETIQUETA, não a pasta e não o nome.**

| Fluxo | O que pode |
|---|---|
| com a etiqueta **`restrito`** | é nosso — pode editar, ativar, desativar |
| **sem** etiqueta | é da Worklivoo — **só leitura**. Mexer exige combinar antes, para aquele fluxo específico |

### Obrigatório ao criar

**Todo fluxo novo ou importado do Kotta/Sales Kotta tem que receber a
etiqueta `restrito` na hora.** A etiqueta é a única proteção: fluxo nosso que
subir sem ela vai parecer da Worklivoo e pode ser editado por lá.

### Como conferir

`GET /api/v1/workflows?tags=restrito` devolve a lista dos nossos. O filtro é
confiável porque "restrito" não tem acento — etiqueta acentuada a API do n8n
não resolve, nem codificada na URL.

### As pastas não valem como permissão

`Interno`, `Kotta` e `Sales Kotta` servem só para achar as coisas. Fluxo nosso
sem etiqueta continua desprotegido mesmo estando na pasta Kotta.

### O nome engana

`Cadência de Email Kotta` é da Worklivoo (prospecção para vender o Kotta) e
`Cotar com Fornecedores Cadastrados - Kotta` é nosso (o produto). Os dois têm
"Kotta" no nome. Conferir a etiqueta, nunca o nome.
