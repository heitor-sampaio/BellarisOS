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
  { key: 'general',       label: 'Geral',        module: 'settings' },
] as const satisfies readonly { key: string; label: string; module: AppModule; recurso?: string }[]

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
  ['permissions', 'fichas', 'documentos', 'integrations', 'general']
