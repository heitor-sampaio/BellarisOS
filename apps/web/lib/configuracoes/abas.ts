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
  { key: 'permissions',   label: 'Cargos',       module: 'roles'    },
  // Personalizar fichas é do PLANO da rede (2026-10-07).
  { key: 'fichas',        label: 'Fichas',       module: 'forms',     recurso: 'fichas' },
  // Termos e contratos: autoria de rede, como as fichas (módulo 'forms').
  { key: 'documentos',    label: 'Documentos',   module: 'forms',     recurso: 'documentos' },
  { key: 'integrations',  label: 'Integrações',  module: 'settings' },
  { key: 'fidelidade',    label: 'Fidelidade',   module: 'settings',  recurso: 'fidelidade' },
  // Como a comissão acontece e as taxas da maquininha: é dinheiro, 'financial'.
  { key: 'comissoes',     label: 'Comissões',    module: 'financial', recurso: 'comissoes' },
  { key: 'lgpd',          label: 'LGPD',         module: 'settings' },
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
export const MODULOS_DAS_ABAS: AppModule[] = ['settings', 'roles', 'forms', 'financial', 'clients', 'crm']

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
  ABAS_DE_CONFIGURACAO.map(t => t.key)

/** O que a unidade governa sem sair do próprio portal nem ver outra unidade. */
export const ABAS_DA_UNIDADE: readonly ChaveDeAba[] =
  ['permissions', 'fichas', 'documentos', 'integrations', 'tags', 'importacoes', 'general']
