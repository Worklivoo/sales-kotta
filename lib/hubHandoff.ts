import { supabase } from './supabase';

const ACCESS_TOKEN_PARAM = 'hub_access_token';
const REFRESH_TOKEN_PARAM = 'hub_refresh_token';

export interface HubHandoffResult {
  handled: boolean;
  error?: string;
}

function stripHandoffFromUrl() {
  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}

// O hub (app.worklivoo.com) entrega a sessao via fragmento (#...) em vez de
// query string: fragmentos nao sao enviados ao servidor nem aparecem em
// Referer/logs, entao os tokens nao vazam no caminho ate aqui.
export async function consumeHubHandoff(): Promise<HubHandoffResult> {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;

  if (!hash) {
    return { handled: false };
  }

  const params = new URLSearchParams(hash);
  const accessToken = params.get(ACCESS_TOKEN_PARAM);
  const refreshToken = params.get(REFRESH_TOKEN_PARAM);

  if (!accessToken || !refreshToken) {
    return { handled: false };
  }

  try {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      return { handled: true, error: error.message };
    }

    return { handled: true };
  } catch (err: any) {
    return { handled: true, error: err?.message || 'Falha ao processar login vindo do hub.' };
  } finally {
    stripHandoffFromUrl();
  }
}
