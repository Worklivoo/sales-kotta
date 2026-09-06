/* Endereco que o cliente configura como destino do redirecionamento da
 * caixa dele. Tudo cai na caixa unica integracao@worklivoo.com; o que
 * vem depois do "+" e ignorado na entrega mas PRESERVADO no cabecalho
 * To, e e por ele que a triagem descobre de quem e a mensagem.
 *
 * O identificador e o MEMBRO, nao a empresa. Dois motivos, os dois
 * verificados no fluxo Triagem Global (v2):
 *   1. a auto-resposta ao lead sai pelo SMTP do membro resolvido
 *      (canal_email.smtp_email / smtp_senha) - com endereco por empresa,
 *      dois membros dividiriam o mesmo e o resolvedor faz "limit 1",
 *      entao a resposta poderia sair pela caixa da pessoa errada;
 *   2. o atendimento nasce com membro_id, ou seja, com dono - e cairia
 *      para a pessoa errada pelo mesmo motivo.
 * A empresa nao se perde: sales_v2_triagem_resolver_membro devolve
 * empresa_id junto com o membro.
 */
export const CAIXA_INTEGRACAO = 'integracao@worklivoo.com';

export const montarEmailIntegracao = (membroId: string) => {
  const [usuario, dominio] = CAIXA_INTEGRACAO.split('@');
  return `${usuario}+${membroId}@${dominio}`;
};

/* Usado na criacao: o canal_email nasce so com o endereco de integracao.
   O SMTP de envio a pessoa preenche depois, na aba Email. */
export const canalEmailInicial = (membroId: string) => ({
  email_integracao: montarEmailIntegracao(membroId),
});
