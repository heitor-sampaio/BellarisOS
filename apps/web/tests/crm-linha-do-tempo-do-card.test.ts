import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * D11 [crm-inbox:OP-09, "a linha do tempo diz de quem para quem"; OP-26, "a
 * linha do tempo guarda o histórico" da perda]: o de → para do responsável
 * (`trocarResponsavelCore`) e o motivo da perda (`camposDaPerda`) estavam
 * gravados no `changes` do evento, e a linha do tempo dizia só "Responsável
 * alterado" e "Em negociação → Perdido".
 */

const WEB = join(__dirname, '..')
const fonte = (rel: string) => readFileSync(join(WEB, rel), 'utf8')

const evento = (type: string, changes: { campo: string; de: string | null; para: string | null }[] | null) =>
  ({ type, changes }) as { type: 'OWNER_CHANGED' | 'STAGE_CHANGED'; changes: typeof changes }

describe('D11: a linha do tempo do card diz o que foi gravado', () => {
  it('o responsável: de quem para quem ("Sem responsável" no vazio)', async () => {
    const { trocaDoResponsavel } = await import('@/lib/crm/linha-do-tempo')
    expect(trocaDoResponsavel(evento('OWNER_CHANGED', [{ campo: 'Responsável', de: 'Cássia', para: 'Denílson' }])))
      .toEqual({ de: 'Cássia', para: 'Denílson' })
    expect(trocaDoResponsavel(evento('OWNER_CHANGED', [{ campo: 'Responsável', de: null, para: 'Denílson' }])))
      .toEqual({ de: 'Sem responsável', para: 'Denílson' })
    expect(trocaDoResponsavel(evento('OWNER_CHANGED', [{ campo: 'Responsável', de: 'Cássia', para: null }])))
      .toEqual({ de: 'Cássia', para: 'Sem responsável' })
    // O evento antigo, sem o changes: não inventa nomes.
    expect(trocaDoResponsavel(evento('OWNER_CHANGED', null))).toBeNull()
  })
  it('a perda: o motivo (e a observação) que foi gravado no movimento', async () => {
    const { motivoDaPerdaNoEvento } = await import('@/lib/crm/linha-do-tempo')
    expect(motivoDaPerdaNoEvento(evento('STAGE_CHANGED', [{ campo: 'Motivo da perda', de: null, para: 'Fechou com outra — achou mais barato' }])))
      .toBe('Fechou com outra — achou mais barato')
    expect(motivoDaPerdaNoEvento(evento('STAGE_CHANGED', null))).toBeNull()
  })
  it('a tela usa as duas', () => {
    const t = fonte('components/branch/lead-timeline.tsx')
    expect(t).toContain('trocaDoResponsavel(e)')
    expect(t).toContain('motivoDaPerdaNoEvento(e)')
    expect(t).toContain('data-motivo-da-perda-no-historico')
  })
})
