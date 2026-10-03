import type { ResolvedPermissions } from '@estetica-os/types'
import { ADMIN_MENU, BRANCH_MENU, menuEntriesFor } from '@/lib/menu'
import { ABAS_DE_CONFIGURACAO, ABAS_DA_REDE, ABAS_DA_UNIDADE } from '@/lib/configuracoes/abas'
import { casaComTermo } from '@/lib/busca/texto'
import type { ResultadoDaBusca } from '@/lib/busca/tipos'

/**
 * As páginas que a busca oferece: o menu do portal, as abas de Configurações e
 * as subpáginas que o menu não mostra.
 *
 * Nada de lista escrita à mão: o menu (`lib/menu.ts`) e as abas
 * (`lib/configuracoes/abas.ts`) são a fonte, com a MESMA regra de visibilidade.
 * Uma cópia aqui ofereceria, na primeira mudança, uma página que a pessoa não
 * pode abrir — ou esconderia uma que ela pode.
 */
export interface PaginaDaBusca {
  key:     string
  titulo:  string
  href:    string
  /** Outras palavras pelas quais a página é procurada. */
  apelidos: readonly string[]
}

/**
 * Como as pessoas chamam as telas. "Negócio" é a oportunidade, "usuário" é a
 * equipe — a busca entende os dois nomes.
 */
const APELIDOS: Record<string, readonly string[]> = {
  dashboard:     ['início', 'painel', 'resumo'],
  agenda:        ['agendamentos', 'horários', 'calendário'],
  clients:       ['pacientes', 'fichas de clientes'],
  planejamentos: ['planos', 'planejamento', 'checkout'],
  injetaveis:    ['toxina', 'botox', 'preenchimento'],
  inbox:         ['conversas', 'mensagens', 'whatsapp', 'instagram', 'caixa de entrada'],
  oportunidades: ['negócios', 'funil', 'crm', 'leads', 'quadro', 'vendas'],
  procedures:    ['serviços', 'catálogo'],
  pacotes:       ['sessões', 'combos'],
  notificacoes:  ['push', 'avisos', 'campanhas'],
  marketing:     ['anúncios', 'campanhas', 'meta ads'],
  templates:     ['modelos de mensagem'],
  financial:     ['contas', 'pagamentos', 'receitas', 'despesas', 'lançamentos'],
  stock:         ['produtos', 'insumos', 'lotes'],
  reports:       ['indicadores', 'métricas'],
  team:          ['usuários', 'membros', 'funcionários', 'profissionais'],
  automations:   ['fluxos', 'gatilhos'],
  settings:      ['ajustes', 'preferências'],
}

const APELIDOS_DA_ABA: Record<string, readonly string[]> = {
  permissions:  ['permissões', 'acessos', 'perfis'],
  fichas:       ['anamnese', 'formulários'],
  documentos:   ['termos', 'contratos', 'assinatura'],
  integrations: ['whatsapp', 'meta', 'instagram', 'conexões'],
  fidelidade:   ['pontos', 'recompensas', 'vouchers'],
  comissoes:    ['taxas', 'maquininha'],
  lgpd:         ['privacidade', 'exportação'],
  suporte:      ['ajuda', 'acesso do suporte', 'autorizar suporte', 'bellarisos'],
  eventos:      ['log'],
  general:      ['dados da clínica', 'cnpj', 'endereço'],
}

/**
 * Todas as páginas que esta pessoa abre, com o endereço do portal em que ela
 * está. `slug` nulo = portal da rede.
 */
export function paginasDaBusca(slug: string | null, permissions: ResolvedPermissions): PaginaDaBusca[] {
  const naRede = slug === null
  const prefixo = naRede ? '' : `/${slug}`
  const base = naRede ? '/admin' : `/${slug}`

  const menu = menuEntriesFor(naRede ? ADMIN_MENU : BRANCH_MENU, permissions)
  const paginas: PaginaDaBusca[] = menu.map(e => ({
    key:      e.key,
    titulo:   e.label,
    href:     `${prefixo}${e.href}`,
    apelidos: APELIDOS[e.key] ?? [],
  }))

  // As abas de Configurações, com a regra da tela: o portal oferece a aba, e
  // o módulo dela em MANAGE a libera.
  const abasDoPortal = naRede ? ABAS_DA_REDE : ABAS_DA_UNIDADE
  for (const aba of ABAS_DE_CONFIGURACAO) {
    if (!abasDoPortal.includes(aba.key)) continue
    if (permissions[aba.module] !== 'MANAGE') continue
    paginas.push({
      key:      `settings:${aba.key}`,
      titulo:   `Configurações → ${aba.label}`,
      href:     `${base}/settings?tab=${aba.key}`,
      apelidos: APELIDOS_DA_ABA[aba.key] ?? [],
    })
  }

  // O fechamento das comissões é página própria, dentro do financeiro.
  if (permissions.financial !== 'NONE') {
    paginas.push({
      key:      'financial:comissoes',
      titulo:   'Financeiro → Comissões',
      href:     `${base}/financeiro/comissoes`,
      apelidos: ['fechamento', 'pagar comissão', 'minhas comissões'],
    })
  }

  return paginas
}

/** As páginas que casam com o termo, como resultado da busca. */
export function paginasQueCasam(
  paginas: readonly PaginaDaBusca[], termo: string, limite = 6,
): ResultadoDaBusca[] {
  return paginas
    .filter(p => casaComTermo(termo, [p.titulo, ...p.apelidos]))
    .slice(0, limite)
    .map(p => ({ tipo: 'pagina', id: p.key, titulo: p.titulo, subtitulo: null, href: p.href }))
}
