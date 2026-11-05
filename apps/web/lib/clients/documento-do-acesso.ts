/**
 * O documento que prova quem é a cliente e vira a senha inicial do app: o CPF
 * (só os dígitos) ou, sem CPF, o passaporte/RNE como está na ficha (decisão 1
 * do Heitor, 2026-11-05). Puro: a tela, a action e o Copilot dizem o mesmo.
 */
export type DocumentoDoAcesso = { tipo: 'CPF' | 'PASSAPORTE' | 'RNE'; numero: string }

/** O documento da ficha para o acesso: o CPF de 11 dígitos, senão o passaporte/RNE. Nulo sem nenhum. */
export function documentoDoAcesso(c: {
  document?: string | null; documento_tipo?: string | null; documento_numero?: string | null
}): DocumentoDoAcesso | null {
  const cpf = (c.document ?? '').replace(/\D/g, '')
  if (cpf.length === 11) return { tipo: 'CPF', numero: cpf }
  const n = (c.documento_numero ?? '').trim()
  if (n && (c.documento_tipo === 'PASSAPORTE' || c.documento_tipo === 'RNE')) return { tipo: c.documento_tipo, numero: n }
  return null
}
