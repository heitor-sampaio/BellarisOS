import { APP_MODULES, SCOPED_MODULES } from '@estetica-os/types'
import type {
  AppModule, PermissionLevel, PermissionScope, ScopedModule,
  ResolvedPermissions, ResolvedScopes,
} from '@estetica-os/types'

// Re-export para consumidores que importam de '@/lib/permissions'
export type { AppModule, PermissionLevel, PermissionScope, ScopedModule, ResolvedPermissions, ResolvedScopes }

export const ALL_MODULES: readonly AppModule[] = APP_MODULES


export function isScoped(module: AppModule): module is ScopedModule {
  return (SCOPED_MODULES as readonly string[]).includes(module)
}

// Rótulos pt-BR de cada módulo (usados na matriz de cargos e afins)
export const MODULE_LABELS: Record<AppModule, string> = {
  agenda:          'Agenda',
  clients:         'Clientes',
  medical_records: 'Prontuário',
  procedures:      'Procedimentos e pacotes',
  stock:           'Estoque',
  financial:       'Financeiro e comissões',
  cashier:         'Caixa',
  crm:             'CRM',
  marketing:       'Marketing',
  // "Relatórios e dashboard" prometia governar o Dashboard, que nunca é
  // escondido de ninguém. "Fichas e anamnese" soava como a ficha do cliente,
  // que é Prontuário — aqui é só o molde.
  reports:         'Relatórios',
  team:            'Equipe',
  forms:           'Modelos de ficha',
  roles:           'Cargos e permissões',
  settings:        'Configurações da rede',
}

// Descrição curta de cada módulo (ajuda na tela de montagem do cargo)
export const MODULE_HINTS: Partial<Record<AppModule, string>> = {
  agenda:          'Agendamentos, check-in e atendimentos',
  clients:         'Cadastro e ficha de clientes',
  medical_records: 'Anamnese, evolução e fotos clínicas',
  procedures:      'Catálogo de procedimentos e pacotes',
  stock:           'Produtos, movimentações e transferências',
  financial:       'Lançamentos, relatórios, estorno e comissões',
  cashier:         'Abrir e fechar o caixa, receber pagamentos',
  crm:             'Leads, funil e conversas',
  marketing:       'Campanhas e notificações',
  reports:         'Indicadores e relatórios da rede',
  team:            'Membros da equipe',
  forms:           'Molde da anamnese e da ficha de atendimento',
  roles:           'Criar cargos e definir o que cada um acessa',
  settings:        'Dados da rede, unidades e integrações',
}

/** Rótulo do escopo, por módulo — o que "só os meus" significa em cada um. */
export const SCOPE_LABELS: Record<ScopedModule, { own: string; all: string }> = {
  agenda:          { own: 'Só a própria agenda',      all: 'Agenda de todos' },
  medical_records: { own: 'Só os próprios pacientes', all: 'Todos os pacientes' },
  financial:       { own: 'Só as próprias comissões', all: 'Financeiro completo' },
  crm:             { own: 'Só os próprios leads',     all: 'Todos os leads' },
}

/**
 * Níveis que cada módulo realmente distingue. Oferecer "Ver" onde não existe
 * nenhum gate de leitura fazia o item aparecer no menu e dar erro no clique;
 * oferecer "Gerenciar" onde não há nada para gerenciar é ruído na tela.
 */
export const MODULE_LEVELS: Record<AppModule, readonly PermissionLevel[]> = {
  agenda:          ['NONE', 'VIEW', 'MANAGE'],
  clients:         ['NONE', 'VIEW', 'MANAGE'],
  medical_records: ['NONE', 'VIEW', 'MANAGE'],
  procedures:      ['NONE', 'VIEW', 'MANAGE'],
  stock:           ['NONE', 'VIEW', 'MANAGE'],
  financial:       ['NONE', 'VIEW', 'MANAGE'],
  cashier:         ['NONE', 'MANAGE'],
  crm:             ['NONE', 'VIEW', 'MANAGE'],
  marketing:       ['NONE', 'VIEW', 'MANAGE'],
  reports:         ['NONE', 'VIEW'],
  team:            ['NONE', 'VIEW', 'MANAGE'],
  forms:           ['NONE', 'MANAGE'],
  roles:           ['NONE', 'MANAGE'],
  settings:        ['NONE', 'MANAGE'],
}

// ─── Níveis ──────────────────────────────────────────────────────────────────
const LEVEL_RANK: Record<PermissionLevel, number> = { NONE: 0, VIEW: 1, MANAGE: 2 }

export function hasLevel(level: PermissionLevel | undefined, required: PermissionLevel): boolean {
  return LEVEL_RANK[level ?? 'NONE'] >= LEVEL_RANK[required]
}


export const NO_PERMISSIONS: ResolvedPermissions = Object.fromEntries(
  APP_MODULES.map(m => [m, 'NONE'] as const),
) as ResolvedPermissions

export const ALL_PERMISSIONS: ResolvedPermissions = Object.fromEntries(
  APP_MODULES.map(m => [m, 'MANAGE'] as const),
) as ResolvedPermissions

/** Escopo padrão: sem restrição. Usado por NETWORK_ADMIN e por módulo sem linha. */
export const ALL_SCOPES: ResolvedScopes = Object.fromEntries(
  APP_MODULES.map(m => [m, 'ALL'] as const),
) as ResolvedScopes

type PermissionRow = { module: string; level: PermissionLevel; scope?: PermissionScope | null }

// Resolve os níveis por módulo a partir das linhas de override do banco (por cargo).
// allAccess = true ⇒ NETWORK_ADMIN (tudo MANAGE). Sem override ⇒ NONE.
export function resolvePermissions(
  overrides: PermissionRow[],
  opts?: { allAccess?: boolean },
): ResolvedPermissions {
  if (opts?.allAccess) return { ...ALL_PERMISSIONS }
  const map = new Map(overrides.map(o => [o.module, o.level]))
  return Object.fromEntries(
    APP_MODULES.map(m => [m, map.get(m) ?? 'NONE'] as const),
  ) as ResolvedPermissions
}

/**
 * Resolve o escopo por módulo. Módulo sem linha, ou não escopável, fica em ALL:
 * o escopo restringe, e restringir por omissão esconderia dado sem o admin ter
 * pedido isso.
 */
export function resolveScopes(
  overrides: PermissionRow[],
  opts?: { allAccess?: boolean },
): ResolvedScopes {
  if (opts?.allAccess) return { ...ALL_SCOPES }
  const map = new Map(overrides.map(o => [o.module, o.scope ?? 'ALL']))
  return Object.fromEntries(
    APP_MODULES.map(m => [m, (isScoped(m) ? map.get(m) : 'ALL') ?? 'ALL'] as const),
  ) as ResolvedScopes
}

// Rótulo pt-BR de cada nível (para selects/segmented controls)
export const LEVEL_LABELS: Record<PermissionLevel, string> = {
  NONE:   'Sem acesso',
  VIEW:   'Ver',
  MANAGE: 'Gerenciar',
}
