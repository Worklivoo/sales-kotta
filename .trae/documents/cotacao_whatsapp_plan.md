# Plano de Implementação — Layout Dinâmico (WhatsApp / Email) na Página de Cotação

**Data:** 2026-08-05
**Objetivo:** Quando o usuário abre uma cotação, a sessão "Atendimento" (painel direito da página `Cotacao.tsx`) alterna automaticamente de layout conforme a coluna `atendimento_origem` do `sales_atendimento`:
  - **WhatsApp** → renderiza em formato de bolhas (igual a página `/whatsapp`), usando um componente compartilhado
  - **Email / NULL** → mantém o formato atual de cards expandíveis

## 1. Conclusão da pesquisa no repositório

**Entradas / fontes de dados atuais:**

| Origem | Arquivo | O que usa |
|---|---|---|
| **Página Cotação** | [Cotacao.tsx](file:///c:/Users/rodri/Documents/WORKLIVOO/SALES%20KOTTA/pages/Cotacao.tsx#L436-L443) | `sales_atendimento` (assunto, status, numero_ticket, cliente_id, membro_id) + `sales_mensagens` (origem, conteudo, metadata, anexos) mapeadas em `ConversationItem[]` |
| **Página WhatsApp** | [WhatsApp.tsx](file:///c:/Users/rodri/Documents/WORKLIVOO/SALES%20KOTTA/pages/WhatsApp.tsx) | Mesmas tabelas + `provedor_thread_id`, `atendimento_origem`, `cliente_id` join em `sales_clientes_finais` |
| **Utilitários compartilhados** | [htmlContent.ts](file:///c:/Users/rodri/Documents/WORKLIVOO/SALES%20KOTTA/lib/htmlContent.ts) | `sanitizeHtmlContent`, `stripHtmlToText`, `stripAttachmentAnalysisFromContent`, `messageHtmlClassName` |

**Região que será substituída dinamicamente:**
- Dentro do `<section className="min-h-0">` em [Cotacao.tsx#L956-L1146](file:///c:/Users/rodri/Documents/WORKLIVOO/SALES%20KOTTA/pages/Cotacao.tsx#L956-L1146) → **apenas o bloco da seção "Atendimento"**
- Fora dessa região (header da página + sidebar esquerda de Dados Atendimento / Orçamento) permanece IGUAL para os dois layouts

## 2. Arquivos / módulos a serem criados

| Arquivo | Responsabilidade |
|---|---|
| `components/chat/WhatsAppChatView.tsx` | **Componente compartilhado** → header (avatar EBF57D + telefone + ticket + categoria + cliente), fundo WhatsApp, separadores por dia, bolhas (cliente/IA/Você), anexos. Não tem footer de input. Recebe ações por mensagem via props. |
| `components/chat/types.ts` | Tipos compartilhados: `ChatMessage`, `ChatMessageAuthor`, `ChatAttachment`, `ChatHeaderProps` |
| `components/chat/utils.ts` (opcional, pode ser em `types.ts`) | Helpers: `formatBrazilianPhone`, `formatDayLabel`, `formatDateTime` (movidos ou re-exportados do WhatsApp) |

## 3. Arquivos / módulos a serem editados

### 3.1 `pages/WhatsApp.tsx`
- **Mover** todo o JSX do "painel direito" (header + mensagens) para dentro do novo componente `WhatsAppChatView`
- **Substituir** aquele bloco por `<WhatsAppChatView ...props>`
- **Re-exportar** ou **mover** `formatBrazilianPhone`, `formatDayLabel`, `formatDateTime`, `buildMessageSenderEmail` (para os helpers compartilhados)
- Manter: lista lateral (search/filtros + cards), toda a query/lógica de fetch, state de seleção

### 3.2 `pages/Cotacao.tsx`
- **Adicionar** `atendimento_origem`, `provedor_thread_id` no `SELECT` e na interface `AtendimentoRecord`
- **Carregar** nome do cliente (hoje já tem, via `clientData`) → usa `sales_clientes_finais.nome`
- **Criar** adapter: `ConversationItem[] + metadados → ChatMessage[]` (shape único do componente)
- **Condicional** no lugar do bloco `<section className="min-h-0">`:
  ```
  cotacao?.atendimento_origem === 'WhatsApp'
    ? <WhatsAppChatView ...props renderActionsForMessage={...} />
    : <EmailConversationLayout ...props />   (layout existente, extraído ou inline)
  ```
- **Mover** ações de aprovação de orçamento (Aprovar / Visualizar Orçamento / Aprovação Pendente) para uma função `renderActionsForMessage(messageId)` que é passada ao componente e renderiza um rodapé de ações ABAIXO da última bolha da IA

### 3.3 `lib/htmlContent.ts` (pequeno ajuste se necessário)
- Exportar funções adicionais que estão usadas internamente no chat WhatsApp, caso o componente novo precise delas

## 4. Fases de implementação (ordem recomendada)

### FASE 1 — Extração dos tipos e helpers compartilhados
- Criar `components/chat/types.ts` com `ChatMessageAuthor = 'CLIENTE' | 'IA' | 'HUMANO'`, `ChatMessage`, `ChatAttachment`, `WhatsAppChatViewProps`
- Mover `formatBrazilianPhone`, `formatDayLabel`, `formatDateTime` (e funções auxiliares) de WhatsApp.tsx para `components/chat/utils.ts`
- Importar de volta em WhatsApp.tsx → garante que nenhum comportamento quebrou
- Rodar `npx tsc --noEmit`

### FASE 2 — Criar o componente compartilhado `WhatsAppChatView`
- Copiar o JSX do "painel direito" do WhatsApp para o componente novo
- Props previstas:
  ```
  header: {
    phoneFormatted: string;
    ticketLabel: string;
    category: string;
    customerName?: string;
  }
  messages: ChatMessage[];   // autor, horario, createdAt, contentHtml, attachments
  renderActionsForMessageId?: (messageId: string) => ReactNode;
  ```
- `renderActionsForMessageId` é o ponto de extensão para a página de cotação injetar botões de "Aprovar / Visualizar Orçamento" abaixo da última bolha
- Testar isoladamente no browser (ou rodando TSC): tipagem correta

### FASE 3 — Refatorar a página `WhatsApp.tsx` para consumir o componente
- Remover o código JSX do painel direito que foi movido
- Montar `header` + `ChatMessage[]` a partir do state já existente (`selectedAtendimento`, `orderedMessages`)
- Renderizar `<WhatsAppChatView>` no lugar, sem passar `renderActionsForMessageId` (página WhatsApp não tem ações de cotação)
- Verificar: TSC limpo, aparência visual IDÊNTICA (mesmos estilos, mesmas cores EBF57D na IA, mesmo badge ⚡ IA)

### FASE 4 — Integrar no `Cotacao.tsx`
- **Query:** expandir `sales_atendimento SELECT` com `atendimento_origem`, `provedor_thread_id`
- **Adapter:** converter `orderedConversationItems[]` → `ChatMessage[]` (mapear `origem` → `author`, `corpoHtml` → `contentHtml`, `anexos` → `attachments`, `horario` → `time`, criar `createdAt` usando `sales_mensagens.created_at` do mapeamento atual)
- **Header:**
  - phoneFormatted: `formatBrazilianPhone(atendimento.provedor_thread_id)`
  - ticketLabel: `#${atendimento.numero_ticket}`
  - category: categoria formatada
  - customerName: `clientData?.nome` (se existir)
- **Condicional de layout:**
  ```
  const isWhatsAppLayout = cotacao?.atendimento_origem === 'WhatsApp';
  ```
  - WhatsApp → `<WhatsAppChatView>`
  - Email/NULL → bloco original de cards expandíveis
- **Ações de orçamento:** extrair lógica `shouldShowMessageOrcamentoAction + latestIaMessageId` para a função `renderActionsForMessageId(messageId)` e passar ao componente; o componente renderiza esse retorno logo abaixo do conteúdo da mensagem (ou abaixo da última bolha, conforme a UI requer)

### FASE 5 — Validação final
- `npx tsc --noEmit` sem erros
- Sanity check em 3 cenários:
  1. Atendimento WhatsApp (origem = WhatsApp) → bolhas verdes/amarelas + header estilo WhatsApp + botões aprovação na última mensagem da IA
  2. Atendimento Email (origem = Email) → permanece cards expandíveis do jeito que já estava
  3. Atendimento NULL → mesmo comportamento de Email

## 5. Dependências / considerações
- Reutiliza funções já existentes em `lib/htmlContent.ts` (quebra de linha, remoção de descrição de anexo da IA, sanitização) — **nenhuma dependência nova**
- `lucide-react` já está no projeto (ícones `Zap`, `CheckCheck`, `Paperclip`, `ImageIcon`, `FileText`)
- Os componentes `OrcamentoEditorModal` e os diálogos de confirmação de Aprovar existem **apenas em `Cotacao.tsx`**; o componente compartilhado NÃO sabe sobre eles (mantém separação de responsabilidades por meio de props)

## 6. Tratamento de riscos / pontos de atenção
| Risco | Mitigação |
|---|---|
| Quebra visual na página WhatsApp após extração | Fase 3 valida aparência IDÊNTICA antes de mexer no Cotacao |
| `orderedConversationItems` não tem `created_at` da mensagem (só `horario` string) | Incluir `created_at` no mapeamento já existente de `Cotacao.tsx` para poder usar `formatDayLabel` nos separadores de data |
| NULL/Email renderizando layout errado | Condicional explícito === 'WhatsApp', default cai no layout Email existente |
| Duplicada lógica de formatação de datas/telefone | Tudo fica centralizado em `components/chat/utils.ts` (WRU — write once, use everywhere) |
