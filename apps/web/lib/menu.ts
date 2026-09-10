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

export type MenuEntry = {
  /** Chave estável, usada para casar com o ícone em quem renderiza. */
  key:     string
  /** Rótulo fixo, ou derivado das permissões quando ele muda com o acesso. */
  label:   string | ((p: ResolvedPermissions) => string)
  /** Rota absoluta na rede; sufixo depois de `/[slug]` na filial. */
  href:    string
  visible: (p: ResolvedPermissions) => boolean
}

const has = (p: ResolvedPermissions, m: keyof ResolvedPermissions) => p[m] !== 'NONE'

export const ADMIN_MENU: readonly MenuEntry[] = [
  { key: 'dashboard',    label: 'Dashboard',     href: '/admin/dashboard',    visible: () => true },
  { key: 'agenda',       label: 'Agenda',        href: '/admin/agenda',       visible: p => has(p, 'agenda') },
  { key: 'clients',      label: 'Clientes',      href: '/admin/clients',      visible: p => has(p, 'clients') },
  { key: 'reports',      label: 'Relatórios',    href: '/admin/reports',      visible: p => has(p, 'reports') },
  { key: 'financial',    label: 'Financeiro',    href: '/admin/financeiro',   visible: p => has(p, 'financial') },
  { key: 'stock',        label: 'Estoque',       href: '/admin/estoque',      visible: p => has(p, 'stock') },
  { key: 'procedures',   label: 'Procedimentos', href: '/admin/procedures',   visible: p => has(p, 'procedures') },
  { key: 'crm',          label: 'CRM',           href: '/admin/crm',          visible: p => has(p, 'crm') },
  { key: 'notificacoes', label: 'Notificações',  href: '/admin/notificacoes', visible: p => has(p, 'marketing') },
  { key: 'marketing',    label: 'Marketing',     href: '/admin/marketing',    visible: p => has(p, 'marketing') },
  { key: 'team',         label: 'Equipe',        href: '/admin/team',         visible: p => has(p, 'team') },
  // Uma tela, três módulos: quem só tem cargos ou fichas continua chegando lá.
  {
    key: 'settings', label: 'Configurações', href: '/admin/settings',
    visible: p => has(p, 'settings') || has(p, 'roles') || has(p, 'forms'),
  },
]

export const BRANCH_MENU: readonly MenuEntry[] = [
  { key: 'dashboard',  label: 'Dashboard',     href: '/dashboard',     visible: () => true },
  { key: 'agenda',     label: 'Agenda',        href: '/agenda',        visible: p => has(p, 'agenda') },
  { key: 'clients',    label: 'Clientes',      href: '/clients',       visible: p => has(p, 'clients') },
  { key: 'crm',        label: 'CRM',           href: '/crm',           visible: p => has(p, 'crm') },
  { key: 'reports',    label: 'Relatórios',    href: '/reports',       visible: p => has(p, 'reports') },
  // Mesma tela para financeiro e caixa: o rótulo acompanha o acesso, porque
  // quem só opera o caixa entra e vê só o widget de abrir/fechar.
  {
    key: 'financial',
    label: p => (has(p, 'financial') ? 'Financeiro' : 'Caixa'),
    href: '/financial',
    visible: p => has(p, 'financial') || has(p, 'cashier'),
  },
  { key: 'procedures', label: 'Procedimentos', href: '/procedures',    visible: p => has(p, 'procedures') },
  { key: 'stock',      label: 'Estoque',       href: '/stock',         visible: p => has(p, 'stock') },
  { key: 'team',       label: 'Equipe',        href: '/settings/team', visible: p => has(p, 'team') },
  // Os construtores de ficha viviam só no portal da rede, onde quem tem
  // unidade fixa nem entra — `forms: MANAGE` numa gerente não fazia nada.
  { key: 'forms',      label: 'Modelos de ficha', href: '/settings/fichas', visible: p => has(p, 'forms') },
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

/** Só os rótulos, na ordem do menu — para a pré-visualização do cargo. */
export function menuLabelsFor(
  menu: readonly MenuEntry[],
  permissions: ResolvedPermissions,
): string[] {
  return menuEntriesFor(menu, permissions).map(e => e.label)
}
