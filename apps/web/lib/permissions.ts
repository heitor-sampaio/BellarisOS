export type AppModule = 'agenda' | 'clients' | 'procedures' | 'stock' | 'financial' | 'settings'
export type ConfigurableRole = 'BRANCH_ADMIN' | 'RECEPTIONIST' | 'PROFESSIONAL' | 'FINANCIAL'

export const MODULE_LABELS: Record<AppModule, string> = {
  agenda:      'Agenda',
  clients:     'Clientes',
  procedures:  'Procedimentos',
  stock:       'Estoque',
  financial:   'Financeiro',
  settings:    'Configurações',
}

export const ALL_MODULES: AppModule[] = ['agenda', 'clients', 'procedures', 'stock', 'financial', 'settings']

// Roles que nunca aparecem na matriz de configuração (atuam em nível de rede)
export const HIDDEN_ROLES = new Set(['NETWORK_ADMIN', 'FINANCIAL', 'MARKETING', 'CLIENT', 'NAO_DEFINIDO'])

export interface ModulePermission { view: boolean; write: boolean }
export type ResolvedPermissions = Record<AppModule, ModulePermission>

export interface MatrixRole {
  id:         string
  key:        string
  label:      string
  is_system:  boolean
  permissions: ResolvedPermissions
}

// ─── Defaults dos cargos de sistema ─────────────────────────────
const DEFAULT_VIEW: Record<string, Record<AppModule, boolean>> = {
  BRANCH_ADMIN: { agenda: true,  clients: true,  procedures: true,  stock: true,  financial: true,  settings: true  },
  RECEPTIONIST: { agenda: true,  clients: true,  procedures: true,  stock: true,  financial: true,  settings: false },
  PROFESSIONAL: { agenda: true,  clients: true,  procedures: true,  stock: true,  financial: false, settings: false },
  FINANCIAL:    { agenda: false, clients: false, procedures: false, stock: true,  financial: true,  settings: false },
}

const DEFAULT_WRITE: Record<string, Record<AppModule, boolean>> = {
  BRANCH_ADMIN: { agenda: true,  clients: true,  procedures: true,  stock: true,  financial: true,  settings: true  },
  RECEPTIONIST: { agenda: true,  clients: true,  procedures: false, stock: false, financial: false, settings: false },
  PROFESSIONAL: { agenda: false, clients: false, procedures: false, stock: false, financial: false, settings: false },
  FINANCIAL:    { agenda: false, clients: false, procedures: false, stock: false, financial: true,  settings: false },
}

// Mescla defaults com overrides do banco; cargos desconhecidos = tudo false
export function resolvePermissions(
  roleKey: string,
  overrides: { module: string; can_view: boolean; can_write: boolean }[],
): ResolvedPermissions {
  if (roleKey === 'NETWORK_ADMIN') {
    return Object.fromEntries(ALL_MODULES.map(m => [m, { view: true, write: true }])) as ResolvedPermissions
  }

  const defView  = DEFAULT_VIEW[roleKey]  ?? Object.fromEntries(ALL_MODULES.map(m => [m, false]))
  const defWrite = DEFAULT_WRITE[roleKey] ?? Object.fromEntries(ALL_MODULES.map(m => [m, false]))

  const overrideMap = Object.fromEntries(
    overrides.map(o => [o.module, { can_view: o.can_view, can_write: o.can_write }])
  )

  return Object.fromEntries(
    ALL_MODULES.map(m => {
      const ov    = overrideMap[m]
      const write = ov ? ov.can_write : (defWrite as Record<string, boolean>)[m] ?? false
      const view  = ov ? ov.can_view  : (defView  as Record<string, boolean>)[m] ?? false
      return [m, { view: view || write, write }]
    })
  ) as ResolvedPermissions
}

// Monta a matriz completa para a página de settings (cargos dinâmicos)
export function buildFullMatrix(
  roles: { id: string; key: string; label: string; is_system: boolean }[],
  overrides: { role: string; module: string; can_view: boolean; can_write: boolean }[],
): MatrixRole[] {
  return roles.map(role => ({
    ...role,
    permissions: resolvePermissions(role.key, overrides.filter(o => o.role === role.key)),
  }))
}
