/**
 * O horário de funcionamento — da UNIDADE e, dentro dele, do PROFISSIONAL
 * (2026-10-21, decisão do Heitor: por unidade, dia e profissional).
 *
 * Até aqui não havia cadastro: os livres eram fixos em 08–20, a grade da
 * agenda em 07–20 e a ocupação contava 8 h por profissional — três contas
 * diferentes, e a agenda e o dashboard davam ocupações diferentes (D11/D12 da
 * simulação de um dia de clínica). Tudo passa por aqui: os livres
 * (`computeAvailableSlots`), a grade e a capacidade da ocupação.
 *
 * Puro (sem banco): roda no servidor e no navegador.
 *
 * Forma: `{ dias: { "0".."6": [{ de: "HH:MM", ate: "HH:MM" }, …] } }`, 0 =
 * domingo. Dia com lista vazia = fechado; a pausa é o intervalo entre dois
 * períodos. Unidade SEM cadastro = o padrão (segunda a sábado, 08–20);
 * profissional sem cadastro = segue a unidade; dia ausente no cadastro do
 * profissional = segue a unidade naquele dia.
 */

export interface Intervalo { de: string; ate: string }
export type DiaDaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6
/** Chave = o dia da semana ("0" = domingo … "6"); lista vazia = fechado. */
export interface Horario { dias: { [dia: string]: Intervalo[] | undefined } }

const COMERCIAL: Intervalo[] = [{ de: '08:00', ate: '20:00' }]
export const HORARIO_PADRAO: Horario = { dias: { 0: [], 1: COMERCIAL, 2: COMERCIAL, 3: COMERCIAL, 4: COMERCIAL, 5: COMERCIAL, 6: COMERCIAL } }

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/
const minutos = (h: string) => { const [a, b] = h.split(':').map(Number); return a! * 60 + b! }
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

function doDia(h: Horario, dia: number): Intervalo[] | undefined {
  const d = h.dias as Record<string, Intervalo[] | undefined>
  return d[String(dia)]
}

/** O que veio do navegador (ou do banco), conferido; nulo se não for um horário válido. */
export function normalizarHorario(v: unknown): Horario | null {
  if (!v || typeof v !== 'object') return null
  const dias = (v as { dias?: unknown }).dias
  if (!dias || typeof dias !== 'object') return null
  const saida: Horario = { dias: {} }
  for (const [k, lista] of Object.entries(dias as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(k) || !Array.isArray(lista)) return null
    const ints: Intervalo[] = []
    for (const i of lista) {
      const de = (i as Intervalo | null)?.de, ate = (i as Intervalo | null)?.ate
      if (typeof de !== 'string' || typeof ate !== 'string' || !HORA.test(de) || !HORA.test(ate)) return null
      if (minutos(ate) <= minutos(de)) return null
      ints.push({ de, ate })
    }
    ints.sort((a, b) => minutos(a.de) - minutos(b.de))
    for (let j = 1; j < ints.length; j++) if (minutos(ints[j]!.de) < minutos(ints[j - 1]!.ate)) return null
    ;(saida.dias as Record<string, Intervalo[]>)[k] = ints
  }
  return saida
}

/**
 * O campo `horario` de um formulário (editor de horário da unidade e passo da
 * unidade do setup): ausente = não mexe (undefined); vazio = sem cadastro
 * (null); válido = normalizado; inválido = `{ erro }`.
 */
export function lerHorarioDoForm(formData: FormData): Horario | null | undefined | { erro: string } {
  const bruto = formData.get('horario')
  if (typeof bruto !== 'string') return undefined
  if (!bruto.trim()) return null
  let h: Horario | null = null
  try { h = normalizarHorario(JSON.parse(bruto)) } catch { h = null }
  return h ?? { erro: 'Horário inválido: confira se cada período fecha depois de abrir e se não há períodos sobrepostos.' }
}

/** Os períodos em que se atende naquele dia da semana: a unidade ∩ o profissional. */
export function intervalosDoDia(unidade: Horario | null, profissional: Horario | null, dia: number): Intervalo[] {
  const daUnidade = doDia(unidade ?? HORARIO_PADRAO, dia) ?? (unidade ? [] : doDia(HORARIO_PADRAO, dia) ?? [])
  const doProf = profissional ? doDia(profissional, dia) : undefined
  if (!doProf) return daUnidade
  const saida: Intervalo[] = []
  for (const u of daUnidade) for (const p of doProf) {
    const de = Math.max(minutos(u.de), minutos(p.de)), ate = Math.min(minutos(u.ate), minutos(p.ate))
    if (ate > de) saida.push({ de: hhmm(de), ate: hhmm(ate) })
  }
  return saida.sort((a, b) => minutos(a.de) - minutos(b.de))
}

/** Os inícios (de `passo` em `passo` minutos) em que `duracao` cabe INTEIRA num período. */
export function slotsDoDia(intervalos: Intervalo[], duracao: number, passo = 30): string[] {
  const saida: string[] = []
  for (const i of intervalos) {
    for (let m = minutos(i.de); m + duracao <= minutos(i.ate); m += passo) saida.push(hhmm(m))
  }
  return saida
}

export function minutosDoDia(intervalos: Intervalo[]): number {
  return intervalos.reduce((s, i) => s + minutos(i.ate) - minutos(i.de), 0)
}

/** O dia da semana de uma data AAAA-MM-DD (do calendário, sem fuso). */
export function diaDaSemana(data: string): number {
  return new Date(`${data.slice(0, 10)}T12:00:00Z`).getUTCDay()
}

const diaEmBrasilia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)

/**
 * A capacidade de atendimento, em minutos, entre duas datas (os dias do
 * calendário de Brasília, inclusivos): a soma, por profissional e por dia, dos
 * minutos em que ele atende na unidade.
 */
export function capacidadeEmMinutos(unidade: Horario | null, profissionais: (Horario | null)[], de: Date, ate: Date): number {
  const fim = diaEmBrasilia(ate)
  let dia = diaEmBrasilia(de)
  let total = 0
  for (let guarda = 0; dia <= fim && guarda < 400; guarda++) {
    const semana = diaDaSemana(dia)
    for (const p of profissionais) total += minutosDoDia(intervalosDoDia(unidade, p, semana))
    dia = new Date(new Date(`${dia}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)
  }
  return total
}

/** As horas da grade da agenda: da primeira abertura ao último fechamento da semana. */
export function janelaDaGrade(horarios: (Horario | null)[]): { inicio: number; fim: number } {
  let inicio = 24 * 60, fim = 0
  for (const h of horarios.length ? horarios : [null]) for (let d = 0; d < 7; d++) {
    for (const i of intervalosDoDia(h, null, d)) { inicio = Math.min(inicio, minutos(i.de)); fim = Math.max(fim, minutos(i.ate)) }
  }
  if (fim <= inicio) return { inicio: 8, fim: 20 }
  return { inicio: Math.floor(inicio / 60), fim: Math.ceil(fim / 60) }
}

/**
 * A ocupação em percentual inteiro (até 100): minutos agendados ÷ a capacidade
 * do horário. Nulo sem capacidade (sem profissional, ou tudo fechado) — a tela
 * mostra "—" em vez de 0%. A definição é a de lib/metrics (`occupancyPct`),
 * que chama esta; mora aqui para a agenda (no navegador) usar a mesma conta.
 */
export function ocupacaoEmPct(minutosAgendados: number, unidade: Horario | null, profissionais: (Horario | null)[], de: Date, ate: Date): number | null {
  if (!profissionais.length) return null
  const capacidade = capacidadeEmMinutos(unidade, profissionais, de, ate)
  if (!capacidade) return null
  return Math.min(Math.round((minutosAgendados / capacidade) * 100), 100)
}
