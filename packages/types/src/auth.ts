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
  'crm',
  'marketing',
  'reports',
  'loyalty',
  'team',
  'settings',
] as const

export type AppModule = typeof APP_MODULES[number]

export type PermissionLevel = 'NONE' | 'VIEW' | 'MANAGE'

export type ResolvedPermissions = Record<AppModule, PermissionLevel>

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
  providesServices: boolean         // atende clientes (profissional)
  isNetworkAdmin: boolean
  isClient: boolean
}
