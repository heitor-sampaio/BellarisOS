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

/**
 * A máscara do telefone ENQUANTO se digita: "(48", "(48) 9912", "(48) 99123-4567".
 * `maskPhone` só formata o número inteiro (2026-10-21: o telefone da unidade e
 * o cadastro rápido da agenda ficavam sem máscara nenhuma).
 */
export const maskPhoneDigitando = (valor: string) => {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** O CNPJ ENQUANTO se digita: "12.345.678/0001-95" (2026-10-27, setup). */
export const maskCNPJDigitando = (valor: string) => {
  const d = valor.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** O CEP ENQUANTO se digita: "88010-400". */
export const maskCEPDigitando = (valor: string) => {
  const d = valor.replace(/\D/g, '').slice(0, 8)
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`
}

/**
 * O que a pessoa escreveu num campo de dinheiro, em reais: "180" = R$ 180,00
 * (D10, 2026-10-27: o preço do procedimento lia "180" como R$ 1,80). Com
 * vírgula, o ponto é milhar; sem vírgula, o ponto é decimal ("180.50" vindo
 * do banco). NaN se não for número.
 */
export function parseDinheiro(texto: string): number {
  const s = texto.replace(/R\$|\s/g, '')
  if (!s) return NaN
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
}

/** Reais no formato do campo: 1234.5 -> "1.234,50" (vazio se não for número). */
export function formatDinheiroCampo(n: number): string {
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
