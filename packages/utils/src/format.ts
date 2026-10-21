export const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

// Fuso do negócio fixo: no servidor (container) o fuso do processo não é o de
// Brasília, e sem isto o mesmo horário aparecia diferente no SSR e no cliente.
const BUSINESS_TZ = 'America/Sao_Paulo'

export const formatDate = (date: Date | string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: BUSINESS_TZ }).format(new Date(date))

export const formatDateTime = (date: Date | string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: BUSINESS_TZ }).format(new Date(date))

export const formatTime = (date: Date | string) =>
  new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', timeZone: BUSINESS_TZ }).format(new Date(date))

export const formatPercent = (value: number, decimals = 1) =>
  `${value.toFixed(decimals).replace('.', ',')}%`

export const maskCPF = (cpf: string) =>
  cpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')

export const maskPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 11
    ? digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
    : digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
}

export const maskCNPJ = (cnpj: string) =>
  cnpj.replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')

/**
 * Data SEM hora (nascimento): o dia do calendário como foi gravado, sem fuso.
 * `birth_date` é timestamptz à meia-noite UTC — convertida para Brasília, vira
 * 21h da véspera, e o 15/03 aparecia 14/03 (simulação de 2026-10-20). Lê o
 * AAAA-MM-DD do início do texto.
 */
export function formatDia(valor: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

/** A idade numa data (o fuso do negócio para "hoje"), pelo dia do calendário do nascimento. */
export function idadeEm(nascimento: string | null | undefined, hoje: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(nascimento ?? '')
  if (!m) return null
  const [a, mes, d] = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ }).format(hoje).split('-').map(Number)
  const ano = Number(m[1]), mesN = Number(m[2]), dia = Number(m[3])
  return a! - ano - ((mes! < mesN || (mes === mesN && d! < dia)) ? 1 : 0)
}
