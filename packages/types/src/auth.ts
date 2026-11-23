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
  // O Atendimento (o Heitor, 2026-11-18: "Agenda é agenda e atendimento é
  // atendimento. Só inicia e conclui atendimento quem tem gerenciar no
  // atendimento."): Ver abre a tela do atendimento; Gerenciar inicia e conclui.
  // O clínico dentro dele (evolução, fotos, ficha de saúde) segue do Prontuário.
  'atendimento',
  'clients',
  // Fidelidade: saldo, extrato, ajuste e resgates do cliente. Configurar o
  // programa (e o catálogo) é Configurações — decisão de rede, não de balcão.
  'loyalty',
  'medical_records',
  // Termos e contratos do cliente: colher a assinatura, emitir, dispensar.
  // Não é Prontuário de propósito — a recepção colhe o contrato sem abrir a
  // parte clínica, e o documento não carrega dado clínico. Os MODELOS são
  // autoria de rede e ficam em 'forms'.
  'documents',
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
  // A automação mexe em agenda, CRM e financeiro: espremê-la em 'marketing'
  // faria quem cuida de anúncio herdar o poder de mover oportunidade.
  'automations',
  // O Copilot (2026-10-08): o plano diz se a REDE o tem; o cargo, quem o usa —
  // Ver só consulta, Gerenciar também prepara gravações (cada uma ainda exige
  // o módulo dela).
  'copilot',
  // A Auditoria (CF3c, 2026-11-14): ler o que mudou, quem mudou e quando. Só
  // Ver — o registro não se edita. Nasce só no Admin da rede.
  'audit',
] as const

export type AppModule = typeof APP_MODULES[number]

export type PermissionLevel = 'NONE' | 'VIEW' | 'MANAGE'

// Sem o "só os meus" (o Heitor, 2026-11-23): o cargo tem dois eixos, módulo ×
// nível e a abrangência da pessoa. O que é da pessoa (a Minha agenda, as
// Minhas comissões) é uma vista pessoal (`vistaPessoal`, apps/web/lib/auth.ts).

export type ResolvedPermissions = Record<AppModule, PermissionLevel>

/**
 * Abas de Relatórios, liberadas uma a uma por cargo.
 *
 * `reports` sozinho é grosso demais: o time comercial precisa do funil sem ver
 * o faturamento da rede. A lista vive aqui porque três lugares dependem dela —
 * o contexto de autorização, a tela de cargos e a própria tela de relatórios.
 *
 * A ordem é a das abas na tela.
 */
export const REPORT_TABS = [
  'overview',
  'financeiro',
  'vendas',
  'agenda',
  'clientes',
  'procedimentos',
  'profissionais',
  'estoque',
  'comercial',
] as const

export type ReportTab = typeof REPORT_TABS[number]

export interface JwtClaims {
  tenant_id: string | null
  branch_id: string | null
  role: UserRole
  role_id: string | null     // tenant_roles.id — identidade do cargo dinâmico
  client_id: string | null
}

/**
 * O que o PLANO da rede inclui (o retrato; o catálogo e as regras moram em
 * packages/nucleo/src/lib/planos/recursos.ts). null = rede sem plano = tudo.
 */
export interface RecursosNoContexto {
  funcionalidades: readonly string[]
  limites: { unidades: number | null; membros: number | null; whatsapp: number | null }
  /** Cotas mensais (o Copilot: tokens por mês; null = sem limite). */
  cotas?: { copilot: number | null }
}

export interface TenantContext {
  userId: string          // auth.users.id (Supabase auth UUID)
  internalUserId: string | null  // public.users.id (FK usada em professional_id, created_by, etc.)
  userName: string        // nome do usuário (users.name) — vazio para CLIENT
  roleLabel: string       // rótulo do cargo (tenant_roles.label) — vazio para CLIENT
  tenantId: string | null
  /**
   * A unidade em que a pessoa ESTÁ (EQ1a, 2026-11-14): a do endereço, quando
   * é uma das dela; senão a principal. Nulo só para quem tem "A rede inteira"
   * — `branchId !== null` continua querendo dizer "não é da rede" (H7, EQ1b).
   */
  branchId: string | null
  /**
   * As unidades da pessoa, a principal primeiro (`users.branch_id` +
   * `users.outras_unidades`); null = "A rede inteira". É o que
   * `alcancaUnidade` confere. Ausente num contexto montado à mão (o de antes):
   * vale `branchId` (nulo = rede; senão, só ela).
   */
  unidades?: string[] | null
  role: UserRole
  roleId: string | null          // tenant_roles.id do cargo do usuário
  clientId: string | null
  permissions: ResolvedPermissions  // nível resolvido por módulo
  reportTabs: ReportTab[]           // abas de Relatórios liberadas para o cargo
  providesServices: boolean         // atende clientes (profissional) em ALGUMA unidade
  /**
   * As unidades em que atende (o checklist do "Atende", decisão 2 do Heitor
   * sobre a 8ª simulação). Não é abrangência, e cabe nela: o "Atende" só vale
   * nas unidades da pessoa (o Heitor, 2026-11-23).
   */
  atendeEm?: string[]
  /** Tem comissão de venda: as Minhas comissões abrem para ela, mesmo sem atender (`vistaPessoal`). */
  comissaoDeVenda?: boolean
  isNetworkAdmin: boolean
  isClient: boolean
  /**
   * O plano da rede (o retrato). Os módulos fora dele já saíram de
   * `permissions`; o que é PARTE de um módulo (pacotes, portal…) se confere
   * com `temRecurso(ctx, …)`. null = sem plano = tudo liberado.
   */
  plano?: RecursosNoContexto | null
  /**
   * Esta sessão é do SUPORTE da plataforma entrando na conta do membro
   * (apps/web/lib/suporte). Nula numa sessão normal. Com ela, o nome que
   * fica nos registros é "Ana (via suporte: Heitor)", o dado clínico fica de
   * fora (salvo autorização que o inclua) e nada sai para o paciente.
   */
  suporte?: SuporteNoContexto | null
}

export interface SuporteNoContexto {
  sessaoId:      string
  atendenteNome: string
  /** O nome do membro, sem a marca do suporte (a topbar mostra este). */
  nomeDoMembro:  string
  incluiClinico: boolean
  /** ISO. */
  expiraEm:      string
  chamadoId:     string | null
}
