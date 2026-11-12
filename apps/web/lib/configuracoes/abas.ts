import type { AppModule } from '@estetica-os/types'

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
 * MANAGE nesse módulo.
 */
export const ABAS_DE_CONFIGURACAO = [
  { key: 'unidades',      label: 'Unidades',     module: 'settings' },
  // A unidade do PORTAL (H7, 2026-11-01): os dados, o horário e as salas dela.
  // Só no portal da unidade — na rede, cada unidade se abre em Unidades.
  { key: 'unidade',       label: 'Unidade',      module: 'settings' },
  { key: 'permissions',   label: 'Cargos',       module: 'roles'    },
  // Personalizar fichas é do PLANO da rede (2026-10-07).
  { key: 'fichas',        label: 'Fichas',       module: 'forms',     recurso: 'fichas' },
  // Termos e contratos: autoria de rede, como as fichas (módulo 'forms').
  { key: 'documentos',    label: 'Documentos',   module: 'forms',     recurso: 'documentos' },
  { key: 'integrations',  label: 'Integrações',  module: 'settings' },
  { key: 'fidelidade',    label: 'Fidelidade',   module: 'settings',  recurso: 'fidelidade' },
  // Como a comissão acontece e as taxas da maquininha: é dinheiro, 'financial'.
  { key: 'comissoes',     label: 'Comissões',    module: 'financial', recurso: 'comissoes' },
  // Quem libera o prontuário do pacote (Prontuário em Gerenciar) também abre
  // a aba (C31, F70): o pedido com o prontuário avisava só Configurações, e
  // quem podia liberar não chegava ao botão.
  { key: 'lgpd',          label: 'LGPD',         module: 'settings',  alternativas: ['medical_records'] },
  // A assinatura do BellarisOS (plano, faturas, pagar). Da rede.
  { key: 'assinatura',    label: 'Assinatura',   module: 'settings' },
  // O suporte do BellarisOS: autorizar o acesso e ver o que ele fez. Da rede.
  { key: 'suporte',       label: 'Suporte',      module: 'settings' },
  { key: 'eventos',       label: 'Eventos',      module: 'settings' },
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
 * A aba abre para quem tem o módulo dela em MANAGE — ou um dos alternativos
 * (a de Importações: `clients` ou `crm`). A tela, a busca e o menu usam esta.
 */
export function abaLiberada(aba: object, gerencia: (m: AppModule) => boolean): boolean {
  const a = aba as { module: AppModule; alternativas?: readonly AppModule[] }
  return gerencia(a.module) || (a.alternativas ?? []).some(gerencia)
}

/** Os módulos que abrem alguma aba (a página de Configurações confere isto). */
export const MODULOS_DAS_ABAS: AppModule[] = ['settings', 'roles', 'forms', 'financial', 'clients', 'crm', 'medical_records']

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
 * As abas do portal da unidade. A Unidade e as Importações são DELA; as outras
 * são da clínica toda (`ABAS_DA_CLINICA_TODA`) e, para quem tem unidade fixa,
 * dizem isso em vez de abrir o editor (H7, 2026-11-01).
 */
export const ABAS_DA_UNIDADE: readonly ChaveDeAba[] =
  ['unidade', 'permissions', 'fichas', 'documentos', 'integrations', 'tags', 'importacoes', 'general']

/**
 * As abas que são configuração da CLÍNICA TODA (H7, decisão do Heitor,
 * 2026-11-01: "gerente de uma unidade só mexe no que é da unidade"). Quem tem
 * unidade fixa abre a aba e lê "Esta configuração é da clínica toda" — sem o
 * editor (a action também recusa: `recusaDaConfigDaClinica`). Fora daqui ficam
 * a Unidade (a dela) e as Importações (para a unidade dela).
 */
export const ABAS_DA_CLINICA_TODA: readonly ChaveDeAba[] =
  ABAS_DE_CONFIGURACAO.map(t => t.key).filter(k => k !== 'unidade' && k !== 'importacoes')

/**
 * O que "Configurações" quer dizer no resumo do cargo (A7 da 7ª simulação,
 * 2026-11-05; princípio 3): quem não tem Configurações em Gerenciar chega à
 * tela só pelas abas dos outros módulos — o Financeiro, só a de Comissões (com
 * as taxas da maquininha). O resumo dizia "Configurações", como se fosse tudo.
 * Nulo = a tela inteira (Configurações em Gerenciar) ou nenhuma aba.
 */
export function rotuloDasAbasAlcancadas(
  abas: readonly ChaveDeAba[], gerencia: (m: AppModule) => boolean,
): string | null {
  if (gerencia('settings')) return null
  const nomes = ABAS_DE_CONFIGURACAO
    .filter(a => abas.includes(a.key) && abaLiberada(a, gerencia))
    .map(a => (a.key === 'comissoes' ? 'Comissões e taxas' : a.label))
  if (!nomes.length) return null
  const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
  return `Configurações (só ${lista})`
}

/**
 * Os nomes que um link antigo (ou digitado) usa para uma aba (A11 da 12ª):
 * `?tab=commissions` abria as Tags sem dizer nada.
 */
const APELIDOS_DE_ABA: Record<string, ChaveDeAba> = {
  commissions: 'comissoes', comissao: 'comissoes', roles: 'permissions', cargos: 'permissions',
  units: 'unidades', integracoes: 'integrations', loyalty: 'fidelidade', geral: 'general',
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
}): string | null {
  const aba = ABAS_DE_CONFIGURACAO.find(a => a.key === pedida)
  if (!aba) return `A aba “${pedida}” não existe. Abrimos ${o.abriu}.`
  if (!o.noPortal.includes(aba.key)) {
    return o.unidadeFixa
      ? `A aba ${aba.label} é da clínica toda: quem muda é quem administra a rede. Abrimos ${o.abriu}.`
      : `A aba ${aba.label} fica nas Configurações da rede. Abrimos ${o.abriu}.`
  }
  if (!o.noPlano(aba)) return `A aba ${aba.label} não está no plano da rede. Abrimos ${o.abriu}.`
  if (!abaLiberada(aba, o.gerencia)) {
    return `A aba ${aba.label} pede ${o.nomeDoModulo(aba.module)} em Gerenciar no cargo, e o seu não tem. Abrimos ${o.abriu}.`
  }
  return null
}
