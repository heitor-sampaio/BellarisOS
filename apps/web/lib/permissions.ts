import { APP_MODULES, REPORT_TABS } from '@estetica-os/types'
import type { AppModule, PermissionLevel, ResolvedPermissions, ReportTab } from '@estetica-os/types'

// Re-export para consumidores que importam de '@/lib/permissions'
export type { AppModule, PermissionLevel, ResolvedPermissions, ReportTab }

export const ALL_MODULES: readonly AppModule[] = APP_MODULES

/**
 * Os módulos que são SÓ da Admin da rede (o cargo de sistema, que tem tudo):
 * não se dão a outro cargo. A Auditoria (o Heitor, 2026-11-16: "Auditoria é
 * só admin"). Ficam fora da matriz da tela de Cargos e do que a action grava;
 * a linha que um cargo ainda tenha gravada não vale (`resolvePermissions`).
 */
export const MODULOS_SO_DA_ADMIN: readonly AppModule[] = ['audit']

/** Os módulos que um cargo recebe na matriz (Configurações → Cargos). */
export const MODULOS_DO_CARGO: readonly AppModule[] = APP_MODULES.filter(m => !MODULOS_SO_DA_ADMIN.includes(m))


// Rótulos pt-BR de cada módulo (usados na matriz de cargos e afins)
export const MODULE_LABELS: Record<AppModule, string> = {
  agenda:          'Agenda',
  atendimento:     'Atendimento',
  clients:         'Clientes',
  loyalty:         'Fidelidade',
  medical_records: 'Prontuário',
  documents:       'Modelos de documento',
  procedures:      'Procedimentos e pacotes',
  stock:           'Estoque',
  financial:       'Financeiro e comissões',
  cashier:         'PDV',
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
  automations:     'Automações',
  copilot:         'Copilot',
  audit:           'Auditoria',
}

// O que cada módulo ABRANGE — ao lado do nome, na tela de Cargos. (O que cada
// NÍVEL libera é outra coisa: `LEVEL_COPY`, no editor.)
export const MODULE_HINTS: Partial<Record<AppModule, string>> = {
  // A Agenda volta a ser agenda (o Heitor, 2026-11-18): agendar, confirmar,
  // chegada, remarcar, cancelar, falta e trocar quem atende.
  agenda:          'Agendamentos, confirmação, chegada e remarcação',
  atendimento:     'A tela do atendimento: iniciar e concluir',
  clients:         'Cadastro e ficha de clientes',
  loyalty:         'Pontos do cliente: saldo, extrato e ajuste',
  medical_records: 'Ficha de saúde, evolução, fotos e anexos clínicos',
  documents:       'Os modelos dos termos, contratos e documentos que a cliente assina',
  procedures:      'Catálogo de procedimentos e pacotes',
  stock:           'Produtos, movimentações e transferências',
  financial:       'Lançamentos, relatórios, estorno e comissões',
  cashier:         'Vender e receber: as comandas, as parcelas e o Fechamento do dia',
  crm:             'Oportunidades, funil e conversas',
  marketing:       'Campanhas e notificações',
  reports:         'Indicadores e relatórios da rede',
  team:            'Membros da equipe',
  forms:           'As fichas de atendimento e a ficha de saúde',
  roles:           'Criar cargos e definir o que cada um acessa',
  settings:        'Dados da rede, unidades e integrações',
  automations:     'Fluxos que reagem sozinhos ao que acontece',
  copilot:         'Consultar o sistema e pedir gravações conversando',
  audit:           'O que mudou no sistema, quem mudou e quando',
}

/**
 * Níveis que cada módulo realmente distingue. Oferecer "Ver" onde não existe
 * nenhum gate de leitura fazia o item aparecer no menu e dar erro no clique;
 * oferecer "Gerenciar" onde não há nada para gerenciar é ruído na tela.
 */
export const MODULE_LEVELS: Record<AppModule, readonly PermissionLevel[]> = {
  agenda:          ['NONE', 'VIEW', 'MANAGE'],
  atendimento:     ['NONE', 'VIEW', 'MANAGE'],
  clients:         ['NONE', 'VIEW', 'MANAGE'],
  loyalty:         ['NONE', 'VIEW', 'MANAGE'],
  medical_records: ['NONE', 'VIEW', 'MANAGE'],
  // Os MODELOS de documento (o Heitor, 2026-11-16): criar, editar, desativar.
  // Não há o que "ver" à parte — os documentos da cliente são de quem vê a cliente.
  documents:       ['NONE', 'MANAGE'],
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
  automations:     ['NONE', 'VIEW', 'MANAGE'],
  copilot:         ['NONE', 'VIEW', 'MANAGE'],
  // Só da Admin da rede (MODULOS_SO_DA_ADMIN): um cargo só a tem em Sem acesso.
  audit:           ['NONE'],
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

type PermissionRow = { module: string; level: PermissionLevel }

// Resolve os níveis por módulo a partir das linhas de override do banco (por cargo).
// allAccess = true ⇒ NETWORK_ADMIN (tudo MANAGE). Sem override ⇒ NONE.
export function resolvePermissions(
  overrides: PermissionRow[],
  opts?: { allAccess?: boolean },
): ResolvedPermissions {
  if (opts?.allAccess) return { ...ALL_PERMISSIONS }
  const map = new Map(overrides.map(o => [o.module, o.level]))
  return Object.fromEntries(
    APP_MODULES.map(m => [m, MODULOS_SO_DA_ADMIN.includes(m) ? 'NONE' : map.get(m) ?? 'NONE'] as const),
  ) as ResolvedPermissions
}

// ─── Abas de Relatórios ──────────────────────────────────────────────────────

export const ALL_REPORT_TABS: readonly ReportTab[] = REPORT_TABS

export const REPORT_TAB_LABELS: Record<ReportTab, string> = {
  overview:      'Visão geral',
  financeiro:    'Financeiro',
  vendas:        'Vendas',
  agenda:        'Agenda',
  clientes:      'Clientes',
  procedimentos: 'Procedimentos',
  profissionais: 'Profissionais',
  estoque:       'Estoque',
  comercial:     'Oportunidades',
}

/** O que cada aba entrega, para quem monta o cargo saber o que está liberando. */
export const REPORT_TAB_HINTS: Record<ReportTab, string> = {
  overview:      'Faturamento, lucro e o resumo do período inteiro.',
  financeiro:    'Receita, despesa, DRE, formas de pagamento e parcelas a vencer.',
  vendas:        'Cada venda do período — procedimento, pacote, pré-pago e plano —, com cliente, profissional e valor.',
  agenda:        'Volume, cancelamentos, faltas e horários mais procurados.',
  clientes:      'Novos, retorno, gasto médio e perfil de quem frequenta.',
  procedimentos: 'Execuções, margem e custo por procedimento.',
  profissionais: 'Produção e comissões por profissional.',
  estoque:       'Valor parado, giro, itens críticos e vencimentos.',
  comercial:     'O funil das oportunidades, a conversão por origem e o ranking por vendedor.',
}

/**
 * Abas liberadas para o cargo. Sem linha nenhuma, sem relatório: a omissão fecha porque a decisão de
 * produto foi começar fechado e abrir aba por aba (2026-09-18).
 */
export function resolveReportTabs(
  rows: { tab: string }[],
  opts?: { allAccess?: boolean },
): ReportTab[] {
  if (opts?.allAccess) return [...REPORT_TABS]
  const marcadas = new Set(rows.map(r => r.tab))
  // Filtra pela lista canônica e devolve na ordem da tela, não na do banco.
  return REPORT_TABS.filter(t => marcadas.has(t))
}

// Rótulo pt-BR de cada nível (para selects/segmented controls)
export const LEVEL_LABELS: Record<PermissionLevel, string> = {
  NONE:   'Sem acesso',
  VIEW:   'Ver',
  MANAGE: 'Gerenciar',
}
