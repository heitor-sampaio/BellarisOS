import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { filtrosDaCampanha } from '@/lib/notifications/filtros-da-campanha'
import { filtrosDoPublico } from '@/lib/notifications/resumo-do-publico'

/**
 * D1 da 9ª simulação (2026-11-07): a "Reativação 60 dias" gravava
 * `max_days_since_visit: 60`, e nem a prévia nem o disparo o passavam ao
 * banco — ativada, iria a TODA cliente. E o "Revisar" dizia "Vieram nos
 * últimos 60 dias", o inverso. Cada regra gravada da campanha vira UM filtro
 * do público, numa função só, que a prévia, o disparo e o cron usam.
 */
describe('as regras da campanha viram os filtros do público', () => {
  const agora = new Date('2026-11-07T12:00:00Z')

  it('cada regra gravada chega ao filtro', () => {
    expect(filtrosDaCampanha({
      branch_ids: ['b1'], genders: ['F'], tags: ['VIP'], procedure_ids: ['p1'],
      has_app_account: true, max_days_since_visit: 60, min_visits: 2,
    }, agora)).toEqual({
      branch_ids: ['b1'], genders: ['F'], tags: ['VIP'], procedure_ids: ['p1'],
      has_app_account: true,
      // 60 dias antes de agora: sem atendimento concluído desde então, e
      // cliente da clínica de antes disso (a cadastrada ontem não "sumiu").
      sem_retorno_desde: '2026-09-08T12:00:00.000Z',
      cliente_desde_antes: '2026-09-08T12:00:00.000Z',
      min_visitas: 2,
    })
  })

  it('sem regra, sem filtro', () => {
    expect(filtrosDaCampanha({}, agora)).toEqual({ has_app_account: false })
  })

  it('nenhuma regra do tipo fica sem leitor', () => {
    // Toda chave de AudienceRules tem de ser lida por filtrosDaCampanha: a
    // regra nova que só a tela grava é o D1 de volta.
    const tipo = fs.readFileSync(path.resolve(__dirname, '../actions/notification-campaigns.ts'), 'utf8')
    const bloco = tipo.match(/export type AudienceRules = \{([\s\S]*?)\n\}/)![1]!
    const chaves = [...bloco.matchAll(/^\s*(\w+)\?:/gm)].map(m => m[1]!)
    const leitor = fs.readFileSync(path.resolve(__dirname, '../lib/notifications/filtros-da-campanha.ts'), 'utf8')
    for (const chave of chaves) expect(leitor, `a regra ${chave}`).toContain(`regras.${chave}`)
  })

  it('a prévia, o disparo e o cron montam o público por ela', () => {
    // O cron escolhe as clientes do gatilho por lib/notifications/gatilho-de-hoje
    // (D10 da 12ª: a mesma escolha do "Quem receberia hoje" do detalhe).
    const cron = fs.readFileSync(path.resolve(__dirname, '..', 'app/api/cron/notification-campaigns/route.ts'), 'utf8')
    expect(cron, 'o cron escolhe pelo gatilho-de-hoje').toContain("from '@/lib/notifications/gatilho-de-hoje'")
    for (const arquivo of ['actions/notification-campaigns.ts', 'lib/notifications/disparo-de-campanha.ts', 'lib/notifications/gatilho-de-hoje.ts']) {
      const fonte = fs.readFileSync(path.resolve(__dirname, '..', arquivo), 'utf8')
      expect(fonte, arquivo).toContain('filtrosDaCampanha(')
      expect(fonte, `${arquivo}: sem montar o filtro à mão`).not.toMatch(/branch_ids:\s*rules\.branch_ids/)
    }
  })

  it('o "Revisar" diz "Sem visita há mais de 60 dias"', () => {
    expect(filtrosDoPublico({ max_days_since_visit: 60 })).toEqual(['Sem visita há mais de 60 dias'])
  })
})
