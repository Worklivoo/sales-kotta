import React, { useEffect, useRef } from 'react';
import {
  CheckCheck,
  FileText,
  Hash,
  ImageIcon,
  Paperclip,
  Zap,
} from 'lucide-react';
import { messageHtmlClassName } from '../../lib/htmlContent';
import { chatWallpaperStyle, formatDayLabel, getAttachmentLabel, isImageUrl } from './utils';
import type { WhatsAppChatViewProps } from './types';

const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

/* Rabicho do balao, no mesmo formato do WhatsApp de verdade (nao um
   triangulo de borda CSS, que ficava flutuando solto ao lado do balao em
   vez de nascer dele). Para o lado direito, so espelha a mesma silhueta
   com scaleX(-1) - e por isso o path so existe uma vez. */
const BubbleTail: React.FC<{ side: 'left' | 'right'; colorClassName?: string; colorStyle?: React.CSSProperties }> = ({
  side,
  colorClassName,
  colorStyle,
}) => (
  <svg
    viewBox="0 0 8 13"
    width="8"
    height="13"
    className={`pointer-events-none absolute top-0 ${side === 'left' ? '-left-2' : '-right-2 -scale-x-100'} ${colorClassName || ''}`}
    style={colorStyle}
  >
    <path opacity="0.08" d="M1.533,3.568L8,12.193V0H2.812C1.042,0,0.474,1.156,1.533,3.568z" />
    <path fill="currentColor" d="M1.533,2.568L8,11.193V0H2.812C1.042,0,0.474,1.156,1.533,2.568z" />
  </svg>
);

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

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;

    if (!container) {
      return;
    }

    /* Abrir uma conversa (ou trocar de conversa) tem que mostrar as
       mensagens mais recentes direto, sem o usuario precisar rolar - por
       isso o efeito roda tanto na troca de conversa quanto a cada nova
       mensagem chegando. */
    container.scrollTop = container.scrollHeight;
  }, [header.ticketLabel, header.phoneFormatted, messages.length]);

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col" style={chatWallpaperStyle}>
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <header className="flex items-center justify-between border-b border-line-soft bg-card px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full bg-lime text-[13px] text-ink"
                style={{ fontWeight: 700 }}
              >
                {avatarInitials}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-lime" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-[15px] text-ink" style={{ fontWeight: 700 }}>
                  {header.phoneFormatted}
                </p>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-paper px-2 py-0.5 text-[10px] text-muted"
                  style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                >
                  <Hash size={10} />
                  {header.ticketLabel.replace(/^#/, '')}
                </span>
                {header.categoryKey === 'COTACAO' ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-pill bg-lime px-2 py-0.5 text-[10px] text-ink"
                    style={{ fontWeight: 800 }}
                  >
                    <Zap size={10} />
                    {header.category}
                  </span>
                ) : null}
                {header.customerName ? (
                  <p className="text-[12px] text-muted" style={{ fontWeight: 500 }}>
                    {header.customerName}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
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
                    ? 'bg-lime'
                    : 'bg-[#d9fdd3]';
                const bubbleAlign = isIncoming ? 'mr-auto' : 'ml-auto';
                // o canto do lado do rabicho fica quase reto - e dali que ele "nasce", igual no WhatsApp de verdade
                const bubbleCorners = isIncoming ? 'rounded-tl-[3px] rounded-tr-2xl' : 'rounded-tr-[3px] rounded-tl-2xl';
                const tailColorClassName = isIncoming ? 'text-white' : isIABubble ? 'text-lime' : '';
                const tailColorStyle = !isIncoming && !isIABubble ? { color: '#d9fdd3' } : undefined;
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
                          <span
                            className="mb-1 mr-1 inline-flex w-fit items-center gap-1 self-end rounded-pill bg-ink px-2 py-0.5 text-[10px] text-lime"
                            style={{ fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}
                          >
                            <Zap size={10} />
                            IA
                          </span>
                        ) : (
                          <span
                            className="mb-1 mr-1 self-end text-[10px] text-muted"
                            style={{ fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}
                          >
                            Você
                          </span>
                        )
                      ) : null}

                      <div
                        className={`relative ${bubbleBackground} ${bubbleCorners} rounded-br-2xl rounded-bl-2xl px-3 py-2 shadow-[0_1px_1px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] ${isHighlighted ? 'ring-2 ring-lime shadow-[0_0_0_3px_rgba(235,245,125,0.3)]' : ''}`}
                      >
                        <BubbleTail
                          side={isIncoming ? 'left' : 'right'}
                          colorClassName={tailColorClassName}
                          colorStyle={tailColorStyle}
                        />
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
