const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

export const formatDateTime = (value: string) => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsedDate);
};

export const extractTimeFromDateTime = (value: string) => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsedDate);
};

export const formatDayLabel = (createdAt: string) => {
  const messageDate = new Date(createdAt);

  if (Number.isNaN(messageDate.getTime())) {
    return '';
  }

  const today = startOfDay(new Date());
  const target = startOfDay(messageDate);
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Hoje';
  }

  if (diffDays === 1) {
    return 'Ontem';
  }

  if (diffDays >= 2 && diffDays <= 6) {
    const weekdays = [
      'Domingo',
      'Segunda',
      'Terça',
      'Quarta',
      'Quinta',
      'Sexta',
      'Sábado',
    ];
    return weekdays[messageDate.getDay()];
  }

  const day = String(messageDate.getDate()).padStart(2, '0');
  const month = String(messageDate.getMonth() + 1).padStart(2, '0');
  const year = messageDate.getFullYear();
  return `${day}/${month}/${year}`;
};

export const formatBrazilianPhone = (value: string | null) => {
  if (!value) {
    return 'Contato não identificado';
  }

  const digits = value.replace(/\D/g, '');

  if (digits.length === 0) {
    return 'Contato não identificado';
  }

  if (digits.length === 13 && digits.startsWith('55')) {
    const country = digits.slice(0, 2);
    const area = digits.slice(2, 4);
    const firstPart = digits.slice(4, 9);
    const secondPart = digits.slice(9, 13);
    return `+${country} (${area}) ${firstPart}-${secondPart}`;
  }

  if (digits.length === 12 && digits.startsWith('55')) {
    const country = digits.slice(0, 2);
    const area = digits.slice(2, 4);
    const firstPart = digits.slice(4, 8);
    const secondPart = digits.slice(8, 12);
    return `+${country} (${area}) ${firstPart}-${secondPart}`;
  }

  if (digits.length === 11) {
    const area = digits.slice(0, 2);
    const firstPart = digits.slice(2, 7);
    const secondPart = digits.slice(7, 11);
    return `+55 (${area}) ${firstPart}-${secondPart}`;
  }

  if (digits.length === 10) {
    const area = digits.slice(0, 2);
    const firstPart = digits.slice(2, 6);
    const secondPart = digits.slice(6, 10);
    return `+55 (${area}) ${firstPart}-${secondPart}`;
  }

  return digits.replace(/(\d{2})(\d{1,5})(\d{4})$/, '+$1 ($2) $3');
};

export const isSameDay = (a: string, b: string) => {
  const dateA = new Date(a);
  const dateB = new Date(b);
  if (Number.isNaN(dateA.getTime()) || Number.isNaN(dateB.getTime())) {
    return false;
  }
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
};

export const isImageUrl = (value: string) => {
  const cleaned = value.replace(/\?.*$/, '').toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(cleaned);
};

export const getAttachmentLabel = (value: string) => {
  const withoutQuery = value.split('?')[0];
  const lastSlash = withoutQuery.lastIndexOf('/');
  const rawName = lastSlash >= 0 ? withoutQuery.slice(lastSlash + 1) : withoutQuery;
  const decoded = decodeURIComponent(rawName).replace(/^arquivo_[A-Z0-9]+_\d{8}_\d{6}(?:\([^)]*\))?(_)?/, '$1');
  return decoded || 'Arquivo anexado';
};
