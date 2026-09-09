# Login centralizado (hub) — contrato de handoff de sessao

Contexto: `app.worklivoo.com` (hub) e os dois produtos (`saleskotta.worklivoo.com`,
`kotta.worklivoo.com`) usam o mesmo projeto Supabase / mesmo Auth. O hub faz o
login e o usuario escolhe o produto; o produto de destino precisa "receber"
essa sessao ja autenticada sem exigir novo login. As paginas de login
individuais de cada produto continuam existindo e funcionando exatamente como
hoje, sem nenhuma alteracao — o handoff e um caminho adicional, nao uma
substituicao.

Mecanismo escolhido: **handoff de token via fragmento de URL** (nao cookie
compartilhado de dominio). Motivo: nao exige trocar como a sessao e guardada
em nenhum dos apps (continua `localStorage`, padrao do supabase-js), nao
desloga quem ja esta logado hoje, e nao tem as pegadinhas de cookie de
subdominio em `localhost` durante o dev.

## O contrato

Depois do login no hub e da escolha do produto, o hub redireciona o browser
(navegacao real, `window.location.href`, nao fetch) para a raiz do produto
com os tokens da sessao atual no **fragmento** da URL (`#...`), nunca em
query string — fragmento nao e enviado ao servidor nem aparece em
`Referer`/logs, entao os tokens nao vazam no caminho ate o produto:

```
https://saleskotta.worklivoo.com/#hub_access_token=<access_token>&hub_refresh_token=<refresh_token>
https://kotta.worklivoo.com/#hub_access_token=<access_token>&hub_refresh_token=<refresh_token>
```

Os nomes dos parametros (`hub_access_token`, `hub_refresh_token`) sao
propositalmente prefixados com `hub_` para nao colidir com qualquer uso nativo
futuro do Supabase no fragmento (ex: fluxo de recuperacao de senha, que tambem
usa `access_token` no hash).

O produto de destino, ao carregar:
1. Le `window.location.hash`.
2. Se achar os dois parametros, chama `supabase.auth.setSession({ access_token, refresh_token })`.
3. Remove o hash da URL (`history.replaceState`) — mesmo em caso de erro, pra
   nao deixar token preso na barra de endereco / historico do navegador.
4. Segue o fluxo normal de autenticacao do app (o que ja existe hoje pra
   quando alguem loga direto pela pagina individual) — validacao de acesso ao
   produto, redirecionamento pra tela inicial, etc. Nao duplica logica: o
   handoff so entrega a sessao, quem decide se o usuario pode entrar continua
   sendo a mesma checagem de sempre.

## O que ja foi feito no Sales Kotta (este repo)

- [lib/hubHandoff.ts](../lib/hubHandoff.ts) — le o hash, chama `setSession`,
  limpa a URL, devolve `{ handled, error? }`.
- [App.tsx](../App.tsx) — no boot, antes de `supabase.auth.getSession()`,
  chama `consumeHubHandoff()`. Se vier erro, mostra na tela de login (reusa o
  `authError` que ja existia). Se nao vier nada no hash, e um no-op — o fluxo
  de login individual (`pages/Login.tsx`) nao foi tocado.
- A checagem de acesso ja existente (`validateActiveMemberAccess` em
  [lib/memberAccess.ts](../lib/memberAccess.ts), contra `sales_membros_v2`,
  `status = 'ATIVO'`) roda do mesmo jeito depois do handoff — se o hub mandar
  alguem sem acesso ao Sales Kotta pra ca, essa pessoa e deslogada com a
  mensagem de sempre. Defesa em profundidade: mesmo que o hub erre a lista de
  produtos, o produto de destino barra por conta propria.

## O que falta implementar no HUB (`app.worklivoo.com`)

1. Pagina de login unica contra o mesmo projeto Supabase (mesma URL/anon key
   dos outros dois apps).
2. Depois do login, descobrir quais produtos o usuario pode ver:
   - Sales Kotta: existe registro em `sales_membros_v2` pro `user_id`, com
     `status = 'ATIVO'`.
   - Kotta Worklivoo: equivalente na tabela `membros` do outro projeto — **a
     confirmar o nome exato da coluna de status/vinculo com o time do Kotta**,
     este repo nao tem visibilidade sobre essa tabela.
   - Mostrar so os cards dos produtos liberados (nao logado = 0 cards = sem
     card nenhum visivel, so tela vazia/mensagem).
3. Ao clicar num card, pegar a sessao atual (`supabase.auth.getSession()`) e
   redirecionar com `window.location.href` pra:
   - `https://saleskotta.worklivoo.com/#hub_access_token=...&hub_refresh_token=...`
   - `https://kotta.worklivoo.com/#hub_access_token=...&hub_refresh_token=...`
4. Nao logar essas URLs (analytics, console, etc). Usar sempre HTTPS em
   producao.

## O que falta implementar no Kotta Worklivoo

Espelhar exatamente o que foi feito aqui:
1. Copiar a logica de [lib/hubHandoff.ts](../lib/hubHandoff.ts) (mesmos nomes
   de parametro: `hub_access_token` / `hub_refresh_token` — tem que bater com
   o que o hub envia).
2. No boot do app, antes da checagem de sessao normal, chamar essa funcao.
3. Manter a pagina de login individual do Kotta como esta hoje.
4. A validacao de acesso do Kotta (o que hoje decide se o usuario pode entrar,
   provavelmente contra a tabela `membros`) continua rodando normalmente
   depois do handoff — nao precisa duplicar nem mudar essa parte.

## Fora do escopo deste documento

- Nenhuma tabela fora do prefixo `sales_` foi tocada neste repo — a consulta
  a `membros` (Kotta Worklivoo) e responsabilidade do projeto do hub/Kotta,
  nao deste.
- Nao houve mudanca em `lib/supabase.ts` nem no mecanismo de armazenamento de
  sessao do Sales Kotta.
