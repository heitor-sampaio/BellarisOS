import { createAdminClient } from '@/lib/supabase/admin'
import { partsInTZ, startOfDayTZ } from '@/lib/datetime'
import { valorDoCampo } from './condicoes'
import { PASSO_DO_CRON_MIN, INTERVALO_MINIMO_MIN } from '@estetica-os/types'
import type {
  ConfigEsperaDuracao, ConfigEsperaAte, ConfigGatilhoAgenda, ConfigBuscarClientes,
} from '@estetica-os/types'
import type { ContextoDaExecucao } from './contexto'
import { ler } from '@/lib/db'

/**
 * O tempo — esperas, agenda e busca.
 *
 * O princípio do motor vale inteiro aqui: **o processo não segura nada**. Uma
 * espera de três dias não é um `setTimeout`; é uma data gravada em
 * `rodar_apos`, e o run volta para a fila. É isso que faz a automação
 * sobreviver a um container que reinicia sozinho — e por isso a fila é uma
 * tabela e não memória.
 */

const MINUTO = 60 * 1000

export function quandoVoltar(cfg: ConfigEsperaDuracao, agora = new Date()): Date {
  const n = Number(cfg.quantidade ?? 0)
  if (!Number.isFinite(n) || n <= 0) throw new Error('A espera precisa de um tempo maior que zero.')

  const fator = { minutos: 1, horas: 60, dias: 60 * 24 }[cfg.unidade ?? 'dias']
  if (!fator) throw new Error(`Unidade de espera desconhecida: ${cfg.unidade}`)

  return new Date(agora.getTime() + n * fator * MINUTO)
}

/**
 * "24h antes de `agendamento.data`".
 *
 * Quando o alvo já passou — o agendamento é para daqui a duas horas e a espera
 * pedia 24h antes —, **segue em frente agora** em vez de esperar um momento
 * que não existe mais. O contrário seria a automação travar para sempre num
 * passado, e o sintoma é o pior possível: nada acontece e nada explica.
 */
export function quandoChegarEm(
  cfg: ConfigEsperaAte,
  contexto: ContextoDaExecucao,
  agora = new Date(),
): { data: Date | null; motivo?: string } {
  // Campo ou expressão — 'espera até' aceita as duas coisas, como o IF.
  const bruto = valorDoCampo(contexto, cfg.campo ?? '')
  if (bruto === null || bruto === undefined || bruto === '') {
    return { data: null, motivo: `O campo "${cfg.campo}" está vazio: não há data para esperar.` }
  }

  const base = new Date(String(bruto))
  if (Number.isNaN(base.getTime())) {
    return { data: null, motivo: `"${cfg.campo}" não contém uma data.` }
  }

  const alvo = new Date(base.getTime() + Number(cfg.minutos ?? 0) * MINUTO)
  if (alvo.getTime() <= agora.getTime()) {
    return { data: null, motivo: 'O momento já passou; o fluxo seguiu na hora.' }
  }
  return { data: alvo }
}

// ─── Gatilho de agenda ──────────────────────────────────────────────────────

/**
 * Está na hora deste gatilho disparar?
 *
 * O cron passa a cada cinco minutos, então "às 9h" na prática é "na primeira
 * passagem depois das 9h". A janela de tolerância existe para isso — e o
 * `ultimoDisparo` é o que impede as passagens seguintes de repetirem: sem ele,
 * das 9:00 às 9:05 o lembrete diário chegaria uma vez por passagem.
 *
 * **De tempos em tempos é outra pergunta.** "A cada 30 minutos" não tem horário
 * do dia a comparar: o que conta é quanto tempo passou desde o último disparo.
 * Por isso sai antes, sem a tolerância de uma hora e sem a trava de "já
 * disparou hoje" — que ali seria um disparo por dia.
 */
export function estaNaHora(
  cfg: ConfigGatilhoAgenda,
  ultimoDisparo: string | null,
  agora = new Date(),
): boolean {
  if (cfg.frequencia === 'minutos' || cfg.frequencia === 'horas') {
    return passouOIntervalo(cfg, ultimoDisparo, agora)
  }

  const p = partsInTZ(agora)
  const alvo = emMinutos(cfg.hora)
  if (alvo === null) return false

  const minutosAgora = p.hour * 60 + p.minute
  // Uma hora de tolerância: se o cron ficou fora do ar às 9h, o lembrete das
  // 9h ainda sai às 9h40. Depois disso o dia passou — mandar o lembrete do
  // café da manhã à noite é pior que não mandar.
  if (minutosAgora < alvo || minutosAgora > alvo + 60) return false

  if (cfg.frequencia === 'semanal' && p.day !== undefined) {
    const diaDaSemana = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
    if (diaDaSemana !== (cfg.diaDaSemana ?? 1)) return false
  }

  if (cfg.frequencia === 'mensal' && p.day !== (cfg.diaDoMes ?? 1)) return false

  // Já disparou nesta janela? Para o diário, basta ser do mesmo dia; para
  // semanal e mensal, o mesmo dia também resolve — dois disparos no mesmo dia
  // é exatamente o que se quer evitar.
  if (ultimoDisparo) {
    const ultimo = startOfDayTZ(new Date(ultimoDisparo)).getTime()
    if (ultimo === startOfDayTZ(agora).getTime()) return false
  }

  return true
}

/**
 * "A cada N minutos/horas": passou tempo suficiente desde o último disparo?
 *
 * **Meio passo do cron de folga.** O cron não cai no minuto exato: se o último
 * disparo foi às 9:00:05 e a passagem seguinte é 9:05:03, cobrar os 5 minutos
 * cheios reprovaria por dois segundos e o disparo iria para as 9:10 — "a cada
 * 5 minutos" virando 10, e o atraso somando a cada volta.
 *
 * Nunca disparou: começa agora. O primeiro ciclo é o de ligar a automação.
 */
function passouOIntervalo(
  cfg: ConfigGatilhoAgenda,
  ultimoDisparo: string | null,
  agora: Date,
): boolean {
  const n = Number(cfg.intervalo ?? 0)
  if (!Number.isFinite(n) || n <= 0) return false

  const minutos = Math.max(
    cfg.frequencia === 'horas' ? n * 60 : n,
    INTERVALO_MINIMO_MIN,
  )
  if (!ultimoDisparo) return true

  const desde = agora.getTime() - new Date(ultimoDisparo).getTime()
  if (Number.isNaN(desde)) return true
  return desde >= (minutos - PASSO_DO_CRON_MIN / 2) * MINUTO
}

function emMinutos(hhmm?: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim())
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

// ─── Busca de clientes ──────────────────────────────────────────────────────

export interface ClienteEncontrado {
  id:       string
  nome:     string
  telefone: string | null
}

/**
 * Os clientes que um fluxo de agenda vai percorrer.
 *
 * Teto obrigatório (200 por padrão): um filtro largo demais numa base grande
 * abriria mil execuções de uma vez, e cada uma pode mandar mensagem. O teto é
 * a diferença entre "campanha que eu quis" e "disparo em massa que eu não
 * revisei".
 */
export async function buscarClientes(
  tenantId: string,
  cfg: ConfigBuscarClientes,
): Promise<{ clientes: ClienteEncontrado[]; truncado: boolean }> {
  const admin = createAdminClient()
  const limite = Math.min(cfg.limite ?? 200, 500)

  let q = admin
    .from('clients')
    .select('id, name, phone, birth_date, tags, branch_id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    // Uma a mais para saber se o teto cortou alguém — e poder dizer isso no
    // passo, em vez de silenciosamente atender só uma parte.
    .limit(limite + 1)

  if (cfg.unidadeId) q = q.eq('branch_id', cfg.unidadeId)
  if (cfg.tags?.length) q = q.overlaps('tags', cfg.tags)

  const { data, error } = await q
  if (error) throw new Error(`Não consegui buscar os clientes: ${error.message}`)

  let linhas = data ?? []

  if (cfg.aniversarioHoje) {
    // Dia e mês no fuso do NEGÓCIO. Comparar com `getMonth()` cru usaria o
    // fuso do processo (UTC no container) e erraria por um dia quem faz
    // aniversário na virada.
    const hoje = partsInTZ(new Date())
    const chave = `${String(hoje.month).padStart(2, '0')}-${String(hoje.day).padStart(2, '0')}`
    linhas = linhas.filter(c => String(c.birth_date ?? '').slice(5, 10) === chave)
  }

  if (cfg.semRetornoHaDias) {
    const corte = new Date(Date.now() - cfg.semRetornoHaDias * 24 * 3600 * 1000).toISOString()
    const ids = linhas.map(c => c.id as string)

    // Quem TEVE atendimento depois do corte sai da lista. A pergunta é sobre
    // ausência, e ausência não se consulta direto: consulta-se a presença e
    // tira-se o resto.
    const recentes = await ler(admin
      .from('appointments')
      .select('client_id')
      .in('client_id', ids)
      .eq('status', 'COMPLETED')
      .gte('scheduled_at', corte), 'carregar os agendamentos')

    const voltaram = new Set((recentes ?? []).map(a => a.client_id as string))
    linhas = linhas.filter(c => !voltaram.has(c.id as string))
  }

  const truncado = linhas.length > limite
  return {
    truncado,
    clientes: linhas.slice(0, limite).map(c => ({
      id:       c.id as string,
      nome:     c.name as string,
      telefone: (c.phone as string | null) ?? null,
    })),
  }
}
