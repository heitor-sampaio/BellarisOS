/**
 * A configuração que vale para a CLÍNICA TODA (a rede) só se grava por quem é
 * da rede — H7 da 5ª simulação, decisão do Heitor (2026-11-01): "gerente de
 * uma unidade só mexe no que é da unidade".
 *
 * A gerente de unidade fixa, com os módulos em Gerenciar, gravava tags,
 * funis, cargos, fichas, termos, integrações, automações e campanhas — o que
 * muda para todas as unidades (A6). A trava é da ABRANGÊNCIA do membro
 * (`ctx.branchId`, CLAUDE.md §11), nunca do nome do cargo: o mesmo cargo serve
 * a quem é da rede e a quem é de uma unidade.
 *
 * Fica com a unidade o que é dela: os dados, o horário e as salas da unidade
 * (Configurações → Unidade), o estoque dela, a equipe dela. As importações
 * passaram a ser da rede (C73, F70; H8): a importação escolhe a unidade. A lista do que ficou em cada lado está em `docs/regras/plataforma.md`.
 *
 * Puro de propósito: a página (o aviso e o botão) e a action (a recusa) leem
 * a mesma regra.
 */

export const CONFIG_DA_CLINICA = 'Esta configuração é da clínica toda: quem muda é quem administra a clínica, sem unidade fixa.'

/** Quem é da rede (sem unidade fixa) mexe na configuração da clínica. */
export function mexeNaConfigDaClinica(ctx: { branchId: string | null }): boolean {
  return ctx.branchId === null
}

/** A recusa da action que grava configuração da clínica, ou nulo. */
export function recusaDaConfigDaClinica(ctx: { branchId: string | null }): string | null {
  return mexeNaConfigDaClinica(ctx) ? null : CONFIG_DA_CLINICA
}
