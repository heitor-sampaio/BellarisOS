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

/**
 * O telefone para EXIBIR, seja qual for o formato gravado (A25, 2026-10-27): a
 * cliente de balcão guarda "(48) 99000-0011", mas a convertida do lead guarda o
 * número do WhatsApp ("5548990000011") e aparecia crua. Aceita só dígitos,
 * máscara, "+55" e o 55 do WhatsApp. O que não é número nacional completo
 * (10 ou 11 dígitos) volta como veio — nunca mutilado.
 */
export const maskPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '')
  // "+" de outro país não é número nacional.
  if (/^\s*\+/.test(phone) && !digits.startsWith('55')) return phone
  const nacional = (digits.length === 12 || digits.length === 13) && digits.startsWith('55') ? digits.slice(2) : digits
  if (nacional.length === 11) return nacional.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (nacional.length === 10) return nacional.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return phone
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
 * (D10, 2026-10-27: o preço do procedimento lia "180" como R$ 1,80).
 *
 * - Com vírgula, ela é a dos centavos (até dois dígitos) e o ponto é milhar:
 *   "1.400,50", "180,5".
 * - Sem vírgula, o ponto seguido de grupos de EXATAMENTE três dígitos é milhar
 *   ("1.400", "12.500", "1.400.000" — D3 da simulação de 2026-10-29: "1.400"
 *   gravava R$ 1,40, sem aviso); com um ou dois dígitos depois, é decimal
 *   ("180.50", "1.5").
 * - O resto não se adivinha: NaN ("0.012", "1.4000", "1,400.50", "1,500" —
 *   centavos com três dígitos). Quem chama recusa com `DINHEIRO_INVALIDO`.
 */
export function parseDinheiro(texto: string): number {
  const s = texto.replace(/R\$|\s/g, '')
  const sinal = s.startsWith('-') ? -1 : 1
  const corpo = sinal < 0 ? s.slice(1) : s
  if (!/\d/.test(corpo)) return NaN
  // Milhar com ponto (ou nenhum) e, opcional, a vírgula dos centavos.
  if (/^(\d*|[1-9]\d{0,2}(\.\d{3})+)(,\d{0,2})?$/.test(corpo)) {
    return sinal * Number(corpo.replace(/\./g, '').replace(',', '.'))
  }
  // Ponto decimal: um ou dois dígitos depois dele.
  if (/^\d*\.\d{1,2}$/.test(corpo)) return sinal * Number(corpo)
  return NaN
}

/** A recusa de um valor que `parseDinheiro` não lê — a mesma frase em toda tela. */
export const DINHEIRO_INVALIDO = 'Valor não entendido: use vírgula para os centavos (ex.: 1.400,00 ou 0,50).'

/** Reais no formato do campo: 1234.5 -> "1.234,50" (vazio se não for número). */
export function formatDinheiroCampo(n: number): string {
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
