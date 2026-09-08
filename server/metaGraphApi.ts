import { HttpError } from './createMemberService.js';

const GRAPH_API_VERSION = 'v21.0';
export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export async function chamarGraphApi(path: string, token: string, init?: RequestInit) {
  const resposta = await fetch(`${GRAPH_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  const corpo = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    const mensagem = corpo?.error?.message || 'Nao foi possivel falar com a API do WhatsApp.';
    throw new HttpError(resposta.status >= 400 && resposta.status < 500 ? 400 : 502, mensagem);
  }

  return corpo;
}
