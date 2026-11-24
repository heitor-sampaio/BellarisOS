import { APP_MODULES } from '@estetica-os/types'
import type { AppModule, PermissionLevel } from '@estetica-os/types'
import { MODULOS_SO_DA_ADMIN } from '@/lib/permissions'

/**
 * O cargo que não dá acesso a NADA — e o cargo de sistema "Não definido"
 * (itens 20 e 21 dos itens de escopo aprovados pelo Heitor, 18/11).
 *
 * Item 20, o Heitor: "pode criar, e quem tem cargo não definido não tem
 * permissão de nada". O "Não definido" (`tenant_roles.key = 'NAO_DEFINIDO'`
 * com `is_system`, `20261021000003_cargos_modelo.sql`) passa a ser dado pela
 * Equipe, e o contexto zera tudo para quem o tem (`buildContext`).
 *
 * Item 21 ("ok"): a Equipe e a tela de Cargos avisam quando o cargo não abre
 * módulo nenhum. "Nenhum" é o que o CONTEXTO deixa (princípio 3: o que a tela
 * mostra é o que vale) — a mesma conta do `buildContext`: o plano corta o
 * módulo, Relatórios sem aba (ou só com abas fora do plano) vale nada, e a
 * Auditoria é só da Admin da rede.
 *
 * Puro: a Equipe (servidor) e a tela de Cargos (navegador) usam a mesma conta.
 */

export const NAO_DEFINIDO = 'NAO_DEFINIDO'

type CargoDaRede = { key?: string | null; is_system?: boolean | null }

/** É o cargo de sistema "Não definido"? Pela CHAVE do cargo de sistema, nunca pelo rótulo. */
export function ehCargoNaoDefinido(cargo: CargoDaRede | null | undefined): boolean {
  return !!cargo && cargo.is_system === true && cargo.key === NAO_DEFINIDO
}

/**
 * O cargo se dá pela Equipe a qualquer um que a gerencia? Os da rede, sim
 * (com a trava do "cargo acima", `lib/equipe/cargo-acima.ts`), e o "Não
 * definido", que está abaixo de todos. O Admin da rede não: só quem o tem o
 * dá (`assertRoleInTenant`, a exceção do CLAUDE.md §11).
 */
export function cargoSeDaPelaEquipe(cargo: CargoDaRede): boolean {
  return !cargo.is_system || ehCargoNaoDefinido(cargo)
}

/** Os cargos que a Equipe oferece: os da rede, na ordem em que vieram, e o "Não definido" por último. */
export function cargosQueSeDaoPelaEquipe<T extends CargoDaRede>(cargos: readonly T[]): T[] {
  const daRede = cargos.filter(c => !c.is_system)
  return [...daRede, ...cargos.filter(ehCargoNaoDefinido)]
}

/** O que o plano da rede tira do cargo: os módulos e as abas de Relatórios fora dele. */
export interface PlanoDoCargo {
  foraDoPlano: readonly string[]
  abasForaDoPlano: readonly string[]
}

export interface AcessosGravados {
  /** As linhas de `role_permissions` do cargo. */
  linhas: readonly { module: string; level: PermissionLevel | string }[]
  /** As abas de Relatórios do cargo (`role_report_tabs`). */
  abas: readonly string[]
  /** O cargo é o "Não definido": nada vale, venha a matriz que vier. */
  naoDefinido?: boolean
}

/** Os módulos que o cargo ABRE de verdade, na ordem dos módulos. */
export function modulosQueOCargoAbre(cargo: AcessosGravados, plano: PlanoDoCargo): AppModule[] {
  if (cargo.naoDefinido) return []
  const nivel = new Map(cargo.linhas.map(l => [l.module, l.level]))
  const abasQueValem = cargo.abas.filter(a => !plano.abasForaDoPlano.includes(a))
  return APP_MODULES.filter(m => {
    if (MODULOS_SO_DA_ADMIN.includes(m) || plano.foraDoPlano.includes(m)) return false
    const n = nivel.get(m) ?? 'NONE'
    if (n === 'NONE') return false
    if (m === 'reports' && abasQueValem.length === 0) return false
    return true
  })
}

/** O cargo não abre módulo nenhum: quem o tem entra e não vê nada. */
export function cargoSemAcesso(cargo: AcessosGravados, plano: PlanoDoCargo): boolean {
  return modulosQueOCargoAbre(cargo, plano).length === 0
}

/** A linha e a edição da Equipe: a pessoa cujo cargo não abre nada. */
export const MEMBRO_SEM_ACESSO = 'Sem acesso a nenhum módulo: ela entra e não vê nada.'

/**
 * E ela atende (decisão do Claude pelo princípio 3, item 20): o "Atende" é
 * por unidade e não é permissão (CLAUDE.md §11), então ela segue aparecendo
 * como profissional — a tela diz isso, em vez de tirá-la da agenda calada.
 */
export const MEMBRO_SEM_ACESSO_QUE_ATENDE =
  'Continua no “Atende”: aparece na agenda para receber horários, mas não abre a agenda nem os atendimentos.'

/** A tela de Cargos: o cargo que não abre nada. */
export const CARGO_SEM_ACESSO = 'Sem acesso a nenhum módulo: quem tem este cargo entra e não vê nada.'

/** O aviso da Equipe para a pessoa, com o "Atende" quando ela atende. */
export function avisoDoMembroSemAcesso(atende: boolean): string {
  return atende ? `${MEMBRO_SEM_ACESSO} ${MEMBRO_SEM_ACESSO_QUE_ATENDE}` : MEMBRO_SEM_ACESSO
}

/**
 * O painel (Dashboard) de quem não tem nada para ver nele: sem cargo, o cargo
 * que não abre nada, ou o que abre só o que não tem atalho no painel.
 */
export function textoDoPainelSemAcesso(o: { semCargo: boolean; semAcesso: boolean }): string {
  if (o.semCargo) return 'Você está sem cargo e ainda não tem acesso a nenhum módulo. Quem tem a Equipe em Gerenciar define o seu cargo.'
  if (o.semAcesso) return 'O seu cargo não dá acesso a nenhum módulo. Quem tem a Equipe em Gerenciar pode dar a você outro cargo.'
  return 'O que o seu cargo abre está no menu.'
}
