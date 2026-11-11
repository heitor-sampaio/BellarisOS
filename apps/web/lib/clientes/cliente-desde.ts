/**
 * "Cliente desde" — desde quando a pessoa é cliente da clínica (D6 da 10ª
 * simulação, 2026-11-10; princípio 3). A importação grava a data da planilha
 * em `clients.cliente_desde` (um DIA, F35), e o dashboard já a usava (a
 * importada não conta como nova); a ficha, o atendimento e o pacote LGPD
 * diziam o dia do cadastro no sistema ("nov 2026" para quem é de 2021).
 * Vale `cliente_desde`; sem ela, o cadastro (`created_at`, no dia da
 * unidade — F62b; sem fuso, o de Brasília).
 *
 * `cliente_desde` é um DIA gravado sem hora: lido com `new Date()` é a
 * meia-noite UTC, e o 01/03 virava fevereiro em Brasília — aqui se lê o dia.
 */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export interface DesdeDaCliente {
  /** `clients.cliente_desde` (AAAA-MM-DD), da importação. */
  clienteDesde?: string | null
  /** `clients.created_at` (o cadastro no sistema). */
  createdAt?: string | null
}

/** O dia (AAAA-MM-DD) desde quando é cliente, ou null sem dado nenhum. */
export function diaDeClienteDesde({ clienteDesde, createdAt }: DesdeDaCliente, fuso: string = 'America/Sao_Paulo'): string | null {
  const dia = clienteDesde?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]
  if (dia) return dia
  if (!createdAt) return null
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(d)
}

/** "mar 2021" — o mês e o ano, como a ficha e o atendimento mostram. */
export function mesDeClienteDesde(c: DesdeDaCliente, fuso?: string): string | null {
  const dia = diaDeClienteDesde(c, fuso)
  if (!dia) return null
  const [ano, mes] = dia.split('-')
  return `${MESES[Number(mes) - 1]} ${ano}`
}

/** "12/03/2021" — o dia, como o pacote LGPD mostra. */
export function dataDeClienteDesde(c: DesdeDaCliente, fuso?: string): string | null {
  const dia = diaDeClienteDesde(c, fuso)
  return dia ? dia.split('-').reverse().join('/') : null
}
