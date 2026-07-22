import { APP_MODULES } from '@estetica-os/types'
import type { AppModule, PermissionLevel, ResolvedPermissions } from '@estetica-os/types'

// Re-export para consumidores que importam de '@/lib/permissions'
export type { AppModule, PermissionLevel, ResolvedPermissions }

export const ALL_MODULES: readonly AppModule[] = APP_MODULES

// Rótulos pt-BR de cada módulo (usados na matriz de cargos e afins)
export const MODULE_LABELS: Record<AppModule, string> = {
  agenda:          'Agenda',
  clients:         'Clientes',
  medical_records: 'Prontuário',
  procedures:      'Procedimentos e pacotes',
  stock:           'Estoque',
  financial:       'Financeiro e comissões',
  crm:             'CRM',
  marketing:       'Marketing',
  reports:         'Relatórios e dashboard',
  loyalty:         'Fidelidade',
  team:            'Equipe e usuários',
  settings:        'Configurações',
}

// Descrição curta de cada módulo (ajuda na tela de montagem do cargo)
export const MODULE_HINTS: Partial<Record<AppModule, string>> = {
  agenda:          'Agendamentos, check-in e atendimentos',
  clients:         'Cadastro e ficha de clientes',
  medical_records: 'Anamnese, evolução e fotos clínicas',
  procedures:      'Catálogo de procedimentos e pacotes',
  stock:           'Produtos, movimentações e transferências',
  financial:       'Caixa, transações e comissões',
  crm:             'Leads, funil e conversas',
  marketing:       'Campanhas e notificações',
  reports:         'Indicadores e relatórios da rede',
  loyalty:         'Pontos e pacotes de fidelidade',
  team:            'Membros da equipe e cargos',
  settings:        'Configurações da rede e filiais',
}

// ─── Níveis ──────────────────────────────────────────────────────────────────
const LEVEL_RANK: Record<PermissionLevel, number> = { NONE: 0, VIEW: 1, MANAGE: 2 }

export function hasLevel(level: PermissionLevel | undefined, required: PermissionLevel): boolean {
  return LEVEL_RANK[level ?? 'NONE'] >= LEVEL_RANK[required]
}

export function canView(perms: ResolvedPermissions, module: AppModule): boolean {
  return hasLevel(perms[module], 'VIEW')
}

export function canManage(perms: ResolvedPermissions, module: AppModule): boolean {
  return hasLevel(perms[module], 'MANAGE')
}

export const NO_PERMISSIONS: ResolvedPermissions = Object.fromEntries(
  APP_MODULES.map(m => [m, 'NONE'] as const),
) as ResolvedPermissions

export const ALL_PERMISSIONS: ResolvedPermissions = Object.fromEntries(
  APP_MODULES.map(m => [m, 'MANAGE'] as const),
) as ResolvedPermissions

// Resolve os níveis por módulo a partir das linhas de override do banco (por cargo).
// allAccess = true ⇒ NETWORK_ADMIN (tudo MANAGE). Sem override ⇒ NONE.
export function resolvePermissions(
  overrides: { module: string; level: PermissionLevel }[],
  opts?: { allAccess?: boolean },
): ResolvedPermissions {
  if (opts?.allAccess) return { ...ALL_PERMISSIONS }
  const map = new Map(overrides.map(o => [o.module, o.level]))
  return Object.fromEntries(
    APP_MODULES.map(m => [m, map.get(m) ?? 'NONE'] as const),
  ) as ResolvedPermissions
}

// Rótulo pt-BR de cada nível (para selects/segmented controls)
export const LEVEL_LABELS: Record<PermissionLevel, string> = {
  NONE:   'Sem acesso',
  VIEW:   'Ver',
  MANAGE: 'Gerenciar',
}
