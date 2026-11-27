import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O card fechado e a aba de oportunidades vazia (A7 e A6 da 35ª simulação).
 * - A7: o lembrete "Retornar hoje" seguia destacado no card PERDIDO. O card
 *   ganho ou perdido não avisa no sino (OP-33), e a tela segue o mesmo
 *   (princípio 3; Decisão C2 do relatório, decisão do Claude, 27/11): o
 *   lembrete fica no card, com o dia, sem o destaque de hoje nem de atrasado.
 * - A6: a aba Oportunidades vazia mandava abrir uma "pela conversa no Inbox"
 *   numa rede sem WhatsApp. A lista vazia diz só que não há (princípio 7,
 *   "intuitivo não é explicativo", o Heitor, 26/11).
 */

const RAIZ = join(__dirname, '..')
const fonte = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')

describe('A7: o lembrete de retorno no card ganho ou perdido não destaca (OP-33, Decisão C2)', () => {
  it('no card aberto, segue o de sempre: hoje e atrasado em destaque', async () => {
    const { retornoNoCard } = await import('@/lib/crm/retorno')
    expect(retornoNoCard('2026-11-27', '2026-11-27', 'OPEN')).toEqual({ texto: 'Retornar hoje', destaque: 'hoje' })
    expect(retornoNoCard('2026-11-20', '2026-11-27', 'OPEN')).toEqual({ texto: 'Retorno atrasado (20/11)', destaque: 'atrasado' })
    expect(retornoNoCard('2026-12-02', '2026-11-27', null)).toEqual({ texto: 'Retornar 02/12', destaque: null })
  })
  it('no card perdido ou ganho, o dia sem destaque — nem "hoje" nem "atrasado"', async () => {
    const { retornoNoCard } = await import('@/lib/crm/retorno')
    for (const desfecho of ['LOST', 'WON']) {
      expect(retornoNoCard('2026-11-27', '2026-11-27', desfecho)).toEqual({ texto: 'Retornar 27/11', destaque: null })
      expect(retornoNoCard('2026-11-20', '2026-11-27', desfecho)).toEqual({ texto: 'Retornar 20/11', destaque: null })
    }
  })
  it('o quadro passa o desfecho da etapa do card', () => {
    const quadro = fonte('components/branch/crm-board.tsx')
    expect(quadro).toMatch(/retornoNoCard\(\s*lead\.retornar_em,[\s\S]{0,200}allStages\.find\(s => s\.id === lead\.crm_stage_id\)\?\.outcome/)
    expect(quadro).not.toMatch(/textoDoRetorno\(/)
  })
})

describe('A6: a aba Oportunidades vazia diz só que não há (princípio 7)', () => {
  it('sem a instrução de abrir pela conversa no Inbox', () => {
    const ficha = fonte('components/branch/client-profile.tsx')
    expect(ficha).not.toMatch(/Abra uma pela conversa no Inbox/)
    expect(ficha).toMatch(/opportunities\.length === 0 \? \([\s\S]{0,300}>\s*Nenhuma oportunidade\.\s*<\/div>/)
  })
})
