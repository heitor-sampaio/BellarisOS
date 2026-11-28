/**
 * A configuração que vale para a REDE TODA só se grava pela Admin da rede — o
 * Heitor, 18/11, na auditoria das regras (pergunta 8): "só pela conta admin".
 * Até ali (H7 da 5ª simulação, 2026-11-01: "gerente de uma unidade só mexe no
 * que é da unidade") bastava ter "A rede inteira" com o módulo em Gerenciar.
 *
 * A trava lê o CARGO de sistema gravado (`ctx.isNetworkAdmin`: o membro em
 * cache com `tenant_roles.key = 'NETWORK_ADMIN'` e `is_system`), nunca a claim
 * `role` do token nem o rótulo do cargo (C58, F70). Tags, funis e etapas,
 * motivos, origens, cargos, fichas, modelos de documento, integrações,
 * automações, campanhas, templates, as Importações, os dados da rede e a
 * comissão do procedimento.
 *
 * Fica com a PERMISSÃO (sem precisar do cargo): a aba Unidade (dados, horário,
 * salas), o estoque (o catálogo é de quem tem o Estoque em Gerenciar), a
 * equipe e as respostas rápidas (de cada pessoa). A lista do que ficou em cada
 * lado está em `docs/regras/plataforma.md`.
 *
 * Puro de propósito: a página (o aviso e o botão) e a action (a recusa) leem
 * a mesma regra.
 */

export const CONFIG_DA_REDE = 'Esta configuração é só da Admin da rede.'

type QuemMexe = { isNetworkAdmin: boolean }

/** A Admin da rede (o cargo de sistema) mexe na configuração da rede toda. */
export function mexeNaConfigDaRede(ctx: QuemMexe): boolean {
  return ctx.isNetworkAdmin === true
}

/** A recusa da action que grava configuração da rede toda, ou nulo. */
export function recusaDaConfigDaRede(ctx: QuemMexe): string | null {
  return mexeNaConfigDaRede(ctx) ? null : CONFIG_DA_REDE
}

/**
 * A fala da tela que deixa a recusa INTEIRA (A3 da 40ª simulação; CU-03): na
 * rede de uma unidade, "Admin da rede" vira "Admin" (CG-25), e o aviso que
 * passava pela fala dizia "só da Admin" enquanto o cartão da mesma tela dizia
 * "só da Admin da rede". A frase da recusa é uma só em toda rede (decisão do
 * Claude, 27/11); o resto do texto passa pela fala como sempre.
 */
export function falaQueGuardaARecusa(fala: (texto: string) => string): (texto: string) => string {
  return texto => texto.split(CONFIG_DA_REDE).map(fala).join(CONFIG_DA_REDE)
}

/**
 * A frase do quadro de oportunidades para quem não configura os funis (A18
 * da 18ª simulação): o "Configurar funis" some do quadro dela, e a explicação
 * só existia em Configurações. Nulo para quem configura.
 */
export function avisoDosFunis(ctx: QuemMexe): string | null {
  if (mexeNaConfigDaRede(ctx)) return null
  return 'Funis e etapas são da rede toda: quem muda é a Admin da rede.'
}
