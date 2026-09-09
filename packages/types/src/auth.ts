export type UserRole =
  | 'NETWORK_ADMIN'
  | 'BRANCH_ADMIN'
  | 'RECEPTIONIST'
  | 'PROFESSIONAL'
  | 'FINANCIAL'
  | 'MARKETING'
  | 'COMERCIAL'
  | 'GERENTE_COMERCIAL'
  | 'CLIENT'

// ─── Permissões dinâmicas (fonte única de verdade) ──────────────────────────
// Módulos gateáveis do sistema. O nível por módulo governa tanto a UI quanto a
// autorização das Server Actions (via assertPermission).
export const APP_MODULES = [
  'agenda',
  'clients',
  'medical_records',
  'procedures',
  'stock',
  'financial',
  'cashier',
  'crm',
  'marketing',
  'reports',
  'team',
  'forms',
  'roles',
  'settings',
] as const

export type AppModule = typeof APP_MODULES[number]

export type PermissionLevel = 'NONE' | 'VIEW' | 'MANAGE'

/**
 * Alcance do que o cargo enxerga dentro do módulo.
 * OWN = só os registros ligados ao próprio usuário; ALL = todos, dentro da
 * abrangência do membro (que continua vindo de `users.branch_id`).
 */
export type PermissionScope = 'OWN' | 'ALL'

/**
 * Módulos em que o escopo faz diferença. Nos demais o alcance é sempre ALL e a
 * tela de cargos nem mostra o seletor.
 */
export const SCOPED_MODULES = ['agenda', 'medical_records', 'financial', 'crm'] as const
export type ScopedModule = typeof SCOPED_MODULES[number]

export type ResolvedPermissions = Record<AppModule, PermissionLevel>
export type ResolvedScopes      = Record<AppModule, PermissionScope>

export interface JwtClaims {
  tenant_id: string | null
  branch_id: string | null
  role: UserRole
  role_id: string | null     // tenant_roles.id — identidade do cargo dinâmico
  client_id: string | null
}

export interface TenantContext {
  userId: string          // auth.users.id (Supabase auth UUID)
  internalUserId: string | null  // public.users.id (FK usada em professional_id, created_by, etc.)
  userName: string        // nome do usuário (users.name) — vazio para CLIENT
  roleLabel: string       // rótulo do cargo (tenant_roles.label) — vazio para CLIENT
  tenantId: string | null
  branchId: string | null
  role: UserRole
  roleId: string | null          // tenant_roles.id do cargo do usuário
  clientId: string | null
  permissions: ResolvedPermissions  // nível resolvido por módulo
  scopes: ResolvedScopes            // alcance por módulo (OWN = só os próprios)
  providesServices: boolean         // atende clientes (profissional)
  isNetworkAdmin: boolean
  isClient: boolean
}
