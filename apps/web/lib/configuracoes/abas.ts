import type { AppModule } from '@estetica-os/types'
import { CONFIG_DA_REDE } from '@/lib/configuracao-da-rede'
import { MODULE_LEVELS } from '@/lib/permissions'

/**
 * As abas de Configurações — uma lista só, lida pela tela
 * (`app/_shared/configuracoes.tsx`) e pela busca universal, que oferece
 * "Configurações → Fidelidade" como destino.
 *
 * Saiu de dentro da tela porque ela é só de servidor (lê o banco), e a busca
 * monta o catálogo de páginas no navegador. Duas cópias da lista divergiriam
 * na primeira aba nova: a busca levaria a uma aba que não existe, ou não
 * acharia a que existe.
 *
 * Cada aba declara o módulo que a governa: a tela é uma só, mas os assuntos são
 * de três módulos diferentes desde a quebra de `settings`. Abrir a aba pede
 * o módulo no nível que abre (`nivelQueAbreAAba`).
 */
export const ABAS_DE_CONFIGURACAO = [
  { key: 'unidades',      label: 'Unidades',     module: 'settings' },
  // A unidade do PORTAL (H7, 2026-11-01): os dados, o horário e as salas dela.
  // Só no portal da unidade — na rede, cada unidade se abre em Unidades.
  { key: 'unidade',       label: 'Unidade',      module: 'settings' },
  { key: 'permissions',   label: 'Cargos',       module: 'roles'    },
  // Personalizar fichas é do PLANO da rede (2026-10-07).
  { key: 'fichas',        label: 'Fichas',       module: 'forms',     recurso: 'fichas' },
  // Os modelos de documento (termos e contratos): o módulo deles, `documents`
  // (o Heitor, 2026-11-16: a permissão de Documentos é a dos modelos).
  { key: 'documentos',    label: 'Documentos',   module: 'documents', recurso: 'documentos' },
  { key: 'integrations',  label: 'Integrações',  module: 'settings' },
  { key: 'fidelidade',    label: 'Fidelidade',   module: 'settings',  recurso: 'fidelidade' },
  // Como a comissão acontece e as taxas da maquininha: é dinheiro, 'financial'.
  // A2 da 14ª (princípio 7): "Comissões" escondia as maquininhas, o Pix e o
  // crediário, e o próximo passo do setup ("Taxas da maquininha") levava a uma
  // aba de outro nome. O nome diz as duas coisas; nada saiu da aba.
  { key: 'comissoes',     label: 'Comissões e taxas', module: 'financial', recurso: 'comissoes' },
  // A LGPD é de quem RESPONDE ao pedido: Clientes em Gerenciar (a cliente é
  // da rede; revisão de 24/11, Q09 do catálogo de Clientes — "Configurações em
  // Gerenciar" era o critério de antes de 18/11) — e de quem libera o
  // prontuário do pacote, o Prontuário em Gerenciar (C31, F70). O aviso e a
  // ficha levam a ela (`caminhoDaAbaLgpd`).
  { key: 'lgpd',          label: 'LGPD',         module: 'clients',   alternativas: ['medical_records'] },
  // A assinatura do BellarisOS (plano, faturas, pagar). Da rede.
  { key: 'assinatura',    label: 'Assinatura',   module: 'settings' },
  // O suporte do BellarisOS: autorizar o acesso e ver o que ele fez. Da rede.
  { key: 'suporte',       label: 'Suporte',      module: 'settings' },
  // O que roda em segundo plano e demora (o histórico do WhatsApp…). Da rede.
  { key: 'lotes',         label: 'Ações em lote', module: 'settings' },
  // O importador de contatos (CSV, 2026-10-13): quem cadastra clientes OU
  // trabalha o CRM — a SDR que só tem o CRM importa a lista de leads dela.
  // As tags da rede (2026-10-13): um vocabulário só para a ficha e o CRM.
  { key: 'tags',          label: 'Tags',         module: 'clients',   alternativas: ['crm'] },
  { key: 'importacoes',   label: 'Importações',  module: 'clients',   alternativas: ['crm'] },
  { key: 'general',       label: 'Geral',        module: 'settings' },
] as const satisfies readonly { key: string; label: string; module: AppModule; recurso?: string; alternativas?: readonly AppModule[] }[]

/**
 * As abas em GRUPOS (CF1, docs/revisao.md — o Heitor, 2026-11-13: "Concordo";
 * princípio 7: nada sai, muda a organização). Cada aba continua pedindo o
 * módulo dela; o grupo sem nenhuma aba visível some. No portal da unidade, a
 * aba Unidade fica em "A rede", ao lado de Geral: é o mesmo assunto (os dados
 * de quem a pessoa é), e um grupo só para ela seria um grupo de uma aba.
 * O "Eventos" saiu (CF2): mora nas Automações, como "O que já aconteceu".
 */
export const GRUPOS_DE_ABAS: readonly { key: string; label: string; abas: readonly ChaveDeAba[] }[] = [
  { key: 'rede',        label: 'A rede',          abas: ['unidade', 'general', 'unidades', 'assinatura'] },
  { key: 'equipe',      label: 'Equipe e acesso', abas: ['permissions', 'suporte'] },
  { key: 'atendimento', label: 'Atendimento',     abas: ['fichas', 'documentos'] },
  { key: 'clientes',    label: 'Clientes',        abas: ['tags', 'fidelidade', 'importacoes', 'lgpd'] },
  { key: 'dinheiro',    label: 'Dinheiro',        abas: ['comissoes'] },
  { key: 'conexoes',    label: 'Conexões',        abas: ['integrations'] },
  { key: 'avancado',    label: 'Avançado',        abas: ['lotes'] },
]

/** As abas visíveis, nos grupos e na ordem deles; grupo vazio não volta. */
export function abasEmGrupos<T extends { key: string }>(abas: readonly T[]): { key: string; label: string; abas: T[] }[] {
  return GRUPOS_DE_ABAS
    .map(g => ({ key: g.key, label: g.label, abas: g.abas.flatMap(k => abas.filter(a => a.key === k)) }))
    .filter(g => g.abas.length > 0)
}

/**
 * A aba que abre sem `?tab=` (CU-07): a primeira NA ORDEM DA TELA (os grupos)
 * que é da pessoa — senão, a primeira da tela. A10 da 34ª simulação: a conta
 * corria na ordem da lista, e a Admin da rede abria em Unidades com Geral
 * antes dela na tela. `ehDela`: quem não é a Admin da rede não tem as abas da
 * rede toda (`ABAS_DA_REDE_TODA`), que só dizem de quem são.
 */
export function abaInicial<T extends { key: ChaveDeAba }>(abas: readonly T[], ehDela: (k: ChaveDeAba) => boolean): ChaveDeAba {
  const naTela = abasEmGrupos(abas).flatMap(g => g.abas)
  return (naTela.find(a => ehDela(a.key)) ?? naTela[0] ?? abas[0])!.key
}

/**
 * O nível que abre a aba do módulo: o Gerenciar, se o módulo o oferece; senão,
 * o Ver — as Fichas e os Cargos (o Heitor, 25/11, "8 - a": "a pessoa abre a aba
 * e lê, como já acontece"). Quem chama `abaLiberada` passa `m => can(ctx, m, nivelQueAbreAAba(m))`.
 */
export function nivelQueAbreAAba(m: AppModule): 'VIEW' | 'MANAGE' {
  return (MODULE_LEVELS[m] ?? []).includes('MANAGE') ? 'MANAGE' : 'VIEW'
}

/**
 * A aba abre para quem tem o módulo dela no nível que abre — ou um dos alternativos
 * (a de Importações: `clients` ou `crm`). A tela, a busca e o menu usam esta.
 */
export function abaLiberada(aba: object, gerencia: (m: AppModule) => boolean): boolean {
  const a = aba as { module: AppModule; alternativas?: readonly AppModule[] }
  return gerencia(a.module) || (a.alternativas ?? []).some(gerencia)
}

/** Os módulos que abrem alguma aba (a página de Configurações confere isto). */
export const MODULOS_DAS_ABAS: AppModule[] = ['settings', 'roles', 'forms', 'documents', 'financial', 'clients', 'crm', 'medical_records']

/**
 * A aba é de uma funcionalidade do PLANO (lib/planos/recursos.ts)? Fora dele,
 * a aba some — `plano` é o `ctx.plano` (null = sem plano = tudo).
 */
export function abaNoPlano(aba: object, plano: { funcionalidades: readonly string[] } | null | undefined): boolean {
  const recurso = (aba as { recurso?: string }).recurso
  return !recurso || !plano || plano.funcionalidades.includes(recurso)
}

export type ChaveDeAba = typeof ABAS_DE_CONFIGURACAO[number]['key']

/** Todas as abas — o portal da rede. */
export const ABAS_DA_REDE: readonly ChaveDeAba[] =
  ABAS_DE_CONFIGURACAO.map(t => t.key).filter(k => k !== 'unidade')

/**
 * As abas do portal da unidade. A Unidade é DELA; as outras (as Importações também, C73)
 * são da rede toda (`ABAS_DA_REDE_TODA`) e, para quem não é a Admin da rede,
 * dizem isso em vez de abrir o editor (H7, 2026-11-01; o Heitor, 18/11).
 * A LGPD entrou (D8 da 25ª): quem libera o prontuário (Prontuário em
 * Gerenciar) pode ter só a unidade, e a aba é o lugar do "Liberar".
 */
export const ABAS_DA_UNIDADE: readonly ChaveDeAba[] =
  ['unidade', 'permissions', 'fichas', 'documentos', 'integrations', 'tags', 'importacoes', 'lgpd', 'general']

/**
 * As abas que são configuração da REDE TODA — só da Admin da rede desde 18/11
 * (o Heitor: "só pela conta admin"; era de quem tinha "A rede inteira", H7 de
 * 2026-11-01). Quem não é a Admin da rede abre a aba e lê "Esta configuração
 * é só da Admin da rede" — sem o editor (a action também recusa:
 * `recusaDaConfigDaRede`). Fora daqui fica
 * só a Unidade (a dela). As Importações entraram (C73 do levantamento das
 * regras, F70; H8, 2ª volta: "Importações é da rede, ela que vai importar os
 * seus clientes ou o que for, e na importação poder escolher se aquilo
 * pertence a uma unidade").
 *
 * A LGPD fica de fora: não é configuração, é o pedido da cliente, e quem
 * libera o prontuário é quem tem o Prontuário em Gerenciar (C31,
 * `docs/regras/crm-inbox.md`; `reviewMedicalData` não pede o cargo). Na lista,
 * a aba escondia o "Liberar" que a action aceita.
 */
export const ABAS_DA_REDE_TODA: readonly ChaveDeAba[] =
  ABAS_DE_CONFIGURACAO.map(t => t.key).filter(k => k !== 'unidade' && k !== 'lgpd')

/**
 * O que "Configurações" quer dizer no resumo do cargo (A7 da 7ª simulação,
 * 2026-11-05; princípio 3): quem não tem Configurações em Gerenciar chega à
 * tela só pelas abas dos outros módulos — o Financeiro, só a de Comissões (com
 * as taxas da maquininha). O resumo dizia "Configurações", como se fosse tudo.
 * Nulo = a tela inteira (Configurações em Gerenciar) ou nenhuma aba.
 *
 * Conta só as abas que a pessoa USA sem ser a Admin da rede (A-CONF1 da 25ª):
 * as da rede toda dizem "Esta configuração é só da Admin da rede.", não contam.
 * Era uma opção (`soAsDela`) que a tela de Cargos sempre ligava; o caminho sem
 * ela saiu (o Heitor, 25/11: "ok mas tenha certeza absoluta que ninguem usa").
 */
export function rotuloDasAbasAlcancadas(
  abas: readonly ChaveDeAba[], gerencia: (m: AppModule) => boolean,
): string | null {
  if (gerencia('settings')) return null
  const nomes = ABAS_DE_CONFIGURACAO
    .filter(a => abas.includes(a.key) && abaLiberada(a, gerencia))
    .filter(a => !ABAS_DA_REDE_TODA.includes(a.key))
    .map(a => a.label)
  if (!nomes.length) return null
  const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
  return `Configurações (só ${lista})`
}

/**
 * A aba pedida que só existe nas Configurações da REDE, para quem é da rede e
 * está no portal da unidade (A1 da 14ª; princípio 7 e CLAUDE.md §1, "otimize
 * para a clínica única"): a dona lia "A aba Comissões fica nas Configurações
 * da clínica" sem link. Nulo = a aba abre aqui, ou quem pede tem unidade fixa
 * (não entra em /admin).
 */
export function linkDaAbaNaRede(pedida: string, o: { noPortal: readonly ChaveDeAba[]; unidadeFixa: boolean }): { href: string; rotulo: string } | null {
  const chave = chaveDaAbaPedida(pedida)
  const aba = ABAS_DE_CONFIGURACAO.find(a => a.key === chave)
  if (!aba || o.unidadeFixa || o.noPortal.includes(aba.key) || !ABAS_DA_REDE.includes(aba.key)) return null
  return { href: `/admin/settings?tab=${aba.key}`, rotulo: `Abrir ${aba.label} nas Configurações da rede` }
}

/**
 * As abas que só a REDE tem (as que o portal da unidade não oferece), com a
 * permissão e o plano de cada uma — a lista "Na clínica toda" das
 * Configurações da unidade, para quem é da rede (A1 da 14ª). É a mesma conta
 * da busca (`SO_NA_REDE`, lib/busca/paginas.ts).
 */
export function abasSoDaRede(
  gerencia: (m: AppModule) => boolean, plano: { funcionalidades: readonly string[] } | null | undefined,
): { key: ChaveDeAba; label: string; href: string }[] {
  return ABAS_DE_CONFIGURACAO
    .filter(a => ABAS_DA_REDE.includes(a.key) && !ABAS_DA_UNIDADE.includes(a.key))
    .filter(a => abaLiberada(a, gerencia) && abaNoPlano(a, plano))
    .map(a => ({ key: a.key, label: a.label, href: `/admin/settings?tab=${a.key}` }))
}

/**
 * Os nomes que um link antigo (ou digitado) usa para uma aba (A11 da 12ª):
 * `?tab=commissions` abria as Tags sem dizer nada.
 */
const APELIDOS_DE_ABA: Record<string, ChaveDeAba> = {
  commissions: 'comissoes', comissao: 'comissoes', roles: 'permissions', cargos: 'permissions',
  units: 'unidades', integracoes: 'integrations', loyalty: 'fidelidade', geral: 'general',
  // A29 da 16ª: a aba se chama "Ações em lote"; quem cola o nome dela chega a ela.
  'acoes-em-lote': 'lotes',
}

/** A chave da aba pedida na URL, com os apelidos resolvidos. */
export function chaveDaAbaPedida(pedida: string | undefined): string | undefined {
  if (!pedida) return undefined
  return APELIDOS_DE_ABA[pedida] ?? pedida
}

/**
 * Por que a aba pedida não abriu (A11 da 12ª, princípio 3) — a tela abre a
 * primeira que a pessoa alcança e DIZ isso, em vez de trocar calada. Nulo = a
 * aba abre.
 */
export function motivoDaAbaFechada(pedida: string, o: {
  /** As abas deste portal. */
  noPortal: readonly ChaveDeAba[]
  gerencia: (m: AppModule) => boolean
  noPlano: (aba: object) => boolean
  /** Quem tem unidade fixa (as abas da rede, para ela, são da clínica toda). */
  unidadeFixa: boolean
  /** O nome do módulo, como a tela de Cargos o mostra. */
  nomeDoModulo: (m: AppModule) => string
  /** A aba que abriu no lugar. */
  abriu: string
  /**
   * O cargo de sistema Admin da rede (`mexeNaConfigDaRede(ctx)`). `false`: a
   * aba da rede toda diz a regra (A-CONF2 da 25ª; CLAUDE.md §11), não o módulo.
   */
  souAdmin?: boolean
  /** As Admins ativas da rede, pelo nome — o "Quem muda". */
  quemMuda?: readonly string[]
}): string | null {
  const aba = ABAS_DE_CONFIGURACAO.find(a => a.key === pedida)
  if (!aba) return `A aba “${pedida}” não existe. Você está na aba ${o.abriu}.`
  // A-CONF2 da 25ª: quem muda, pelo nome. A22 da 32ª: também na aba que fica só na rede.
  const nomes = o.quemMuda ?? []
  const quem = nomes.length ? ` Quem muda: ${nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`}.` : ''
  if (!o.noPortal.includes(aba.key)) {
    return o.unidadeFixa
      ? `A aba ${aba.label} é da rede toda: quem muda é a Admin da rede.${quem} Você está na aba ${o.abriu}.`
      : `A aba ${aba.label} fica nas Configurações da rede. Você está na aba ${o.abriu}.`
  }
  if (!o.noPlano(aba)) return `A aba ${aba.label} não está no plano da rede. Você está na aba ${o.abriu}.`
  if (o.souAdmin === false && ABAS_DA_REDE_TODA.includes(aba.key)) {
    return `A aba ${aba.label}: ${CONFIG_DA_REDE}${quem} Você está na aba ${o.abriu}.`
  }
  if (!abaLiberada(aba, o.gerencia)) {
    return `A aba ${aba.label} pede ${o.nomeDoModulo(aba.module)} em ${nivelQueAbreAAba(aba.module) === 'VIEW' ? 'Ver' : 'Gerenciar'} no cargo, e o seu não tem. Você está na aba ${o.abriu}.`
  }
  return null
}
