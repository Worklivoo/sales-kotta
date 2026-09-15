/* Login unico: o Sales Kotta nao tem mais tela de login propria em producao.
   Quem chega sem sessao vai para a central (kotta-login), e o Sair daqui
   desloga la tambem. O contrato de volta esta em docs/hub-login-handoff.md. */

export const HUB_LOGIN_URL = (import.meta.env.VITE_HUB_LOGIN_URL as string | undefined) || 'https://kotta.worklivoo.com';

/* Rodando na maquina (npm run dev) continua a tela de login local, para nao
   depender da central publicada durante o desenvolvimento. */
export const usarLoginLocal = () => ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const irParaLoginCentral = () => {
  const caminho = `${window.location.pathname}${window.location.search}`;
  const params = new URLSearchParams({ voltar: 'vendas' });
  if (caminho && caminho !== '/') params.set('caminho', caminho);
  window.location.replace(`${HUB_LOGIN_URL}/?${params.toString()}`);
};

export const sairPelaCentral = () => {
  window.location.replace(`${HUB_LOGIN_URL}/?sair=1`);
};

export const voltarParaProdutos = () => {
  window.location.replace(`${HUB_LOGIN_URL}/`);
};
