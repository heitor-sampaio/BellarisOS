import { describe, it, expect } from 'vitest'
import { baseDoJob } from '../../../scripts/cron.mjs'

/**
 * O cron chama cada job no app DONO dele (2026-10-06): a cobrança das
 * assinaturas mora no sistema (admin.*), o resto na clínica.
 */
describe('baseDoJob', () => {
  const env = { APP_URL: 'https://app.bellarisos.com/', SISTEMA_URL: 'https://admin.bellarisos.com' }
  it('assinaturas vai ao sistema', () => {
    expect(baseDoJob('assinaturas', env)).toBe('https://admin.bellarisos.com')
  })
  it('o resto vai à clínica', () => {
    for (const j of ['notification-campaigns', 'suporte-sessoes', 'automacoes']) expect(baseDoJob(j, env)).toBe('https://app.bellarisos.com')
  })
  it('sem SISTEMA_URL, o job do sistema não tem para onde ir (null — o cron o pula, com aviso)', () => {
    expect(baseDoJob('assinaturas', { APP_URL: 'https://app.bellarisos.com' })).toBeNull()
  })
})
