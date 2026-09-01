# Sistema visual Worklivoo

Este arquivo é a fonte da verdade de layout para tudo que a Worklivoo constrói:
site, painéis e produto. Ele descreve o padrão já aprovado — siga-o em vez de
inventar um novo.

`tokens.css` acompanha este arquivo. Importe-o e use as variáveis; nunca escreva
um valor de cor, raio ou espaçamento direto no código.

---

## 1. Fundamentos

### Cor

A paleta é **cinza neutro e preto**, com **um único acento**: o verde-limão
`--lime`.

O limão é pontuação, não tinta. Ele marca a ação principal, o dado que importa
e nada mais. **Se aparecer em mais de dois elementos por tela, está demais.**

Cuidado herdado da marca: os cinzas do manual antigo (`#e6e9e5`, `#14150f`) têm
viés esverdeado. Em tela isso suja o branco e briga com o limão. Use os cinzas
de `tokens.css`, que são neutros de verdade.

### Tipografia

DM Sans em tudo. Três pesos, com papéis fixos:

| Peso | Onde |
|---|---|
| 500 | corpo de texto, descrição, legenda |
| 700 | rótulo, nome, item de lista, botão |
| 800 | título, número em destaque, etiqueta em caixa alta |

Títulos levam espacejamento negativo (`-.02em` a `-.035em`) — quanto maior a
fonte, mais fechado. Etiquetas em caixa alta levam positivo (`.1em` a `.2em`).
Sem isso o texto parece de rascunho.

Escala em uso: 9,5 / 10,5 / 11,5 / 12 / 12,5 / 13 / 13,5 / 14 / 14,5 / 16 / 21 px
e daí títulos com `clamp()`. Não invente tamanhos intermediários.

### Raio de canto

O raio comunica hierarquia. Quanto maior a superfície, maior o canto:

| Raio | Onde |
|---|---|
| `999px` | pílula, etiqueta, avatar |
| 48px | cartão da página inteira |
| 32px | bloco de seção |
| 22px | painel dentro de um card |
| 14px | tile, item de lista |
| 8-10px | botão, campo |

**Nunca arredonde um canto só.** Se usar `border-left` de destaque, o raio vai
a zero. Meio-arredondado sempre parece defeito.

### Movimento

Uma curva em tudo: `--ease`. Transições entre 0,22s e 0,35s.

---

## 2. Composição

### Estrutura da página

Barra flutuante recuada `--nav-inset` das laterais, arredondada só embaixo.
Abaixo dela, o conteúdo vive num cartão de `--radius-card` sobre um fundo que
escurece **só na reta final**, chegando ao preto exatamente onde o rodapé começa.

Não escureça cedo: o cinza claro segura a página quase inteira e a virada
acontece no último quinto. Escurecer no meio parte a página em duas.

### Ritmo

Seções alternam respiro (`--section-y`, ou 72px nas mais curtas) e são separadas
por um fio de `--line-soft`.

Cuidado real: esse fio vem de `.section + .section`. **Qualquer elemento entre
duas seções quebra a regra em silêncio** — inclusive uma âncora vazia
`<div id="...">`. Coloque o `id` na própria seção.

### Alinhamento

Cabeçalho de seção alinhado à esquerda, com largura máxima de ~62 caracteres.
Texto de painel centralizado tem no máximo 740px. Linha longa demais cansa.

---

## 3. Componentes

### Botões

Três variantes, e a escolha entre elas não é estética:

**Limão sólido** — a ação principal. Uma por tela.
**Cinza em vidro** — ação secundária.
**Preto em vidro** — ação dentro de card claro.

```css
.btn{
  display:inline-flex; align-items:center; gap:9px;
  height:47px; padding:0 22px;
  border-radius:9px; border:1px solid transparent;
  font-size:14px; font-weight:700;
  transition:transform .22s var(--ease), background .22s var(--ease);
}
.btn:hover{ transform:translateY(-1px) }
```

O botão sobe 1px ao passar o mouse, e a seta dentro dele anda 3px. Movimento
mínimo, mas é o que dá sensação de resposta.

### Vidro

Usado na barra ao rolar, nos botões secundários e nas pílulas.

```css
.vidro{
  background:rgba(255,255,255,.52);
  -webkit-backdrop-filter:blur(16px) saturate(180%) brightness(1.03);
  backdrop-filter:blur(16px) saturate(180%) brightness(1.03);
  border-color:transparent;
  box-shadow:0 12px 30px -12px rgba(20,20,20,.30);
}
```

**Três erros que já cometemos, não repita:**

1. **Nada de aro branco.** Um `inset 0 0 0 1px rgba(255,255,255,...)` parece dar
   espessura ao vidro, mas sobre fundo claro vira contorno duro e entrega o
   truque. O volume vem do desfoque e da sombra solta, só.
2. **Brilho especular também desenha aro.** Um degradê branco na diagonal que
   encoste na borda arredondada redesenha exatamente o mesmo contorno que você
   acabou de tirar do `box-shadow`. Se usar, faça-o morrer antes da borda.
3. **Cor fiel e vidro puxam em direções opostas.** Acima de ~90% de opacidade
   não sobra transparência para o desfoque atravessar — o efeito custa e não
   aparece. Para superfície colorida da marca, use sólido.

Sempre ofereça reserva:

```css
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  .vidro{ background:rgba(255,255,255,.9) }
}
```

### Cards

Fundo `--white`, borda `--line-soft`, e sombra baixa e larga:

```css
box-shadow:0 34px 64px -34px rgba(20,20,20,.45);
```

O deslocamento vertical alto com espalhamento negativo grande é o que faz a
sombra parecer peso, não borrão.

### Cartas empilhadas

Cada card gruda no topo e o seguinte sobe por cima:

```css
.card{ position:sticky }
.card:nth-of-type(1){ top:76px }
.card:nth-of-type(2){ top:88px }
.card:nth-of-type(3){ top:100px }
.card:not(:last-of-type){ padding-bottom:104px }
.card + .card{ margin-top:-60px }
```

Três coisas importam aqui:

- **`position:sticky` morre dentro de qualquer ancestral com `overflow:hidden`.**
  Se não grudar, é isso.
- A margem negativa faz o card seguinte nascer por dentro do anterior. Sem o
  `padding-bottom` extra no card coberto, ela come o conteúdo.
- **Card alto demais tem o rodapé cortado.** Meça: `top` + altura precisa caber
  na janela. Em notebook a área útil é ~713px.

### Trilhos rolantes

Para logotipos e depoimentos:

```css
.trilho{
  overflow:hidden;
  mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);
}
.trilho__track{
  display:flex; gap:18px; width:max-content;
  animation:desliza 64s linear infinite;
}
@keyframes desliza{ to{ transform:translateX(-50%) } }
```

O conteúdo é **duplicado no HTML** — é isso que faz o ciclo fechar sem emenda,
já que a animação anda exatamente metade.

Não pause no passar do mouse em trilho decorativo; pause só onde há texto para
ler.

---

## 4. Desempenho — regras duras

Estas vieram de erro real, com medição antes e depois.

**Fundo é imagem, nunca cálculo por quadro.** Um fundo desenhado por shader
recalcula 2,8 milhões de pixels 60 vezes por segundo numa janela comum, e 8,3
milhões num monitor grande. A rolagem trava enquanto ele está visível. Uma foto
custa zero por quadro e ainda fica melhor.

**Movimento é `transform`, nunca posição.** `transform` roda no compositor e não
dispara recálculo de layout. Para deriva lateral de fundo: deixe a imagem ~20%
mais larga que a caixa e anime `translateX` dentro dessa sobra.

**`backdrop-filter` é barato em área pequena.** Catorze elementos com vidro na
página somam 109 mil pixels — 25 vezes menos que o shader que tiramos. Não tema
usá-lo em botões; pense duas vezes antes de aplicá-lo em algo do tamanho da tela.

**Sempre desligue movimento para quem pediu:**

```css
@media (prefers-reduced-motion: reduce){
  .trilho__track, .fundo-animado{ animation:none }
}
```

---

## 5. Padrão de interface de produto

O site mostra maquetes de painel que **valem como referência para as telas reais
dos produtos**. Reaproveite estes padrões:

**Moldura de janela** — barra superior clara com três pontos, título discreto ao
centro, corpo em `--paper`. Raio de 14px.

**Kanban** — colunas com cabeçalho em caixa alta 11,5px/800, contador à direita,
cartões brancos de raio 11px com nome em 13px/700 e metadado em 12px/500. Cartão
ativo ganha borda `--lime`.

**Conversa** — fiel ao WhatsApp: fundo `#efeae2` com padrão, balão recebido
branco à esquerda, enviado `#d9fdd3` à direita, hora em 11px alinhada ao fim,
cabeçalho com avatar redondo de 32px.

**Tabela de itens** — cabeçalho em caixa alta 10,5px/800 `--muted`, linhas
separadas por `--line-soft`, número alinhado à direita, total em 800.

**Documento gerado** — cartão branco com faixa de cabeçalho, linhas cinza
simulando texto, e o total em destaque. Serve para PDF, proposta e relatório.

Regra geral dessas telas: **densidade alta, contraste baixo, uma cor só de
acento.** É o que faz parecer software de verdade e não maquete.

---

## 6. Imagem

**Fotografia é monocromática neutra.** Qualquer foto que entre no layout passa
por dessaturação. Cor solta briga com o limão.

**Retrato para avatar**: recorte medido, não fixo. Ache o topo da cabeça e corte
logo acima, com o mesmo respiro em todos — fotos diferentes têm enquadramentos
diferentes, e um recorte fixo afunda um rosto e corta outro.

**Logotipo de cliente entra em preto.** Converta usando a distância de cada pixel
até a cor de fundo, não o brilho — assim funciona igual para marca clara sobre
fundo escuro e escura sobre claro.

Duas armadilhas:

- **Formas sobrepostas viram mancha em silhueta.** Se o logotipo tem um símbolo
  colorido sobre outro, mapeie cada cor original para um tom de cinza diferente,
  preservando as relações de claro e escuro. Preto chapado apaga a estrutura.
- **Marca clara dentro de forma sólida** (letra branca dentro de círculo) precisa
  do tratamento invertido, senão a silhueta pega a forma e deixa a letra como
  buraco.

**Dê altura por logotipo, não a mesma para todos.** Um wordmark largo e um
emblema quadrado na mesma altura têm pesos visuais muito diferentes. Calcule a
altura para que todos ocupem largura parecida.

---

## 7. Armadilhas de CSS que já nos custaram tempo

- **`object-position` não faz nada** quando a imagem e a caixa têm a mesma
  proporção — sem corte, não há o que deslocar. Enquadramento nesse caso vem do
  arquivo.
- **`z-index` positivo num fundo pula por cima de camadas sem `z-index`**, mesmo
  que elas venham depois no HTML. Um fundo com `z-index:1` passa na frente do véu
  que deveria cobri-lo.
- **`img{ max-width:100% }` num reset grampeia imagem de fundo** que precisa ser
  maior que a caixa. Use `max-width:none` onde a sobra é intencional.
- **`display:flex` sem `align-items` estica o filho** — botão de largura
  automática vira largura total. Declare `align-items:flex-start`.
- **Elemento entre duas seções mata `.section + .section`**, e o divisor some sem
  aviso.

---

## 8. Como usar este arquivo

Coloque `CLAUDE.md` e `tokens.css` na raiz do projeto. O Claude Code lê o
`CLAUDE.md` sozinho a cada sessão e passa a seguir estas diretrizes.

Ao criar tela nova, o caminho é:

1. Importar `tokens.css`
2. Escolher o componente da seção 3 que mais se aproxima
3. Só inventar quando nenhum servir — e nesse caso, escrever aqui o que foi
   criado, para o próximo aproveitar

Este arquivo é vivo. Padrão que vingar entra aqui; padrão que se provar ruim sai.
