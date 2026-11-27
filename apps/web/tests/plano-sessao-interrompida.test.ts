import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { situacaoDaSessaoNoApp } from '@/lib/plano-de-tratamento/sessao-no-app'

/**
 * D8 e A3 da 35ª (AT-21 — o Heitor, 2026-11-18: o atendimento iniciado e
 * cancelado gasta a sessão; princípio 3): na página do plano, a sessão da
 * desistência seguia "Agendada para 26/11 23:00", e o app dizia "Usada em …
 * (atendimento interrompido)". A página da equipe diz o mesmo que o app, pela
 * mesma função (`situacaoDaSessaoNoApp`).
 */

const passos = () => readFileSync(join(__dirname, '..', 'components', 'branch', 'passos-do-plano.tsx'), 'utf8')

describe('D8: a sessão interrompida é "Usada" também na página do plano', () => {
  it('a função do app diz "Usada … (atendimento interrompido)"', () => {
    expect(situacaoDaSessaoNoApp({ status: 'CANCELLED', scheduled_at: '2026-11-27T03:00:00Z', completed_at: null }, 'America/Porto_Velho').texto)
      .toBe('Usada em 26/11 (atendimento interrompido)')
  })
  it('os passos do plano usam a mesma função para a sessão cancelada', () => {
    const p = passos()
    expect(p).toMatch(/import \{ situacaoDaSessaoNoApp \} from '@\/lib\/plano-de-tratamento\/sessao-no-app'/)
    expect(p).toMatch(/s\.apptStatus === 'CANCELLED'/)
    expect(p).toMatch(/situacaoDaSessaoNoApp\(\{ status: s\.apptStatus/)
  })
})
