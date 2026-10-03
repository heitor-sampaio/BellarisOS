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
  { key: 'fichas',        label: 'Fichas',       module: 'forms'    },
  // Termos e contratos: autoria de rede, como as fichas (módulo 'forms').
  { key: 'documentos',    label: 'Documentos',   module: 'forms'    },
  { key: 'integrations',  label: 'Integrações',  module: 'settings' },
  { key: 'fidelidade',    label: 'Fidelidade',   module: 'settings' },
  // Como a comissão acontece e as taxas da maquininha: é dinheiro, 'financial'.
  { key: 'comissoes',     label: 'Comissões',    module: 'financial' },
  { key: 'lgpd',          label: 'LGPD',         module: 'settings' },
  { key: 'eventos',       label: 'Eventos',      module: 'settings' },
  { key: 'general',       label: 'Geral',        module: 'settings' },
] as const satisfies readonly { key: string; label: string; module: AppModule }[]

export type ChaveDeAba = typeof ABAS_DE_CONFIGURACAO[number]['key']

/** Todas as abas — o portal da rede. */
export const ABAS_DA_REDE: readonly ChaveDeAba[] =
  ABAS_DE_CONFIGURACAO.map(t => t.key)

/** O que a unidade governa sem sair do próprio portal nem ver outra unidade. */
export const ABAS_DA_UNIDADE: readonly ChaveDeAba[] =
  ['permissions', 'fichas', 'documentos', 'integrations', 'general']
