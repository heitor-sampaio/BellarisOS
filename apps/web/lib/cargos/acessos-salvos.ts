import { MODULOS_DO_CARGO, isScoped } from '@/lib/permissions'
import type { AppModule, PermissionLevel, PermissionScope } from '@estetica-os/types'

/** O que um cargo tem em um módulo (a linha de `role_permissions`). */
export interface AcessoDoModulo {
  level: PermissionLevel
  scope: PermissionScope
}
export type AcessosDoCargo = Partial<Record<AppModule, AcessoDoModulo>>

/**
 * Os acessos que a matriz acabou de salvar, no formato da lista (A17 da 21ª
 * simulação; princípio 3): o cartão do cargo recém-salvo dizia "Nenhum acesso
 * ainda" até recarregar, porque lia só o que veio do servidor. O escopo sem
 * escolha (módulo desligado) fica o que estava — é o que o servidor guarda (D6).
 */
export function acessosDoSalvo(
  levels: Partial<Record<AppModule, PermissionLevel>>,
  scopes: Partial<Record<AppModule, PermissionScope | null>>,
  anteriores: AcessosDoCargo,
): AcessosDoCargo {
  const salvo: AcessosDoCargo = {}
  for (const [m, level] of Object.entries(levels) as [AppModule, PermissionLevel][]) {
    salvo[m] = { level, scope: scopes[m] ?? anteriores[m]?.scope ?? 'ALL' }
  }
  return salvo
}

/** O resumo de uma linha do cartão: quantas áreas o cargo abre e quantas ficam restritas. */
export function resumoDoCargo(perms: AcessosDoCargo): string {
  const open = MODULOS_DO_CARGO.filter(m => (perms[m]?.level ?? 'NONE') !== 'NONE')
  if (open.length === 0) return 'Nenhum acesso ainda'
  // A8 da 7ª simulação: em Relatórios o escopo é "só a unidade", não "os
  // próprios registros" (CLAUDE.md §11) — o resumo dizia "2 só os próprios".
  const own = open.filter(m => m !== 'reports' && isScoped(m) && perms[m]?.scope === 'OWN').length
  const relatoriosDaUnidade = open.includes('reports') && perms.reports?.scope === 'OWN'
  const areas = `${open.length} ${open.length === 1 ? 'área' : 'áreas'}`
  return [areas, own > 0 ? `${own} só os próprios` : null, relatoriosDaUnidade ? 'Relatórios uma unidade por vez' : null]
    .filter(Boolean).join(' · ')
}
