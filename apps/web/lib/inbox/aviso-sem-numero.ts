/**
 * O inbox de quem não tem número de WhatsApp ligado (A1 da 32ª simulação;
 * IN-15 — o Heitor, 2026-11-13: "o resto fica como está"; princípio 7).
 *
 * Com o cargo em "só os números ligados à pessoa" (`tenant_roles.inbox_caixas
 * = 'minhas'`) e nenhum número ligado a ela, `caixasDoAlcance` devolve a lista
 * VAZIA: nenhuma conversa de WhatsApp aparece, só as sem número (Instagram,
 * Messenger). A tela dizia "Nenhuma conversa ainda", sem o porquê.
 *
 * Quem liga a pessoa a um número é quem muda as integrações — configuração da
 * rede toda, só da Admin da rede (CLAUDE.md §11; `atualizarVinculosDoNumero`,
 * com `recusaDaConfigDaRede`).
 *
 * Puro: a página decide pelo alcance, o inbox (no navegador) mostra o texto.
 */

/** A lista de caixas vazia = o cargo vê só as da pessoa, e ela não tem nenhuma. `null` é "todas". */
export function semNumeroLigado(caixas: string[] | null): boolean {
  return Array.isArray(caixas) && caixas.length === 0
}

export const AVISO_SEM_NUMERO_LIGADO =
  'Seu cargo mostra só as conversas dos números de WhatsApp ligados a você, e nenhum está ligado: '
  + 'aqui aparecem só as conversas sem número (Instagram, Messenger). '
  + 'Quem liga uma pessoa a um número é a Admin da rede, em Configurações → Integrações.'
