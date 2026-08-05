import React from 'react';
import {
  CheckCheck,
  FileText,
  Hash,
  ImageIcon,
  Paperclip,
  Zap,
} from 'lucide-react';
import { messageHtmlClassName } from '../../lib/htmlContent';
import { formatDayLabel, getAttachmentLabel, isImageUrl } from './utils';
import type { WhatsAppChatViewProps } from './types';

const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const WhatsAppChatView: React.FC<WhatsAppChatViewProps> = ({
  header,
  messages,
  renderActionsForMessageId,
  highlightedMessageId,
}) => {
  const avatarInitials = header.phoneFormatted
    .replace(/\D/g, '')
    .slice(-2)
    .toUpperCase() || 'CL';

  return (
    <section className="min-h-0 flex flex-col bg-[#efeae2]">
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <header className="flex items-center justify-between border-b border-black/5 bg-[#f0f2f5] px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EBF57D] text-sm font-semibold text-gray-900 shadow-sm">
                {avatarInitials}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#f0f2f5] bg-[#EBF57D]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-[15px] font-semibold text-gray-900">
                  {header.phoneFormatted}
                </p>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 ring-1 ring-black/5">
                  <Hash size={10} />
                  {header.ticketLabel.replace(/^#/, '')}
                </span>
                {header.categoryKey === 'COTACAO' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#EBF57D] px-2 py-0.5 text-[10px] font-semibold text-gray-900">
                    <Zap size={10} />
                    {header.category}
                  </span>
                ) : null}
                {header.customerName ? (
                  <p className="text-[12px] text-gray-500">
                    {header.customerName}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          <div className="flex w-full flex-col gap-2">
            {messages.length > 0 ? (
              messages.map((message, index) => {
                const previousMessage = messages[index - 1] ?? null;
                const currentDayKey = startOfDay(new Date(message.createdAt)).toISOString();
                const previousDayKey = previousMessage
                  ? startOfDay(new Date(previousMessage.createdAt)).toISOString()
                  : null;
                const shouldShowDaySeparator = index === 0 || currentDayKey !== previousDayKey;
                const dayLabel = shouldShowDaySeparator ? formatDayLabel(message.createdAt) : '';
                const isIncoming = message.author === 'CLIENTE';
                const isIABubble = message.author === 'IA';
                const isHighlighted = highlightedMessageId && message.id === highlightedMessageId;
                const bubbleBackground = isIncoming
                  ? 'bg-white'
                  : isIABubble
                    ? 'bg-[#EBF57D]'
                    : 'bg-[#d9fdd3]';
                const bubbleAlign = isIncoming ? 'mr-auto' : 'ml-auto';
                const tailColor = isIncoming
                  ? 'before:border-r-white'
                  : isIABubble
                    ? 'before:border-l-[#EBF57D]'
                    : 'before:border-l-[#d9fdd3]';
                const tailClass = isIncoming
                  ? `before:absolute before:left-[-6px] before:top-2 before:h-0 before:w-0 before:border-y-[6px] before:border-r-[6px] before:border-y-transparent ${tailColor}`
                  : `before:absolute before:right-[-6px] before:top-2 before:h-0 before:w-0 before:border-y-[6px] before:border-l-[6px] before:border-y-transparent ${tailColor}`;
                const messageTime = message.time.split(' ').pop() || message.time;
                const actions = renderActionsForMessageId
                  ? renderActionsForMessageId(message.id)
                  : null;

                return (
                  <React.Fragment key={message.id}>
                    {shouldShowDaySeparator && dayLabel ? (
                      <div className="my-2 flex justify-center">
                        <span className="rounded-xl bg-white/90 px-3 py-1 text-[11px] font-medium text-gray-500 shadow-sm ring-1 ring-black/5 backdrop-blur">
                          {dayLabel}
                        </span>
                      </div>
                    ) : null}
                    <div
                      className={`relative flex max-w-[82%] flex-col ${bubbleAlign} ${isHighlighted ? 'animate-pulse' : ''}`}
                    >
                      {message.author !== 'CLIENTE' ? (
                        isIABubble ? (
                          <span className="mb-1 mr-1 inline-flex w-fit items-center gap-1 self-end rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#EBF57D]">
                            <Zap size={10} />
                            IA
                          </span>
                        ) : (
                          <span className="mb-1 mr-1 self-end text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                            Você
                          </span>
                        )
                      ) : null}

                      <div
                        className={`relative ${bubbleBackground} rounded-2xl px-3 py-2 shadow-[0_1px_1px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] ${tailClass} ${isHighlighted ? 'ring-2 ring-[#EBF57D] shadow-[0_0_0_3px_rgba(235,245,125,0.3)]' : ''}`}
                      >
                        <div className="space-y-2 text-left">
                          <div
                            className={`text-[14px] leading-[20px] text-gray-900 ${messageHtmlClassName}`}
                            dangerouslySetInnerHTML={{ __html: message.contentHtml }}
                          />
                        </div>

                        {message.attachments.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {message.attachments.map((attachment) => {
                              const label = getAttachmentLabel(attachment.url);
                              const isImage = isImageUrl(attachment.url);
                              return isImage ? (
                                <a
                                  key={attachment.url}
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block overflow-hidden rounded-xl ring-1 ring-black/[0.08]"
                                >
                                  <img
                                    src={attachment.url}
                                    alt={label}
                                    className="max-h-72 w-full object-cover"
                                  />
                                </a>
                              ) : (
                                <a
                                  key={attachment.url}
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-3 rounded-xl bg-black/[0.03] px-3 py-2 text-[12px] font-medium text-gray-700 transition-colors hover:bg-black/[0.06]"
                                >
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-500 ring-1 ring-black/[0.05]">
                                    {/\.(pdf)$/i.test(label) ? (
                                      <FileText size={16} />
                                    ) : (
                                      <ImageIcon size={16} />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[13px] text-gray-800">
                                      {label}
                                    </p>
                                    <p className="text-[11px] text-gray-500">Documento</p>
                                  </div>
                                  <Paperclip size={14} className="shrink-0 text-gray-400" />
                                </a>
                              );
                            })}
                          </div>
                        ) : null}

                        {actions ? (
                          <div className="mt-3">{actions}</div>
                        ) : null}

                        <div className="mt-1 flex items-center justify-end gap-1.5 align-baseline text-[10px] text-gray-500">
                          <span className="leading-none">{messageTime}</span>
                          {!isIncoming ? (
                            <CheckCheck size={12} className="text-[#53bdeb]" />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })
            ) : (
              <div className="mx-auto mt-4 max-w-md rounded-2xl bg-white/95 px-6 py-10 text-center shadow-sm ring-1 ring-black/5 backdrop-blur">
                <p className="text-sm font-medium text-gray-400">
                  Nenhuma mensagem vinculada a esta conversa.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhatsAppChatView;
