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
