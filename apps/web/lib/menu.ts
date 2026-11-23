import type { ResolvedPermissions } from '@estetica-os/types'

/**
 * Definição única dos itens de menu e do que os libera.
 *
 * Existia duplicada nas duas sidebars, e a tela de cargos precisa da mesma
 * regra para pré-visualizar o que um cargo vai enxergar. Três cópias da mesma
 * lista divergiriam na primeira mudança — daí a fonte única.
 *
 * Ícones e o prefixo de rota da unidade ficam com quem renderiza: aqui mora só
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
export type MenuGroupKey = 'atendimento' | 'planejamento' | 'vendas' | 'marketing' | 'dinheiro' | 'gestao'

export const MENU_GROUPS: readonly { key: MenuGroupKey; label: string }[] = [
  { key: 'atendimento',  label: 'Atendimento' },
  { key: 'planejamento', label: 'Planejamento' },
  { key: 'vendas',       label: 'Comercial' },
  { key: 'marketing',    label: 'Marketing' },
  { key: 'dinheiro',     label: 'Dinheiro e estoque' },
  { key: 'gestao',       label: 'Gestão e configuração' },
]

export type MenuEntry = {
  /** Chave estável, usada para casar com o ícone em quem renderiza. */
  key:     string
  /** Área do menu. Sem grupo = fica solto no topo, antes das categorias. */
  group?:  MenuGroupKey
  /** Rótulo fixo, ou derivado das permissões (e da pessoa) quando ele muda com o acesso. */
  label:   string | ((p: ResolvedPermissions, v?: DaPessoa) => string)
  /** Rota absoluta na rede; sufixo depois de `/[slug]` na unidade. */
  href:    string
  /** `v`: o que é da pessoa, quando o item depende dele (as vistas pessoais). */
  visible: (p: ResolvedPermissions, v?: DaPessoa) => boolean
  /**
   * A funcionalidade do PLANO a que o item pertence (lib/planos/recursos.ts),
   * quando ela é parte de um módulo: pacotes dentro de procedimentos, a inbox
   * e as oportunidades dentro do CRM. Fora do plano, o item some.
   */
  recurso?: string
}

/**
 * O que é da PESSOA e muda o menu: quem atende tem as vistas pessoais (a
 * Minha agenda, as Minhas comissões) mesmo sem o módulo (o Heitor,
 * 2026-11-23: "pode tirar, as vistas pessoais resolvem"). É o
 * `vistaPessoal` de lib/auth, pelo que o menu recebe.
 */
export type DaPessoa = { atende?: boolean; comissaoDeVenda?: boolean }

/** O plano da rede, como o contexto o traz (`ctx.plano`); null = tudo. */
type PlanoDoMenu = { funcionalidades: readonly string[] } | null | undefined
const noPlano = (e: MenuEntry, plano: PlanoDoMenu) => !e.recurso || !plano || plano.funcionalidades.includes(e.recurso)

const has = (p: ResolvedPermissions, m: keyof ResolvedPermissions) => p[m] !== 'NONE'

/**
 * A Agenda de quem tem o módulo; a Minha agenda (a vista pessoal) de quem
 * atende sem ele.
 */
const rotuloDaAgenda = (p: ResolvedPermissions) => (has(p, 'agenda') ? 'Agenda' : 'Minha agenda')
const veAgenda = (p: ResolvedPermissions, v?: DaPessoa) => has(p, 'agenda') || !!v?.atende
/** As Minhas comissões: a vista pessoal de quem atende (ou tem comissão no nome dela) sem o Financeiro. */
const veMinhasComissoes = (p: ResolvedPermissions, v?: DaPessoa) => !has(p, 'financial') && !!(v?.atende || v?.comissaoDeVenda)

/**
 * O rótulo de Configurações: quem só chega pelas abas Tags e Importações
 * (clientes ou CRM em Gerenciar) não vê "Configurações" seca, que promete o
 * que o cargo não tem (A11, simulação de 2026-10-27). `comFinanceiro`: na
 * rede, o financeiro em Gerenciar também abre a tela (aba de comissões).
 * "Configurações (Tags e Importações)" saía cortado na barra lateral (J-16):
 * o rótulo é só o que a pessoa alcança.
 */
const rotuloDeConfiguracoes = (comFinanceiro: boolean) => (p: ResolvedPermissions) =>
  has(p, 'settings') || has(p, 'roles') || has(p, 'forms') || has(p, 'documents') || (comFinanceiro && p.financial === 'MANAGE')
    // D8 da 25ª: quem libera o prontuário chega à aba LGPD — não é "Tags e importações".
    || p.medical_records === 'MANAGE'
    ? 'Configurações'
    : 'Tags e importações'

/** Pode receber dinheiro do cliente — caixa ou financeiro. Igual a lib/auth. */
/** Recebe pagamento (caixa ou financeiro em Gerenciar) — o `podeReceber` de lib/auth, pelas permissões. */
export const recebe = (p: ResolvedPermissions) => p.cashier === 'MANAGE' || p.financial === 'MANAGE'

/**
 * O Fechamento do dia é o dinheiro da UNIDADE inteira: quem recebe
 * (`cashier`) ou quem vê o Financeiro. O `podeVerFechamento` de lib/auth.
 */
export const veFechamento = (p: ResolvedPermissions) => p.cashier === 'MANAGE' || has(p, 'financial')

// O CRM era uma tela só com abas "Funil" e "Inbox". Virou duas entradas: as
// duas coisas têm ritmo diferente — a caixa de entrada se responde o dia
// inteiro, o funil se revisa. Ambas continuam atrás do módulo `crm`.

export const ADMIN_MENU: readonly MenuEntry[] = [
  { key: 'dashboard',    group: undefined,      label: 'Dashboard',     href: '/admin/dashboard',      visible: () => true },

  { key: 'agenda',       group: 'atendimento',  label: rotuloDaAgenda,  href: '/admin/agenda',         visible: veAgenda },
  { key: 'clients',      group: 'atendimento',  label: 'Clientes',      href: '/admin/clients',        visible: p => has(p, 'clients') },
  // Todo termo e contrato emitido, com a situação (a enviar, enviado, assinado…).
  { key: 'documentos', recurso: 'documentos', group: 'atendimento', label: 'Documentos', href: '/admin/documentos', visible: p => has(p, 'clients') },
  // Onde os planos de tratamento vivem — os que estão sendo montados, os que
  // esperam aceite e os aceitos. A entrada "Checkout" saiu daqui: a fila era uma
  // tarefa sem dono, esperando uma decisão do cliente. O dinheiro passou a ser
  // recebido no check-in do atendimento, e o que sobrava da fila virou o filtro
  // "Aguardando aceite" desta tela.
  // A página pede o Atendimento em Ver (era a Agenda até 2026-11-18); montar o
  // plano é do Atendimento em Gerenciar (UM3). D1 da 23ª (princípio 3): segue a página. Abria
  // também pelo Prontuário e por quem recebe ("ele cobra o plano ali"), e a
  // página barrava; desde o PDV4/PT1c/PDV7 o plano se cobra na comanda do PDV.
  { key: 'planejamentos', recurso: 'planos_de_tratamento',group: 'planejamento', label: 'Tratamentos',   href: '/admin/planejamentos',  visible: p => has(p, 'atendimento') },
  // O mapa de injetáveis era alcançável só por dentro da ficha de um cliente.
  // É clínico (vira registro de prontuário), daí o módulo ser outro.
  { key: 'injetaveis', recurso: 'injetaveis',   group: 'planejamento', label: 'Injetáveis',    href: '/admin/injetaveis',     visible: p => has(p, 'medical_records') },

  // O PDV (PDV1, a revisão do Heitor de 2026-11-13): vender e receber, seja do que for.
  // De quem recebe (o PDV ou o Financeiro em Gerenciar — `recebe`); de todo plano (PL1).
  { key: 'pdv',          group: 'vendas',       label: 'PDV',           href: '/admin/pdv',            visible: recebe },
  { key: 'inbox', recurso: 'inbox',        group: 'vendas',       label: 'Inbox',         href: '/admin/inbox',          visible: p => has(p, 'crm') },
  { key: 'oportunidades', recurso: 'oportunidades',group: 'vendas',       label: 'Oportunidades', href: '/admin/oportunidades',  visible: p => has(p, 'crm') },
  // O que se vende: o catálogo de procedimentos e os pacotes (decisão do
  // Heitor, 2026-09-30 — antes, Procedimentos ficava em Gestão).
  { key: 'procedures',   group: 'vendas',       label: 'Procedimentos', href: '/admin/procedures',     visible: p => has(p, 'procedures') },
  { key: 'pacotes', recurso: 'pacotes',      group: 'vendas',       label: 'Pacotes',       href: '/admin/pacotes',        visible: p => has(p, 'procedures') },
  { key: 'notificacoes', recurso: 'campanhas', group: 'marketing',      label: 'Notificações',  href: '/admin/notificacoes',   visible: p => has(p, 'marketing') },
  // "Anúncios" (A9 da 14ª): o item mostra só os anúncios (Meta e Google), e
  // "Marketing" — o nome do grupo — fazia procurar ali as campanhas.
  { key: 'marketing', recurso: 'anuncios',    group: 'marketing',      label: 'Anúncios',      href: '/admin/marketing',      visible: p => has(p, 'marketing') },
  // Templates do WhatsApp oficial. Ficam aqui, e não em Configurações, porque
  // quem escreve a mensagem é o time comercial — não quem conecta a API.
  { key: 'templates', recurso: 'templates',    group: 'marketing',      label: 'Templates',     href: '/admin/templates',      visible: p => has(p, 'marketing') },

  { key: 'financial',    group: 'dinheiro',     label: 'Financeiro',    href: '/admin/financeiro',     visible: p => has(p, 'financial') },
  { key: 'minhas-comissoes', recurso: 'comissoes', group: 'dinheiro', label: 'Minhas comissões', href: '/admin/financeiro/comissoes', visible: veMinhasComissoes },
  // O fechamento do dia (2026-10-21): quem recebe fecha; quem vê o Financeiro vê.
  // Mora no PDV desde a CX4 (2026-11-14): o item abre a vista de fechar dele.
  { key: 'fechamento',   group: 'dinheiro',     label: 'Fechamento do dia', href: '/admin/pdv?fechar=1', visible: veFechamento },
  { key: 'stock',        group: 'dinheiro',     label: 'Estoque',       href: '/admin/estoque',        visible: p => has(p, 'stock') },

  // O funil comercial era uma entrada à parte (`/admin/comercial`). Virou a aba
  // "Comercial" daqui: mesmo módulo, mesmo assunto, um destino só.
  { key: 'reports',      group: 'gestao',       label: 'Relatórios',    href: '/admin/reports',        visible: p => has(p, 'reports') },
  // CF3a (2026-11-14): o que mudou, quem mudou e quando — ao lado de Relatórios.
  { key: 'auditoria',    group: 'gestao',       label: 'Auditoria',     href: '/admin/auditoria',      visible: p => has(p, 'audit') },
  { key: 'team',         group: 'gestao',       label: 'Equipe',        href: '/admin/team',           visible: p => has(p, 'team') },
  // Só na rede: a automação reage a fatos de todas as unidades, e uma versão
  // por unidade prometeria um recorte que o motor não faz.
  { key: 'automations',  group: 'gestao',       label: 'Automações',    href: '/admin/automacoes',     visible: p => has(p, 'automations') },
  // Uma tela, quatro módulos: quem só tem cargos ou fichas continua chegando lá,
  // e quem administra o financeiro da rede, à aba de comissões.
  {
    key: 'settings', group: 'gestao', label: rotuloDeConfiguracoes(true), href: '/admin/settings',
    // Importações abre também com clientes ou CRM em Gerenciar (a aba delas).
    visible: p => has(p, 'settings') || has(p, 'roles') || has(p, 'forms') || has(p, 'documents') || p.financial === 'MANAGE'
      || p.clients === 'MANAGE' || p.crm === 'MANAGE' || p.medical_records === 'MANAGE',
  },
]

export const BRANCH_MENU: readonly MenuEntry[] = [
  { key: 'dashboard',     group: undefined,     label: 'Dashboard',     href: '/dashboard',     visible: () => true },

  { key: 'agenda',        group: 'atendimento', label: rotuloDaAgenda,  href: '/agenda',        visible: veAgenda },
  { key: 'clients',       group: 'atendimento', label: 'Clientes',      href: '/clients',       visible: p => has(p, 'clients') },
  { key: 'documentos', recurso: 'documentos', group: 'atendimento', label: 'Documentos', href: '/documentos', visible: p => has(p, 'clients') },
  { key: 'planejamentos', recurso: 'planos_de_tratamento', group: 'planejamento', label: 'Tratamentos', href: '/planejamentos', visible: p => has(p, 'atendimento') },
  { key: 'injetaveis', recurso: 'injetaveis',    group: 'planejamento', label: 'Injetáveis',  href: '/injetaveis',    visible: p => has(p, 'medical_records') },

  { key: 'pdv',           group: 'vendas',      label: 'PDV',           href: '/pdv',           visible: recebe },
  { key: 'inbox', recurso: 'inbox',         group: 'vendas',      label: 'Inbox',         href: '/inbox',         visible: p => has(p, 'crm') },
  { key: 'oportunidades', recurso: 'oportunidades', group: 'vendas',      label: 'Oportunidades', href: '/oportunidades', visible: p => has(p, 'crm') },
  { key: 'procedures',    group: 'vendas',      label: 'Procedimentos', href: '/procedures',    visible: p => has(p, 'procedures') },
  { key: 'pacotes', recurso: 'pacotes',       group: 'vendas',      label: 'Pacotes',       href: '/pacotes',       visible: p => has(p, 'procedures') },

  // Só `financial`. O módulo `cashier` governa RECEBER — no atendimento e no
  // checkout do plano —, e desde que o caixa de abrir/fechar saiu não há mais
  // tela própria dele: quem só recebe entrava aqui e via a tela vazia.
  { key: 'financial',     group: 'dinheiro',    label: 'Financeiro',    href: '/financeiro',    visible: p => has(p, 'financial') },
  { key: 'minhas-comissoes', recurso: 'comissoes', group: 'dinheiro', label: 'Minhas comissões', href: '/financeiro/comissoes', visible: veMinhasComissoes },
  // A tela de quem RECEBE (cashier): o fechamento do dia (2026-10-21) — e de quem vê o Financeiro.
  // Mora no PDV desde a CX4 (2026-11-14): o item abre a vista de fechar dele.
  { key: 'fechamento',    group: 'dinheiro',    label: 'Fechamento do dia', href: '/pdv?fechar=1', visible: veFechamento },
  { key: 'stock',         group: 'dinheiro',    label: 'Estoque',       href: '/estoque',       visible: p => has(p, 'stock') },

  { key: 'reports',       group: 'gestao',      label: 'Relatórios',    href: '/reports',       visible: p => has(p, 'reports') },
  { key: 'auditoria',     group: 'gestao',      label: 'Auditoria',     href: '/auditoria',     visible: p => has(p, 'audit') },
  { key: 'team',          group: 'gestao',      label: 'Equipe',        href: '/team',          visible: p => has(p, 'team') },
  // Mesma tela da rede, e pelo mesmo motivo do `/admin`: uma entrada, três
  // módulos. Quem tem unidade fixa não entra em `/admin`, então sem esta linha
  // `settings`, `roles` ou `forms` em MANAGE não valiam nada numa gerente.
  {
    key: 'settings', group: 'gestao', label: rotuloDeConfiguracoes(false), href: '/settings',
    visible: p => has(p, 'settings') || has(p, 'roles') || has(p, 'forms') || has(p, 'documents')
      || p.clients === 'MANAGE' || p.crm === 'MANAGE' || p.medical_records === 'MANAGE',
  },
]

/**
 * As entradas que só o menu da REDE tem (Notificações, Anúncios, Templates,
 * Automações…) — calculado, não escrito à mão: entrada nova da rede entra aqui
 * sozinha. A1 da 14ª (princípio 7 e CLAUDE.md §1, "otimize para a clínica
 * única"): a dona da clínica de uma unidade, no portal da unidade, não achava
 * as automações nem as campanhas.
 */
export const SO_NO_MENU_DA_REDE: readonly MenuEntry[] =
  ADMIN_MENU.filter(e => !BRANCH_MENU.some(b => b.key === e.key))

/**
 * Quem não é a Admin da rede e só chegaria às abas da configuração da rede
 * toda (Cargos, Fichas, Documentos, Comissões e taxas, Tags, Importações…)
 * só leria "Esta configuração é só da Admin da rede." — desde 18/11 (o
 * Heitor: "Configuração da rede toda só pela conta admin"; CLAUDE.md §11)
 * isso vale também para quem tem "A rede inteira" (A-CONF1 da 25ª; era a A26
 * da 15ª, que olhava a abrangência). O item sai do menu, da busca e do resumo
 * do cargo (CLAUDE.md §14, "botão que a pessoa não pode usar: a tela
 * esconde"). Fica para quem usa alguma aba: Configurações em Gerenciar (a
 * Unidade, a LGPD, a Geral para ler) ou o Prontuário em Gerenciar (a LGPD,
 * D8 da 25ª). A tela continua de pé pela URL, com a frase.
 * `souAdmin`: o cargo de sistema (`mexeNaConfigDaRede(ctx)`).
 */
export function soLeriaAsConfiguracoes(p: ResolvedPermissions, souAdmin: boolean): boolean {
  return !souAdmin && !(p.settings === 'MANAGE' || p.medical_records === 'MANAGE')
}

/**
 * O menu do portal da UNIDADE, com os endereços completos. Quem é da rede
 * (`ctx.branchId === null`) vê também as entradas que só a rede tem, levando
 * a `/admin` (A1 da 14ª); quem tem unidade fixa, não — ela não entra em
 * `/admin`. A barra lateral e a busca da unidade leem daqui.
 */
export function menuDaUnidadeFor(
  permissions: ResolvedPermissions,
  plano: PlanoDoMenu,
  pessoa: DaPessoa | undefined,
  /** `adminDaRede`: o cargo de sistema (`mexeNaConfigDaRede(ctx)`) — é ele, não a abrangência, que vê a configuração da rede toda. */
  o: { base: string; daRede: boolean; adminDaRede?: boolean },
): MenuSection[] {
  const daUnidade = BRANCH_MENU
    .filter(e => e.key !== 'settings' || !soLeriaAsConfiguracoes(permissions, !!o.adminDaRede))
    .map(e => ({ ...e, href: `${o.base}${e.href}` }))
  return menuSectionsFor([...daUnidade, ...(o.daRede ? SO_NO_MENU_DA_REDE : [])], permissions, plano, pessoa)
}

/** O menu do portal da REDE: a mesma regra de Configurações do menu da unidade (A-CONF1 da 25ª). */
export function menuDaRedeFor(
  permissions: ResolvedPermissions,
  plano: PlanoDoMenu,
  pessoa: DaPessoa | undefined,
  o: { adminDaRede: boolean },
): MenuSection[] {
  const menu = ADMIN_MENU.filter(e => e.key !== 'settings' || !soLeriaAsConfiguracoes(permissions, !!o.adminDaRede))
  return menuSectionsFor(menu, permissions, plano, pessoa)
}

export function menuEntriesFor(
  menu: readonly MenuEntry[],
  permissions: ResolvedPermissions,
  plano?: PlanoDoMenu,
  pessoa?: DaPessoa,
): { key: string; label: string; href: string }[] {
  return menu
    .filter(e => e.visible(permissions, pessoa) && noPlano(e, plano))
    .map(e => ({
      key:   e.key,
      label: typeof e.label === 'function' ? e.label(permissions, pessoa) : e.label,
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
  plano?: PlanoDoMenu,
  pessoa?: DaPessoa,
): MenuSection[] {
  const visiveis = menu.filter(e => e.visible(permissions, pessoa) && noPlano(e, plano))
  const resolver = (e: MenuEntry) => ({
    key:   e.key,
    label: typeof e.label === 'function' ? e.label(permissions, pessoa) : e.label,
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
  pessoa?: DaPessoa,
): string[] {
  return menuEntriesFor(menu, permissions, undefined, pessoa).map(e => e.label)
}
