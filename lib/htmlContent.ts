const BLOCKED_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'svg',
  'math',
  'img',
] as const;

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

const FALLBACK_EMPTY_HTML = '<p>Sem conteudo disponivel.</p>';

const normalizeWhitespace = (value: string) =>
  value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sanitizeAnchorHref = (rawHref: string) => {
  const trimmedHref = rawHref.trim();

  if (!trimmedHref) {
    return null;
  }

  if (trimmedHref.startsWith('#')) {
    return null;
  }

  try {
    const resolvedUrl = new URL(trimmedHref, window.location.origin);
    return ALLOWED_PROTOCOLS.has(resolvedUrl.protocol) ? resolvedUrl.toString() : null;
  } catch {
    return null;
  }
};

const stripUnsafeAttributes = (element: Element) => {
  const attributes = Array.from(element.attributes);

  attributes.forEach((attribute) => {
    const attributeName = attribute.name.toLowerCase();

    if (attributeName.startsWith('on') || attributeName === 'style' || attributeName === 'srcdoc') {
      element.removeAttribute(attribute.name);
      return;
    }

    if (element.tagName.toLowerCase() === 'a' && attributeName === 'href') {
      const safeHref = sanitizeAnchorHref(attribute.value);

      if (safeHref) {
        element.setAttribute('href', safeHref);
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noreferrer noopener');
      } else {
        element.removeAttribute(attribute.name);
        element.removeAttribute('target');
        element.removeAttribute('rel');
      }

      return;
    }

    if (!['href', 'target', 'rel'].includes(attributeName)) {
      element.removeAttribute(attribute.name);
    }
  });
};

export const sanitizeHtmlContent = (value: string) => {
  if (!value.trim()) {
    return FALLBACK_EMPTY_HTML;
  }

  if (typeof DOMParser === 'undefined') {
    const escapedValue = escapeHtml(normalizeWhitespace(value));
    return escapedValue ? `<p>${escapedValue.replace(/\n/g, '<br />')}</p>` : FALLBACK_EMPTY_HTML;
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(value, 'text/html');

  BLOCKED_TAGS.forEach((tagName) => {
    document.querySelectorAll(tagName).forEach((node) => node.remove());
  });

  document.body.querySelectorAll('*').forEach((element) => {
    stripUnsafeAttributes(element);
  });

  const sanitizedHtml = document.body.innerHTML.trim();
  return sanitizedHtml || FALLBACK_EMPTY_HTML;
};

export const stripHtmlToText = (value: string) => {
  if (!value.trim()) {
    return 'Sem conteudo disponivel.';
  }

  if (typeof DOMParser === 'undefined') {
    return normalizeWhitespace(
      value
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/<\/?[^>]+>/g, ''),
    );
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|h6)>/gi, '\n'),
    'text/html',
  );

  return normalizeWhitespace(document.body.textContent || '') || 'Sem conteudo disponivel.';
};

export const messageHtmlClassName =
  'overflow-hidden break-words text-sm leading-7 text-gray-600 ' +
  '[&_a]:font-medium [&_a]:text-gray-900 [&_a]:underline [&_a]:underline-offset-4 ' +
  '[&_blockquote]:border-l-2 [&_blockquote]:border-black/10 [&_blockquote]:pl-4 [&_blockquote]:text-gray-500 ' +
  '[&_code]:rounded [&_code]:bg-black/[0.04] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] ' +
  '[&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-gray-900 ' +
  '[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-gray-900 ' +
  '[&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-gray-900 ' +
  '[&_li]:ml-5 [&_li]:list-disc [&_ol]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ul]:space-y-2 ' +
  '[&_p]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-[#FAFAFA] [&_pre]:p-3 ' +
  '[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-black/10 [&_td]:px-3 [&_td]:py-2 ' +
  '[&_th]:border [&_th]:border-black/10 [&_th]:bg-[#FAFAFA] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left';
