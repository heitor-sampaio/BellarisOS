import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  TIPOS_DE_CAMPANHA, recusaDoTipoDaCampanha, GATILHOS_QUE_VIRARAM_MODELO,
} from '@/lib/notifications/tipo-da-campanha'
import { MODELOS_DE_AUTOMACAO } from '@/lib/automacoes/modelos'
import { quandoDispara } from '@/lib/notifications/quando-dispara'

/**
 * MK1 (a revisão do Heitor, 2026-11-13: "mk1 ok"): a campanha é IMEDIATA ou
 * AGENDADA (numa data e hora, ou todo ano numa data). Sai o tipo
 * "Automática": cada gatilho dele virou um MODELO desligado nas Automações
 * (AU1) — nada se perde, muda de lugar.
 */
const RAIZ = path.resolve(__dirname, '..')
const ler = (arq: string) => fs.readFileSync(path.join(RAIZ, arq), 'utf8')

describe('MK1: a campanha é Imediata ou Agendada', () => {
  it('só existem os dois tipos', () => {
    expect([...TIPOS_DE_CAMPANHA]).toEqual(['IMMEDIATE', 'SCHEDULED'])
  })

  it('a "Automática" é recusada, e a recusa diz onde o gatilho mora agora', () => {
    const r = recusaDoTipoDaCampanha({ type: 'AUTOMATED', trigger_type: 'BIRTHDAY' })
    expect(r).toMatch(/Imediata ou Agendada/)
    expect(r).toMatch(/Automações/)
  })

  it('a agendada pede a data e hora OU a data de todo ano', () => {
    expect(recusaDoTipoDaCampanha({ type: 'SCHEDULED' })).toMatch(/data/)
    expect(recusaDoTipoDaCampanha({ type: 'SCHEDULED', scheduled_at: '2026-12-01T09:00' })).toBeNull()
    expect(recusaDoTipoDaCampanha({ type: 'SCHEDULED', trigger_type: 'ANNUAL_DATE', trigger_config: { month: 5, day: 10 } })).toBeNull()
    // Todo ano sem o dia não é data nenhuma.
    expect(recusaDoTipoDaCampanha({ type: 'SCHEDULED', trigger_type: 'ANNUAL_DATE', trigger_config: { month: 5 } })).toMatch(/data/)
    // 31/02 não chega nunca.
    expect(recusaDoTipoDaCampanha({ type: 'SCHEDULED', trigger_type: 'ANNUAL_DATE', trigger_config: { month: 2, day: 31 } })).toMatch(/data/)
  })

  it('a agendada não leva gatilho de cliente (aniversário, lembrete, pós-visita…)', () => {
    for (const g of ['BIRTHDAY', 'BEFORE_APPOINTMENT', 'DAYS_AFTER_VISIT', 'DAYS_BEFORE_EXPIRY']) {
      expect(recusaDoTipoDaCampanha({ type: 'SCHEDULED', scheduled_at: '2026-12-01T09:00', trigger_type: g }), g).toMatch(/Automações/)
    }
  })

  it('a imediata não leva data nem gatilho', () => {
    expect(recusaDoTipoDaCampanha({ type: 'IMMEDIATE' })).toBeNull()
    expect(recusaDoTipoDaCampanha({ type: 'IMMEDIATE', trigger_type: 'ANNUAL_DATE', trigger_config: { month: 1, day: 1 } })).not.toBeNull()
  })

  it('cada gatilho da campanha automática que saiu tem o seu modelo nas Automações', () => {
    const chaves = MODELOS_DE_AUTOMACAO.map(m => m.chave)
    const rotulos = GATILHOS_QUE_VIRARAM_MODELO.map(g => g.rotulo)
    expect(rotulos).toEqual(['Aniversário', 'Lembrete do agendamento', 'Pós-visita', 'Vencimento de pacote', 'Confirmação', 'Cancelamento', 'Pontos de fidelidade'])
    for (const g of GATILHOS_QUE_VIRARAM_MODELO) expect(chaves, g.rotulo).toContain(g.modelo)
  })

  it('o "Dispara" da data de todo ano continua dizendo a hora', () => {
    expect(quandoDispara('ANNUAL_DATE', { day: 8, month: 3 })).toBe('todo ano em 08/03, a partir das 09:00')
  })

  it('nada do sistema fala mais da campanha "Automática" (o tipo, os gatilhos de cliente)', () => {
    for (const arq of [
      'actions/notification-campaigns.ts',
      'components/admin/notification-campaign-form.tsx',
      'components/admin/notification-campaigns-list.tsx',
      'app/admin/notificacoes/[id]/page.tsx',
      'app/api/cron/notification-campaigns/route.ts',
      'lib/notifications/gatilho-de-hoje.ts',
      'lib/notifications/quando-dispara.ts',
    ]) {
      const fonte = ler(arq)
      expect(fonte, arq).not.toMatch(/'AUTOMATED'|Automática|'BIRTHDAY'|'BEFORE_APPOINTMENT'|'DAYS_AFTER_VISIT'|'DAYS_BEFORE_EXPIRY'/)
    }
  })

  it('o lembrete de madrugada da campanha saiu com ela (o da automação tem o silêncio noturno)', () => {
    expect(fs.existsSync(path.join(RAIZ, 'lib/notifications/lembrete-de-madrugada.ts'))).toBe(false)
  })
})
