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
  documents:       'Dispensar documentos', // o Heitor, 26/11 (R19); era "Modelos de documento"
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
  // PG-05: em Gerenciar também troca pontos por recompensa e cancela e entrega o voucher.
  loyalty:         'Pontos do cliente: saldo, extrato, troca por recompensa, voucher e ajuste',
  medical_records: 'Ficha de saúde, evolução, fotos e anexos clínicos',
  // Os modelos em si são só da Admin da rede (18/11): o módulo dispensa.
  documents:       'Dispensar um documento obrigatório da cliente (os modelos são só da Admin da rede)',
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
  // Automações e Marketing: só Sem acesso e Ver (Q02 do catálogo de Automações,
  // revisão de 24/11). Criar e mudar campanha, template e automação é só da
  // Admin da rede desde 18/11, e o Gerenciar não dava nada além do Ver. O
  // Gerenciar já gravado vale como Ver (`nivelAceito`; MANAGE ≥ VIEW no `can`).
  marketing:       ['NONE', 'VIEW'],
  reports:         ['NONE', 'VIEW'],
  team:            ['NONE', 'VIEW', 'MANAGE'],
  // As Fichas e os Cargos: só Sem acesso e Ver (o Heitor, 25/11, "8 - a": "o
  // nível passa a se chamar 'Ver': a pessoa abre a aba e lê, como já acontece").
  // Mudar é só da Admin da rede desde 18/11; o Gerenciar gravado vale Ver.
  forms:           ['NONE', 'VIEW'],
  roles:           ['NONE', 'VIEW'],
  settings:        ['NONE', 'MANAGE'],
  automations:     ['NONE', 'VIEW'],
  // O Copilot também (revisão de 24/11, Q02; "nenhuma ação pede dois", 23/11):
  // o Ver liga a ferramenta, e cada gravação pede só a permissão dela.
  copilot:         ['NONE', 'VIEW'],
  // Só da Admin da rede (MODULOS_SO_DA_ADMIN): um cargo só a tem em Sem acesso.
  audit:           ['NONE'],
}

// ─── Níveis ──────────────────────────────────────────────────────────────────
const LEVEL_RANK: Record<PermissionLevel, number> = { NONE: 0, VIEW: 1, MANAGE: 2 }

export function hasLevel(level: PermissionLevel | undefined, required: PermissionLevel): boolean {
  return LEVEL_RANK[level ?? 'NONE'] >= LEVEL_RANK[required]
}

/**
 * O nível que VALE para o módulo, entre os que ele oferece (`MODULE_LEVELS`):
 * o gravado, se o módulo o oferece; o Gerenciar gravado num módulo que só vai
 * até o Ver vale Ver (as Automações e o Marketing, revisão de 24/11 — o cargo
 * não perde o que via); o resto, Sem acesso, como sempre foi ao salvar.
 * É o que a tela de Cargos mostra, o que se grava e o que o "cargo acima" compara.
 */
export function nivelAceito(modulo: AppModule, nivel: PermissionLevel): PermissionLevel {
  const aceita = MODULE_LEVELS[modulo] ?? ['NONE']
  if (aceita.includes(nivel)) return nivel
  if (nivel === 'MANAGE' && aceita.includes('VIEW')) return 'VIEW'
  return 'NONE'
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
 * A aba de Relatórios que pede um MÓDULO além de ser marcada (o Heitor,
 * 2026-11-23: "financeiro é uma coisa, vendas é outra. financeiro ve
 * entrada/saida/lucro, tudo. vendas é sobre performance de vendas."): a
 * Financeiro (entradas, saídas, lucro) só vale com o Financeiro em Ver. A
 * Vendas e as outras valem só pela marca. É a régua de `podeVerRelatorio` e da
 * tela de Cargos (a caixa desligada, com o motivo à vista — princípio 3).
 */
export const MODULO_DA_ABA: Partial<Record<ReportTab, { modulo: AppModule; motivo: string }>> = {
  financeiro: { modulo: 'financial', motivo: 'pede o Financeiro' },
}

/** A aba marcada vale com estes níveis? */
export function abaDeRelatorioVale(tab: ReportTab, niveis: Partial<Record<AppModule, PermissionLevel>>): boolean {
  const pede = MODULO_DA_ABA[tab]
  return !pede || hasLevel(niveis[pede.modulo], 'VIEW')
}

/** As abas marcadas que valem com estes níveis (as outras não abrem nada). */
export function abasQueValem(tabs: readonly ReportTab[], niveis: Partial<Record<AppModule, PermissionLevel>>): ReportTab[] {
  return tabs.filter(t => abaDeRelatorioVale(t, niveis))
}

/** Por que a aba não vale com estes níveis ("pede o Financeiro"); nulo quando vale. */
export function motivoDaAbaFechada(tab: ReportTab, niveis: Partial<Record<AppModule, PermissionLevel>>): string | null {
  return abaDeRelatorioVale(tab, niveis) ? null : MODULO_DA_ABA[tab]!.motivo
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
