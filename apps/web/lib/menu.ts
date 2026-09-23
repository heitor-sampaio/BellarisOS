import type { ResolvedPermissions } from '@estetica-os/types'

/**
 * Definição única dos itens de menu e do que os libera.
 *
 * Existia duplicada nas duas sidebars, e a tela de cargos precisa da mesma
 * regra para pré-visualizar o que um cargo vai enxergar. Três cópias da mesma
 * lista divergiriam na primeira mudança — daí a fonte única.
 *
 * Ícones e o prefixo de rota da filial ficam com quem renderiza: aqui mora só
 * o que existe, como se chama e o que precisa para aparecer.
 */

/**
 * Áreas do menu.
 *
 * Nascem das mesmas de `MODULE_GROUPS` (lib/permissions-copy.ts), de propósito:
 * quem monta um cargo vê os módulos agrupados como a pessoa vai ver o menu
 * depois. "Planejamento" é a exceção — não é um módulo a mais, e sim duas telas
 * do mesmo assunto (o que se planeja para o cliente) que saíram de `agenda` e
 * `medical_records`. Misturadas em Atendimento, ninguém achava os injetáveis.
 */
export type MenuGroupKey = 'atendimento' | 'planejamento' | 'vendas' | 'dinheiro' | 'gestao'

export const MENU_GROUPS: readonly { key: MenuGroupKey; label: string }[] = [
  { key: 'atendimento',  label: 'Atendimento' },
  { key: 'planejamento', label: 'Planejamento' },
  { key: 'vendas',       label: 'Vendas e marketing' },
  { key: 'dinheiro',     label: 'Dinheiro e estoque' },
  { key: 'gestao',       label: 'Gestão e configuração' },
]

export type MenuEntry = {
  /** Chave estável, usada para casar com o ícone em quem renderiza. */
  key:     string
  /** Área do menu. Sem grupo = fica solto no topo, antes das categorias. */
  group?:  MenuGroupKey
  /** Rótulo fixo, ou derivado das permissões quando ele muda com o acesso. */
  label:   string | ((p: ResolvedPermissions) => string)
  /** Rota absoluta na rede; sufixo depois de `/[slug]` na filial. */
  href:    string
  visible: (p: ResolvedPermissions) => boolean
}

const has = (p: ResolvedPermissions, m: keyof ResolvedPermissions) => p[m] !== 'NONE'

/** Pode receber dinheiro do cliente — caixa ou financeiro. Igual a lib/auth. */
const recebe = (p: ResolvedPermissions) => p.cashier === 'MANAGE' || p.financial === 'MANAGE'

// O CRM era uma tela só com abas "Funil" e "Inbox". Virou duas entradas: as
// duas coisas têm ritmo diferente — a caixa de entrada se responde o dia
// inteiro, o funil se revisa. Ambas continuam atrás do módulo `crm`.

export const ADMIN_MENU: readonly MenuEntry[] = [
  { key: 'dashboard',    group: undefined,      label: 'Dashboard',     href: '/admin/dashboard',      visible: () => true },

  { key: 'agenda',       group: 'atendimento',  label: 'Agenda',        href: '/admin/agenda',         visible: p => has(p, 'agenda') },
  { key: 'clients',      group: 'atendimento',  label: 'Clientes',      href: '/admin/clients',        visible: p => has(p, 'clients') },
  // Onde os planos de tratamento vivem — os que estão sendo montados, os que
  // esperam aceite e os aceitos. A entrada "Checkout" saiu daqui: a fila era uma
  // tarefa sem dono, esperando uma decisão do cliente. O dinheiro passou a ser
  // recebido no check-in do atendimento, e o que sobrava da fila virou o filtro
  // "Aguardando aceite" desta tela.
  { key: 'planejamentos',group: 'planejamento', label: 'Tratamentos',   href: '/admin/planejamentos',  visible: p => has(p, 'medical_records') || recebe(p) },
  // O mapa de injetáveis era alcançável só por dentro da ficha de um cliente.
  // É clínico (vira registro de prontuário), daí o módulo ser outro.
  { key: 'injetaveis',   group: 'planejamento', label: 'Injetáveis',    href: '/admin/injetaveis',     visible: p => has(p, 'medical_records') },

  { key: 'inbox',        group: 'vendas',       label: 'Inbox',         href: '/admin/inbox',          visible: p => has(p, 'crm') },
  { key: 'oportunidades',group: 'vendas',       label: 'Oportunidades', href: '/admin/oportunidades',  visible: p => has(p, 'crm') },
  { key: 'notificacoes', group: 'vendas',       label: 'Notificações',  href: '/admin/notificacoes',   visible: p => has(p, 'marketing') },
  { key: 'marketing',    group: 'vendas',       label: 'Marketing',     href: '/admin/marketing',      visible: p => has(p, 'marketing') },
  // Templates do WhatsApp oficial. Ficam aqui, e não em Configurações, porque
  // quem escreve a mensagem é o time comercial — não quem conecta a API.
  { key: 'templates',    group: 'vendas',       label: 'Templates',     href: '/admin/templates',      visible: p => has(p, 'marketing') },

  { key: 'financial',    group: 'dinheiro',     label: 'Financeiro',    href: '/admin/financeiro',     visible: p => has(p, 'financial') },
  { key: 'stock',        group: 'dinheiro',     label: 'Estoque',       href: '/admin/estoque',        visible: p => has(p, 'stock') },

  // O funil comercial era uma entrada à parte (`/admin/comercial`). Virou a aba
  // "Comercial" daqui: mesmo módulo, mesmo assunto, um destino só.
  { key: 'reports',      group: 'gestao',       label: 'Relatórios',    href: '/admin/reports',        visible: p => has(p, 'reports') },
  { key: 'team',         group: 'gestao',       label: 'Equipe',        href: '/admin/team',           visible: p => has(p, 'team') },
  { key: 'procedures',   group: 'gestao',       label: 'Procedimentos', href: '/admin/procedures',     visible: p => has(p, 'procedures') },
  // Só na rede: a automação reage a fatos de todas as unidades, e uma versão
  // por filial prometeria um recorte que o motor não faz.
  { key: 'automations',  group: 'gestao',       label: 'Automações',    href: '/admin/automacoes',     visible: p => has(p, 'automations') },
  // Uma tela, três módulos: quem só tem cargos ou fichas continua chegando lá.
  {
    key: 'settings', group: 'gestao', label: 'Configurações', href: '/admin/settings',
    visible: p => has(p, 'settings') || has(p, 'roles') || has(p, 'forms'),
  },
]

export const BRANCH_MENU: readonly MenuEntry[] = [
  { key: 'dashboard',     group: undefined,     label: 'Dashboard',     href: '/dashboard',     visible: () => true },

  { key: 'agenda',        group: 'atendimento', label: 'Agenda',        href: '/agenda',        visible: p => has(p, 'agenda') },
  { key: 'clients',       group: 'atendimento', label: 'Clientes',      href: '/clients',       visible: p => has(p, 'clients') },
  { key: 'planejamentos', group: 'planejamento', label: 'Tratamentos', href: '/planejamentos', visible: p => has(p, 'medical_records') || recebe(p) },
  { key: 'injetaveis',    group: 'planejamento', label: 'Injetáveis',  href: '/injetaveis',    visible: p => has(p, 'medical_records') },

  { key: 'inbox',         group: 'vendas',      label: 'Inbox',         href: '/inbox',         visible: p => has(p, 'crm') },
  { key: 'oportunidades', group: 'vendas',      label: 'Oportunidades', href: '/oportunidades', visible: p => has(p, 'crm') },

  // Só `financial`. O módulo `cashier` governa RECEBER — no atendimento e no
  // checkout do plano —, e desde que o caixa de abrir/fechar saiu não há mais
  // tela própria dele: quem só recebe entrava aqui e via a tela vazia.
  { key: 'financial',     group: 'dinheiro',    label: 'Financeiro',    href: '/financeiro',    visible: p => has(p, 'financial') },
  { key: 'stock',         group: 'dinheiro',    label: 'Estoque',       href: '/estoque',       visible: p => has(p, 'stock') },

  { key: 'reports',       group: 'gestao',      label: 'Relatórios',    href: '/reports',       visible: p => has(p, 'reports') },
  { key: 'team',          group: 'gestao',      label: 'Equipe',        href: '/team',          visible: p => has(p, 'team') },
  { key: 'procedures',    group: 'gestao',      label: 'Procedimentos', href: '/procedures',    visible: p => has(p, 'procedures') },
  // Mesma tela da rede, e pelo mesmo motivo do `/admin`: uma entrada, três
  // módulos. Quem tem unidade fixa não entra em `/admin`, então sem esta linha
  // `settings`, `roles` ou `forms` em MANAGE não valiam nada numa gerente.
  {
    key: 'settings', group: 'gestao', label: 'Configurações', href: '/settings',
    visible: p => has(p, 'settings') || has(p, 'roles') || has(p, 'forms'),
  },
]

export function menuEntriesFor(
  menu: readonly MenuEntry[],
  permissions: ResolvedPermissions,
): { key: string; label: string; href: string }[] {
  return menu
    .filter(e => e.visible(permissions))
    .map(e => ({
      key:   e.key,
      label: typeof e.label === 'function' ? e.label(permissions) : e.label,
      href:  e.href,
    }))
}

export interface MenuSection {
  /** `null` = os itens que ficam soltos no topo, antes da primeira categoria. */
  key:     MenuGroupKey | null
  label:   string | null
  entries: { key: string; label: string; href: string }[]
}

/**
 * O menu em seções, já filtrado pelo cargo.
 *
 * Categoria que ficou sem item não aparece: um cargo só de agenda não deve ver
 * o título "Dinheiro e estoque" seguido de nada.
 */
export function menuSectionsFor(
  menu: readonly MenuEntry[],
  permissions: ResolvedPermissions,
): MenuSection[] {
  const visiveis = menu.filter(e => e.visible(permissions))
  const resolver = (e: MenuEntry) => ({
    key:   e.key,
    label: typeof e.label === 'function' ? e.label(permissions) : e.label,
    href:  e.href,
  })

  const soltos = visiveis.filter(e => !e.group).map(resolver)
  const secoes: MenuSection[] = soltos.length > 0
    ? [{ key: null, label: null, entries: soltos }]
    : []

  for (const grupo of MENU_GROUPS) {
    const entries = visiveis.filter(e => e.group === grupo.key).map(resolver)
    if (entries.length > 0) secoes.push({ key: grupo.key, label: grupo.label, entries })
  }

  return secoes
}

/** Só os rótulos, na ordem do menu — para a pré-visualização do cargo. */
export function menuLabelsFor(
  menu: readonly MenuEntry[],
  permissions: ResolvedPermissions,
): string[] {
  return menuEntriesFor(menu, permissions).map(e => e.label)
}
