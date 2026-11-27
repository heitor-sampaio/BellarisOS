import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pacotesEmAndamento } from '@/lib/clientes/pacotes-da-ficha'

/**
 * A validade do crédito é um DIA, no fuso da unidade dele (PP-05; decisão do
 * Claude, 27/11): o agendar já conferia assim (`lib/creditos/validade.ts`),
 * mas a ficha tirava o pacote do "Tratamento em andamento" na HORA gravada na
 * compra (29/11 05:22) e o pré-pago virava "vencido" no meio do último dia.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const pacote = (id: string, extra: Record<string, unknown> = {}) => ({
  id, total_sessions: 5, used_sessions: 0, expires_at: null, cancelado_em: null, package_sessions: [], ...extra,
})

describe('a validade pelo dia nas listas da ficha', () => {
  it('o pacote que vence hoje às 05:22 segue em andamento às 15h do mesmo dia (no fuso da unidade)', () => {
    // 29/11 05:22 em Cuiabá (UTC−4) = 09:22Z; agora: 29/11 15h em Cuiabá = 19:00Z.
    const agora = new Date('2026-11-29T19:00:00Z')
    const r = pacotesEmAndamento([
      pacote('hoje', { expires_at: '2026-11-29T09:22:00Z', branches: { fuso: 'America/Cuiaba' } }),
      pacote('ontem', { expires_at: '2026-11-28T09:22:00Z', branches: { fuso: 'America/Cuiaba' } }),
    ], agora)
    expect(r.map(p => p.id)).toEqual(['hoje'])
  })

  it('as duas fichas leem o fuso da unidade do pacote', () => {
    for (const arq of ['lib/cached-queries.ts', 'app/admin/clients/[id]/page.tsx']) {
      expect(fonte(arq), arq).toMatch(/valor_referencia, branches\(fuso\), service_packages\(/)
    }
  })

  it('o pré-pago diz "vencida" pelo dia, como o agendar', () => {
    const f = fonte('lib/pre-pago/leitura.ts')
    expect(f).toMatch(/vencida:\s+!creditoValeHoje\(v\.expires_at, v\.branches\?\.fuso \?\? undefined\)/)
    expect(f).toMatch(/sold_at, expires_at, branches\(fuso\), procedures\(name\)/)
  })
})
