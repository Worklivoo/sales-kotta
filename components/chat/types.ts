import type { ReactNode } from 'react';

export type ChatMessageAuthor = 'CLIENTE' | 'IA' | 'HUMANO';

export interface ChatAttachment {
  url: string;
}

export interface ChatMessage {
  id: string;
  author: ChatMessageAuthor;
  time: string;
  createdAt: string;
  contentHtml: string;
  attachments: ChatAttachment[];
}

export interface WhatsAppChatHeader {
  phoneFormatted: string;
  ticketLabel: string;
  category: string;
  categoryKey?: string;
  customerName?: string;
}

export interface WhatsAppChatViewProps {
  header: WhatsAppChatHeader;
  messages: ChatMessage[];
  renderActionsForMessageId?: (messageId: string) => ReactNode;
  highlightedMessageId?: string;
}
