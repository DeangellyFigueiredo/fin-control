/**
 * O que o app guarda no navegador, e de quem é cada coisa.
 *
 * Duas naturezas bem diferentes convivem no `localStorage`, e confundi-las
 * já causou um vazamento: o rascunho do passo a passo ficava numa chave só,
 * então quem saísse no meio do cadastro deixava o apelido, o saldo e as
 * contas para o PRÓXIMO usuário daquele navegador.
 *
 *   - **Preferência do aparelho** (tema, esconder valores): é de quem está na
 *     frente da tela, não de uma conta. Sobrevive a trocar de usuário, e deve
 *     mesmo sobreviver.
 *   - **Dado de usuário** (rascunho, "já perguntei hoje"): pertence a uma
 *     conta. Tem que sumir quando alguém sai.
 */

/** Preferências do aparelho — ninguém apaga estas ao sair. */
export const CHAVE_TEMA = 'fincontrol:theme';
export const CHAVE_ESCONDER = 'fincontrol:hide-values';

/** Dados de usuário, apagados no logout. */
export const PREFIXO_RASCUNHO = 'fincontrol:onboarding-draft';
export const CHAVE_PENDENCIAS = 'fincontrol:pendencias-vistas';

/** O rascunho tem dono: o de um usuário nunca abre para outro. */
export const chaveDoRascunho = (userId) => `${PREFIXO_RASCUNHO}:${userId || 'anonimo'}`;

/**
 * Apaga o que pertence a uma conta, preservando as preferências do aparelho.
 *
 * Chamado ao sair. Varre por prefixo em vez de apagar uma lista fixa para que
 * rascunhos de outros usuários, deixados antes desta limpeza existir, também
 * saiam.
 */
export function limparDadosDoUsuario() {
  try {
    for (const chave of Object.keys(localStorage)) {
      if (chave.startsWith(PREFIXO_RASCUNHO) || chave === CHAVE_PENDENCIAS) {
        localStorage.removeItem(chave);
      }
    }
  } catch {
    /* modo privado ou armazenamento bloqueado: não há o que limpar */
  }
}
