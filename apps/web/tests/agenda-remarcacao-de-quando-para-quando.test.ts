import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { textoDaRemarcacao } from '@/lib/appointments/texto-da-remarcacao'
import { comAutores, eventosDeRemarcacao, rotuloDaAcao } from '@/lib/clients/historico-do-agendamento'

/**
 * A remarcação diz DE QUANDO para quando, e fica na linha do tempo da ficha,
 * com quem remarcou (princípio 3; decisão do Claude, 26/11). O histórico do
 * agendamento dizia só "Remarcado … para 29/11": o horário de antes não ficava
 * gravado em lugar nenhum. A ficha não tinha a remarcação, e o "por Fulana
 * (app)" sumia de toda a linha do tempo de quem não tem o Atendimento em Ver
 * (o autor saía do LINK do evento, que sem o módulo é nulo — UM1).
 */
const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')
const ID = '11111111-2222-3333-4444-555555555555'

describe('o texto da remarcação diz de quando para quando', () => {
  it('pela equipe ou pelo Copilot', () => {
    expect(textoDaRemarcacao({ de: '2026-11-28T13:00:00Z', para: '2026-11-29T17:00:00Z', fuso: 'America/Sao_Paulo' }))
      .toBe('Remarcado de 28/11, 10:00 para 29/11, 14:00')
  })
  it('pela cliente no app', () => {
    expect(textoDaRemarcacao({ de: '2026-11-28T13:00:00Z', para: '2026-11-29T17:00:00Z', fuso: 'America/Sao_Paulo', pelaCliente: true }))
      .toBe('Remarcado pela cliente no app de 28/11, 10:00 para 29/11, 14:00')
  })
  it('o de antes no relógio da unidade de antes (o remarcar do app pode mudar de unidade)', () => {
    expect(textoDaRemarcacao({ de: '2026-11-28T13:00:00Z', fusoDeAntes: 'America/Rio_Branco', para: '2026-11-29T17:00:00Z', fuso: 'America/Sao_Paulo' }))
      .toBe('Remarcado de 28/11, 08:00 para 29/11, 14:00')
  })
  it('o mesmo horário (só trocou quem atende) não repete o "de"', () => {
    expect(textoDaRemarcacao({ de: '2026-11-29T17:00:00Z', para: '2026-11-29T17:00:00Z', fuso: 'America/Sao_Paulo' }))
      .toBe('Remarcado para 29/11, 14:00')
  })
  it('a janela do agendamento mostra o texto gravado como está', () => {
    expect(rotuloDaAcao('RESCHEDULED', 'Remarcado de 28/11, 10:00 para 29/11, 14:00')).toBe('Remarcado de 28/11, 10:00 para 29/11, 14:00')
  })
  it('os dois caminhos que remarcam gravam o horário de antes', () => {
    const equipe = fonte('lib/appointments/alteracoes.ts')
    expect(equipe).toMatch(/textoDaRemarcacao\(\{ de: existente\.scheduled_at/)
    expect(equipe).toMatch(/de_scheduled_at: existente\.scheduled_at/)
    const app = fonte('actions/portal-agendamentos.ts')
    expect(app).toMatch(/textoDaRemarcacao\(\{ de: a\.scheduled_at/)
    expect(app).toMatch(/de_scheduled_at: a\.scheduled_at/)
  })
})

describe('a remarcação na linha do tempo da ficha', () => {
  const historico = [
    { appointment_id: ID, action: 'CREATED', changed_by_name: 'Ana', created_at: '2026-11-20T10:00:00Z', description: 'Agendamento criado' },
    { appointment_id: ID, action: 'RESCHEDULED', changed_by_name: 'Bruna (app)', created_at: '2026-11-26T03:00:00Z', description: 'Remarcado pela cliente no app de 28/11, 10:00 para 29/11, 14:00' },
  ]
  it('cada remarcação vira um evento, com o texto gravado e quem remarcou', () => {
    const eventos = eventosDeRemarcacao(historico, new Map([[ID, 'Limpeza']]), () => null)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({
      type: 'APPOINTMENT_RESCHEDULED', date: '2026-11-26T03:00:00Z', title: 'Remarcado: Limpeza',
      subtitle: 'Remarcado pela cliente no app de 28/11, 10:00 para 29/11, 14:00', autor: 'Bruna (app)', link: null, agendamentoId: ID,
    })
  })
  it('o autor aparece também sem o link (quem não tem o Atendimento em Ver)', () => {
    const [agendou] = comAutores([{ type: 'APPOINTMENT_SCHEDULED', link: null, agendamentoId: ID, autor: null as string | null }], historico)
    expect(agendou!.autor).toBe('Ana')
  })
  it('as duas fichas põem as remarcações na linha do tempo e o id do agendamento em cada evento', () => {
    for (const pagina of ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']) {
      const t = fonte(pagina)
      expect(t, pagina).toMatch(/eventosDeRemarcacao\(/)
      expect((t.match(/agendamentoId: a\.id/g) ?? []).length, pagina).toBeGreaterThanOrEqual(4)
    }
    expect(fonte('lib/clients/autores-do-historico.ts')).toMatch(/select\('appointment_id, action, changed_by_name, created_at, description'\)/)
    expect(fonte('components/branch/client-profile.tsx')).toMatch(/APPOINTMENT_RESCHEDULED:/)
  })
})
