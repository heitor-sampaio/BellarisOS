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

export interface JwtClaims {
  tenant_id: string | null
  branch_id: string | null
  role: UserRole
  client_id: string | null
}

export interface TenantContext {
  userId: string          // auth.users.id (Supabase auth UUID)
  internalUserId: string | null  // public.users.id (FK usada em professional_id, created_by, etc.)
  tenantId: string | null
  branchId: string | null
  role: UserRole
  clientId: string | null
  isNetworkAdmin: boolean
  isClient: boolean
}
