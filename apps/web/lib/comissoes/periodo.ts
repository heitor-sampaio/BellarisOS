import { partsInTZ, zonedToUtc, weekdayTZ } from '@/lib/datetime'
import type { PeriodoDaComissao } from './config'

/**
 * Os períodos de fechamento das comissões, no fuso do negócio (§13.1: nunca
 * `new Date(y, m, d)`). A rede escolhe o ritmo em Configurações → Comissões:
 * - MENSAL: do dia 1 ao último dia do mês;
 * - QUINZENAL: 1–15 e 16–fim do mês;
 * - SEMANAL: segunda a domingo.
 */
export interface PeriodoDeFechamento {
  /** 'YYYY-MM-DD' do primeiro dia — a chave da URL. */
  chave:  string
  inicio: Date
  /** O último instante do último dia. */
  fim:    Date
  rotulo: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate()

function montar(ano: number, mes: number, diaIni: number, anoFim: number, mesFim: number, diaFim: number, rotulo: string): PeriodoDeFechamento {
  return {
    chave:  `${ano}-${pad(mes)}-${pad(diaIni)}`,
    inicio: zonedToUtc(ano, mes, diaIni),
    fim:    zonedToUtc(anoFim, mesFim, diaFim, 23, 59, 59, 999),
    rotulo,
  }
}

/** O período que contém o instante. */
export function periodoDe(data: Date, tipo: PeriodoDaComissao): PeriodoDeFechamento {
  const p = partsInTZ(data)
  if (tipo === 'MENSAL') {
    return montar(p.year, p.month, 1, p.year, p.month, ultimoDia(p.year, p.month), `${MESES[p.month - 1]}/${p.year}`)
  }
  if (tipo === 'QUINZENAL') {
    const fimDoMes = ultimoDia(p.year, p.month)
    const primeira = p.day <= 15
    const [de, ate] = primeira ? [1, 15] : [16, fimDoMes]
    return montar(p.year, p.month, de, p.year, p.month, ate, `${pad(de)} a ${pad(ate)}/${MESES[p.month - 1]}/${p.year}`)
  }
  // SEMANAL: a segunda-feira da semana (0 = domingo no weekdayTZ).
  const dow = weekdayTZ(data)
  const recuo = dow === 0 ? 6 : dow - 1
  const seg = new Date(Date.UTC(p.year, p.month - 1, p.day - recuo))
  const dom = new Date(Date.UTC(p.year, p.month - 1, p.day - recuo + 6))
  const [a1, m1, d1] = [seg.getUTCFullYear(), seg.getUTCMonth() + 1, seg.getUTCDate()]
  const [a2, m2, d2] = [dom.getUTCFullYear(), dom.getUTCMonth() + 1, dom.getUTCDate()]
  return montar(a1, m1, d1, a2, m2, d2, `${pad(d1)}/${pad(m1)} a ${pad(d2)}/${pad(m2)}/${a2}`)
}

/** O período atual e os anteriores, do mais recente para o mais antigo. */
export function periodosRecentes(tipo: PeriodoDaComissao, agora: Date, quantos = 12): PeriodoDeFechamento[] {
  const lista: PeriodoDeFechamento[] = []
  let atual = periodoDe(agora, tipo)
  for (let i = 0; i < quantos; i++) {
    lista.push(atual)
    // Um milissegundo antes do início cai no período anterior.
    atual = periodoDe(new Date(atual.inicio.getTime() - 1), tipo)
  }
  return lista
}

/** O período de uma chave da URL ('YYYY-MM-DD'), ou null se não for válida. */
export function periodoDaChave(chave: string | undefined | null, tipo: PeriodoDaComissao): PeriodoDeFechamento | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(chave ?? '')
  if (!m) return null
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mes < 1 || mes > 12 || dia < 1 || dia > ultimoDia(ano, mes)) return null
  // Meio-dia do dia pedido: longe de qualquer virada de fuso.
  const periodo = periodoDe(zonedToUtc(ano, mes, dia, 12), tipo)
  return periodo.chave === chave ? periodo : null
}
