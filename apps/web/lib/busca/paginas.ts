import type { ResolvedPermissions, ResolvedScopes } from '@estetica-os/types'
import { ADMIN_MENU, BRANCH_MENU, SO_NO_MENU_DA_REDE, menuEntriesFor } from '@/lib/menu'
import { ABAS_DE_CONFIGURACAO, ABAS_DA_REDE, ABAS_DA_UNIDADE, abaNoPlano, abaLiberada } from '@/lib/configuracoes/abas'
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
  documentos:    ['termos', 'contratos', 'assinaturas'],
  inbox:         ['conversas', 'mensagens', 'whatsapp', 'instagram', 'caixa de entrada'],
  oportunidades: ['negócios', 'funil', 'crm', 'leads', 'quadro', 'vendas'],
  procedures:    ['serviços', 'catálogo'],
  pacotes:       ['sessões', 'combos'],
  notificacoes:  ['push', 'avisos', 'campanhas'],
  marketing:     ['anúncios', 'campanhas', 'meta ads'],
  templates:     ['modelos de mensagem'],
  financial:     ['contas', 'pagamentos', 'receitas', 'despesas', 'lançamentos'],
  fechamento:    ['caixa', 'fechar o caixa', 'conferência do dia'],
  stock:         ['produtos', 'insumos', 'lotes'],
  reports:       ['indicadores', 'métricas'],
  team:          ['usuários', 'membros', 'funcionários', 'profissionais'],
  automations:   ['fluxos', 'gatilhos'],
  settings:      ['ajustes', 'preferências'],
}

/**
 * As abas também carregam o que mora DENTRO delas (J-13, 2026-10-30): "sala" só
 * oferecia "Cadastrar sala como cliente", e as salas ficam na página de cada
 * unidade (Configurações → Unidades).
 */
const APELIDOS_DA_ABA: Record<string, readonly string[]> = {
  unidades:     ['salas', 'filiais', 'horário de funcionamento'],
  unidade:      ['salas', 'horário de funcionamento', 'endereço da unidade'],
  permissions:  ['permissões', 'acessos', 'perfis'],
  fichas:       ['anamnese', 'formulários'],
  documentos:   ['termos', 'contratos', 'assinatura'],
  integrations: ['whatsapp', 'meta', 'instagram', 'conexões'],
  fidelidade:   ['pontos', 'recompensas', 'vouchers'],
  comissoes:    ['taxas', 'maquininha', 'comissão'],
  lgpd:         ['privacidade', 'exportação'],
  suporte:      ['ajuda', 'acesso do suporte', 'autorizar suporte', 'bellarisos'],
  eventos:      ['log'],
  assinatura:   ['plano do sistema', 'fatura', 'mensalidade'],
  lotes:        ['histórico do whatsapp', 'tarefas em segundo plano'],
  tags:         ['etiquetas', 'marcadores'],
  importacoes:  ['importar', 'planilha', 'csv'],
  general:      ['dados da clínica', 'cnpj', 'endereço'],
}

/**
 * O apelido que é uma PARTE da tela leva à parte (A3 da 5ª simulação): "sala"
 * abria o topo de Configurações → Unidades, e as salas ficavam no fim da página
 * de cada unidade. A tela tem a seção com este id.
 */
const ANCORA_DO_APELIDO: Record<string, string> = {
  salas: '#salas',
}

/**
 * Duas telas achadas pelo MESMO apelido dizem qual é qual (A18 da 8ª
 * simulação: "Termos" abria Documentos — os emitidos — e a dona procurava os
 * modelos, em Configurações).
 */
const SUBTITULO_PELO_APELIDO: Record<string, string> = {
  documentos:            'Os termos e contratos emitidos e assinados',
  'settings:documentos': 'Os modelos de termo e contrato (a configuração)',
  oportunidades:         'O quadro das oportunidades',
}

/**
 * As abas de Configurações que só existem no portal da REDE. No portal da
 * unidade, quem é da rede (A18 da 8ª: a dona procurou "Taxas" e não achou
 * nada) as acha com o endereço da rede; quem tem unidade fixa, não — não abre.
 */
const SO_NA_REDE: readonly string[] = ABAS_DA_REDE.filter(k => !ABAS_DA_UNIDADE.includes(k))

/**
 * Todas as páginas que esta pessoa abre, com o endereço do portal em que ela
 * está. `slug` nulo = portal da rede.
 */
export function paginasDaBusca(
  slug: string | null, permissions: ResolvedPermissions,
  /** O plano da rede (`ctx.plano`): página de funcionalidade fora dele não é oferecida. */
  plano?: { funcionalidades: readonly string[] } | null,
  /** O escopo de cada módulo: o Fechamento do dia pede o financeiro de todos (D6). */
  scopes?: Partial<ResolvedScopes>,
  /** Quem busca é da REDE (`ctx.branchId === null`): no portal da unidade, acha também o que é só da rede. */
  opcoes: { daRede?: boolean } = {},
): PaginaDaBusca[] {
  const naRede = slug === null
  const prefixo = naRede ? '' : `/${slug}`
  const base = naRede ? '/admin' : `/${slug}`

  const menu = menuEntriesFor(naRede ? ADMIN_MENU : BRANCH_MENU, permissions, plano, scopes)
  const paginas: PaginaDaBusca[] = menu.map(e => ({
    key:      e.key,
    titulo:   e.label,
    href:     `${prefixo}${e.href}`,
    apelidos: APELIDOS[e.key] ?? [],
  }))

  // A1 da 14ª: no portal da unidade, quem é da rede acha também as entradas
  // que só o menu da rede tem (Automações, Notificações…), com o endereço da
  // rede — a mesma lista do menu da unidade (`SO_NO_MENU_DA_REDE`).
  if (!naRede && opcoes.daRede) {
    for (const e of menuEntriesFor(SO_NO_MENU_DA_REDE, permissions, plano, scopes)) {
      paginas.push({ key: e.key, titulo: e.label, href: e.href, apelidos: APELIDOS[e.key] ?? [] })
    }
  }

  // As abas de Configurações, com a regra da tela: o portal oferece a aba, e
  // o módulo dela em MANAGE a libera.
  const abasDoPortal = naRede ? ABAS_DA_REDE : ABAS_DA_UNIDADE
  for (const aba of ABAS_DE_CONFIGURACAO) {
    if (!abasDoPortal.includes(aba.key)) continue
    if (!abaLiberada(aba, m => permissions[m] === 'MANAGE')) continue
    if (!abaNoPlano(aba, plano)) continue
    paginas.push({
      key:      `settings:${aba.key}`,
      titulo:   `Configurações → ${aba.label}`,
      href:     `${base}/settings?tab=${aba.key}`,
      apelidos: APELIDOS_DA_ABA[aba.key] ?? [],
    })
  }

  // No portal da unidade, quem é da rede acha também as abas que só a rede
  // tem (as taxas, a fidelidade…), com o endereço da rede (A18 da 8ª).
  if (!naRede && opcoes.daRede) {
    for (const aba of ABAS_DE_CONFIGURACAO) {
      if (!SO_NA_REDE.includes(aba.key)) continue
      if (!abaLiberada(aba, m => permissions[m] === 'MANAGE')) continue
      if (!abaNoPlano(aba, plano)) continue
      paginas.push({
        key:      `settings:${aba.key}`,
        titulo:   `Configurações → ${aba.label}`,
        href:     `/admin/settings?tab=${aba.key}`,
        apelidos: APELIDOS_DA_ABA[aba.key] ?? [],
      })
    }
  }

  // A configuração dos FUNIS (A18 da 8ª: "Funil" abria o quadro, e a
  // configuração é a janela "Configurar funis" dele): quem gerencia o CRM, com
  // as oportunidades no plano. No portal da unidade, só quem é da rede (H7: o
  // "Configurar funis" some do quadro da unidade fixa).
  const quadro = paginas.find(p => p.key === 'oportunidades')
  if (quadro && permissions.crm === 'MANAGE' && (naRede || opcoes.daRede)) {
    paginas.push({
      key:      'oportunidades:funis',
      titulo:   'Oportunidades → Configurar funis',
      href:     `${quadro.href}?configurar=funis`,
      apelidos: ['funil', 'funis', 'etapas', 'motivos de perda', 'origens das oportunidades'],
    })
  }

  // O fechamento das comissões é página própria, dentro do financeiro.
  if (permissions.financial !== 'NONE') {
    paginas.push({
      key:      'financial:comissoes',
      titulo:   'Financeiro → Comissões',
      href:     `${base}/financeiro/comissoes`,
      apelidos: ['fechamento', 'comissão', 'pagar comissão', 'minhas comissões'],
    })
  }

  return paginas
}

/**
 * As páginas que casam com o termo, como resultado da busca. Achada só pelo
 * apelido, a linha diz qual ("Configurações → Unidades" · "Salas"): sem isso,
 * a pessoa que procurou a sala não entende por que a tela de unidades apareceu.
 */
export function paginasQueCasam(
  paginas: readonly PaginaDaBusca[], termo: string, limite = 6,
): ResultadoDaBusca[] {
  return paginas
    .filter(p => casaComTermo(termo, [p.titulo, ...p.apelidos]))
    .slice(0, limite)
    .map(p => {
      const apelido = apelidoQueCasou(p, termo)
      const ancora = apelido ? ANCORA_DO_APELIDO[apelido.toLowerCase()] ?? '' : ''
      const subtitulo = apelido ? (SUBTITULO_PELO_APELIDO[p.key] ?? apelido) : null
      return { tipo: 'pagina' as const, id: p.key, titulo: p.titulo, subtitulo, href: p.href + ancora }
    })
}

function apelidoQueCasou(p: PaginaDaBusca, termo: string): string | null {
  if (casaComTermo(termo, [p.titulo])) return null
  const a = p.apelidos.find(x => casaComTermo(termo, [x]))
  return a ? a.charAt(0).toUpperCase() + a.slice(1) : null
}
