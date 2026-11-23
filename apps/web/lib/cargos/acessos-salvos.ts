import { MODULOS_DO_CARGO } from '@/lib/permissions'
import type { AppModule, PermissionLevel } from '@estetica-os/types'

/** O que um cargo tem em um módulo (a linha de `role_permissions`): o nível. */
export interface AcessoDoModulo {
  level: PermissionLevel
}
export type AcessosDoCargo = Partial<Record<AppModule, AcessoDoModulo>>

/**
 * Os acessos que a matriz acabou de salvar, no formato da lista (A17 da 21ª
 * simulação; princípio 3): o cartão do cargo recém-salvo dizia "Nenhum acesso
 * ainda" até recarregar, porque lia só o que veio do servidor.
 */
export function acessosDoSalvo(levels: Partial<Record<AppModule, PermissionLevel>>): AcessosDoCargo {
  const salvo: AcessosDoCargo = {}
  for (const [m, level] of Object.entries(levels) as [AppModule, PermissionLevel][]) salvo[m] = { level }
  return salvo
}

/** O resumo de uma linha do cartão: quantas áreas o cargo abre. */
export function resumoDoCargo(perms: AcessosDoCargo): string {
  const open = MODULOS_DO_CARGO.filter(m => (perms[m]?.level ?? 'NONE') !== 'NONE')
  if (open.length === 0) return 'Nenhum acesso ainda'
  return `${open.length} ${open.length === 1 ? 'área' : 'áreas'}`
}
