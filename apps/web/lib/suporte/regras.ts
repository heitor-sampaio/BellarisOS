import type { ResolvedPermissions } from '@estetica-os/types'

/**
 * As regras do acesso do suporte, puras (testadas em tests/suporte-regras.test.ts).
 *
 * - **Quem autoriza quem:** o próprio membro, para si; quem é da REDE
 *   (abrangência de rede) com `settings: MANAGE`, para qualquer membro.
 *   Gente de unidade só autoriza a si mesma.
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
}

export function podeAutorizar(quem: QuemAutoriza, alvoUserId: string): boolean {
  if (!quem.internalUserId) return false
  if (quem.internalUserId === alvoUserId) return true
  return quem.branchId === null && quem.permissions.settings === 'MANAGE'
}

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
