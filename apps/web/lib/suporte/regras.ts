import type { ResolvedPermissions } from '@estetica-os/types'

/**
 * As regras do acesso do suporte, puras (testadas em tests/suporte-regras.test.ts).
 *
 * - **Quem autoriza:** só a Admin da rede (o cargo de sistema gravado), para
 *   qualquer membro, ela mesma e outra Admin (auditoria das regras,
 *   2026-11-18: "autorizar o suporte é da Admin da rede, como a configuração
 *   da rede toda" — o Heitor: "só pela conta admin"). Até ali o próprio membro
 *   se autorizava, e quem era da rede com `settings: MANAGE` autorizava os
 *   outros (a D19 da F70 já tirava dela a conta de uma Admin).
 * - **Quem revoga:** a própria pessoa (a conta é dela; tirar o acesso é o
 *   menos arriscado) e a Admin da rede.
 * - **Dado clínico:** só quem tem `medical_records: MANAGE` pode incluí-lo —
 *   o mesmo critério de liberar prontuário num pedido de LGPD.
 * - **Duração da autorização:** 24 h, 72 h (padrão) ou 7 dias.
 * - **Duração da sessão:** 60 min, nunca além da autorização.
 */
export const HORAS_DE_AUTORIZACAO = [24, 72, 168] as const
export type HorasDeAutorizacao = typeof HORAS_DE_AUTORIZACAO[number]
export const HORAS_PADRAO: HorasDeAutorizacao = 72
export const MINUTOS_DA_SESSAO = 60

export const ROTULO_DAS_HORAS: Record<HorasDeAutorizacao, string> = {
  24: '24 horas', 72: '72 horas', 168: '7 dias',
}

interface QuemAutoriza {
  internalUserId: string | null
  branchId:       string | null
  permissions:    ResolvedPermissions
  /** Tem o cargo de sistema Admin da rede (lido do banco, `buildContext`). */
  isNetworkAdmin?: boolean
}

/** A mensagem de quando a conta é de uma Admin da rede e quem pede não é. */
export const SO_ADMIN_AUTORIZA_ADMIN = 'A conta de uma Admin da rede só outra Admin da rede autoriza ao suporte.'

/** Autorizar o suporte a entrar numa conta (qualquer uma da rede): só a Admin da rede. */
export function podeAutorizar(quem: QuemAutoriza): boolean {
  if (!quem.internalUserId) return false
  return quem.isNetworkAdmin === true
}

/** Revogar: a própria pessoa, sempre; a conta de outra pessoa, só a Admin da rede. */
export function podeRevogar(quem: QuemAutoriza, alvoUserId: string): boolean {
  if (!quem.internalUserId) return false
  if (quem.internalUserId === alvoUserId) return true
  return podeAutorizar(quem)
}

/** A recusa de autorizar, para a tela e a action. */
export const SO_A_ADMIN_AUTORIZA = 'Autorizar o suporte a entrar numa conta é só da Admin da rede.'

export function podeIncluirClinico(quem: Pick<QuemAutoriza, 'permissions'>): boolean {
  return quem.permissions.medical_records === 'MANAGE'
}

export function horasValidas(h: unknown): h is HorasDeAutorizacao {
  return (HORAS_DE_AUTORIZACAO as readonly unknown[]).includes(h)
}

/** Até quando vai a sessão: 60 min, nunca além da autorização. */
export function prazoDaSessao(agoraMs: number, autorizacaoExpiraEm: string): number {
  return Math.min(agoraMs + MINUTOS_DA_SESSAO * 60_000, Date.parse(autorizacaoExpiraEm))
}

/**
 * O nome que fica em TUDO o que a sessão de suporte grava (histórico,
 * eventos, mensagens): "Ana (via suporte: Heitor)" — o registro diz quem
 * fez de verdade, sem reescrever cada ponto que grava um nome.
 */
export function nomeComSuporte(nome: string, atendente: string): string {
  const n = nome.trim() || 'Membro'
  return `${n} (via suporte: ${atendente.trim() || 'BellarisOS'})`
}
