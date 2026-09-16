/* A API roda sempre na Vercel, mesmo quando o front e publicado em outro
   lugar (ex: subdominio no cPanel/Hostgator, sem suporte a Serverless
   Functions). Por isso as chamadas usam sempre essa URL absoluta, em vez
   de caminho relativo - funciona tanto rodando na propria Vercel quanto
   em qualquer outro host estatico. */
export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'https://sales-kotta.vercel.app';

export const apiUrl = (path: string) => `${API_BASE_URL}${path}`;
