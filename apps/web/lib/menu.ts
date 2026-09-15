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
 * São as MESMAS de `MODULE_GROUPS` (lib/permissions-copy.ts), de propósito: quem
 * monta um cargo vê os módulos agrupados exatamente como a pessoa vai ver o
 * menu depois. Duas taxonomias diferentes para a mesma coisa obrigariam a
 * traduzir de cabeça entre as duas telas.
 */
export type MenuGroupKey = 'atendimento' | 'vendas' | 'dinheiro' | 'gestao'

export const MENU_GROUPS: readonly { key: MenuGroupKey; label: string }[] = [
  { key: 'atendimento', label: 'Atendimento' },
  { key: 'vendas',      label: 'Vendas e marketing' },
  { key: 'dinheiro',    label: 'Dinheiro e estoque' },
  { key: 'gestao',      label: 'Gestão e configuração' },
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

// O CRM era uma tela só com abas "Funil" e "Inbox". Virou duas entradas: as
// duas coisas têm ritmo diferente — a caixa de entrada se responde o dia
// inteiro, o funil se revisa. Ambas continuam atrás do módulo `crm`.

export const ADMIN_MENU: readonly MenuEntry[] = [
  { key: 'dashboard',    group: undefined,      label: 'Dashboard',     href: '/admin/dashboard',      visible: () => true },

  { key: 'agenda',       group: 'atendimento',  label: 'Agenda',        href: '/admin/agenda',         visible: p => has(p, 'agenda') },
  { key: 'clients',      group: 'atendimento',  label: 'Clientes',      href: '/admin/clients',        visible: p => has(p, 'clients') },

  { key: 'inbox',        group: 'vendas',       label: 'Inbox',         href: '/admin/inbox',          visible: p => has(p, 'crm') },
  { key: 'oportunidades',group: 'vendas',       label: 'Oportunidades', href: '/admin/oportunidades',  visible: p => has(p, 'crm') },
  { key: 'procedures',   group: 'vendas',       label: 'Procedimentos', href: '/admin/procedures',     visible: p => has(p, 'procedures') },
  { key: 'notificacoes', group: 'vendas',       label: 'Notificações',  href: '/admin/notificacoes',   visible: p => has(p, 'marketing') },
  { key: 'marketing',    group: 'vendas',       label: 'Marketing',     href: '/admin/marketing',      visible: p => has(p, 'marketing') },

  { key: 'financial',    group: 'dinheiro',     label: 'Financeiro',    href: '/admin/financeiro',     visible: p => has(p, 'financial') },
  { key: 'stock',        group: 'dinheiro',     label: 'Estoque',       href: '/admin/estoque',        visible: p => has(p, 'stock') },

  { key: 'reports',      group: 'gestao',       label: 'Relatórios',    href: '/admin/reports',        visible: p => has(p, 'reports') },
  { key: 'team',         group: 'gestao',       label: 'Equipe',        href: '/admin/team',           visible: p => has(p, 'team') },
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

  { key: 'inbox',         group: 'vendas',      label: 'Inbox',         href: '/inbox',         visible: p => has(p, 'crm') },
  { key: 'oportunidades', group: 'vendas',      label: 'Oportunidades', href: '/oportunidades', visible: p => has(p, 'crm') },
  { key: 'procedures',    group: 'vendas',      label: 'Procedimentos', href: '/procedures',    visible: p => has(p, 'procedures') },

  // Mesma tela para financeiro e caixa: o rótulo acompanha o acesso, porque
  // quem só opera o caixa entra e vê só o widget de abrir/fechar.
  {
    key: 'financial', group: 'dinheiro',
    label: p => (has(p, 'financial') ? 'Financeiro' : 'Caixa'),
    href: '/financial',
    visible: p => has(p, 'financial') || has(p, 'cashier'),
  },
  { key: 'stock',         group: 'dinheiro',    label: 'Estoque',       href: '/stock',         visible: p => has(p, 'stock') },

  { key: 'reports',       group: 'gestao',      label: 'Relatórios',    href: '/reports',       visible: p => has(p, 'reports') },
  { key: 'team',          group: 'gestao',      label: 'Equipe',        href: '/settings/team', visible: p => has(p, 'team') },
  // Os construtores de ficha viviam só no portal da rede, onde quem tem
  // unidade fixa nem entra — `forms: MANAGE` numa gerente não fazia nada.
  { key: 'forms',         group: 'gestao',      label: 'Modelos de ficha', href: '/settings/fichas', visible: p => has(p, 'forms') },
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
