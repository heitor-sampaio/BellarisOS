import { formatBRL } from '@estetica-os/utils'

/**
 * O RETRATO do plano cancelado (D4 da 12ª simulação, 2026-11-11; princípio 3):
 * o plano cancelado reabria como rascunho editável, sem a data, o motivo, o que
 * foi devolvido e o que ficou. Tudo isso o banco já guarda
 * (`treatment_plans.cancelado_em`, `cancelamento_motivo` e o jsonb
 * `cancelamento`, escrito por `plano_cancelar_devolvendo`); aqui só o texto que
 * a tela mostra. Nulo no plano que não foi cancelado pelo "Cancelar plano".
 */
export interface RetratoDoCancelamento {
  quando:  string
  motivo:  string | null
  linhas:  string[]
}

// No relógio da unidade do plano (F62b); sem ela, Brasília.
const quandoNoFuso = (fuso: string) => new Intl.DateTimeFormat('pt-BR', {
  timeZone: fuso, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100

export function retratoDoCancelamento(p: {
  cancelado_em?: string | null; cancelamento_motivo?: string | null; cancelamento?: unknown
}, fuso = 'America/Sao_Paulo'): RetratoDoCancelamento | null {
  if (!p.cancelado_em) return null
  const c = (p.cancelamento && typeof p.cancelamento === 'object' ? p.cancelamento : {}) as Record<string, unknown>
  const por = typeof c.por === 'string' && c.por.trim() ? `, por ${c.por.trim()}` : ''
  const [dia, hora] = quandoNoFuso(fuso).format(new Date(p.cancelado_em)).split(', ')
  const linhas: string[] = []

  const sessoes = Number(c.sessoes ?? 0)
  const restantes = Number(c.restantes ?? 0)
  if (restantes > 0) {
    linhas.push(`${restantes} de ${sessoes} ${sessoes === 1 ? 'sessão cancelada' : 'sessões canceladas'} (${formatBRL(num(c.valor_restante))}).`)
  }
  linhas.push(`Usado, fica com a clínica: ${formatBRL(num(c.usado))} (o que foi feito, com o desconto).`)

  const cai = num(c.cai)
  if (cai > 0) linhas.push(`${formatBRL(cai)} a receber caíram: não serão cobrados.`)

  const devolver = num(c.devolver)
  if (devolver <= 0) linhas.push('Nada a devolver à cliente.')
  else if (c.destino === 'CREDITO') linhas.push(`${formatBRL(devolver)} em crédito na clínica.`)
  else if (c.estorno === 'INTEIRO') {
    const parcial = (c.parcial ?? null) as Record<string, unknown> | null
    linhas.push(parcial
      ? `${formatBRL(devolver)} estornados à cliente: o pagamento de ${formatBRL(num(parcial.valor))} estornado inteiro e o usado (${formatBRL(num(parcial.fica))}) lançado de novo.`
      : `${formatBRL(devolver)} estornados à cliente (o pagamento inteiro estornado e o usado lançado de novo).`)
  } else linhas.push(`${formatBRL(devolver)} estornados à cliente.`)

  const agendamentos = Array.isArray(c.agendamentos) ? c.agendamentos.length : 0
  if (agendamentos > 0) {
    const um = agendamentos === 1
    linhas.push(c.agendamentos_escolha === 'SOLTAR'
      ? `${agendamentos} ${um ? 'agendamento ficou' : 'agendamentos ficaram'} como atendimento avulso, a cobrar.`
      : `${agendamentos} ${um ? 'agendamento cancelado' : 'agendamentos cancelados'} com o plano.`)
  }

  return { quando: `Cancelado em ${dia} às ${hora}${por}.`, motivo: p.cancelamento_motivo?.trim() || null, linhas }
}
