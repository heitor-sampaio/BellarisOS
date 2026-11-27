import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { fraseDaEspera } from '@/lib/automacoes/frase-da-espera'

/**
 * A14 da 38ª: com a automação desligada, a lista das execuções seguia dizendo
 * "Segue em …" das que esperam — e elas não seguem: quando a hora chega, o
 * motor as encerra com "Automação não está ativa." (`executar.ts`). RX-05 e
 * princípio 3: a lista diz o estado de verdade — a espera parada porque a
 * automação está desligada —, sem parágrafo. O motor não muda (religada antes
 * da hora, a execução segue, e a lista volta a dizer "Segue em …").
 */
const fonte = (arquivo: string) => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8')
const FUSO = 'America/Sao_Paulo'

describe('A14: a execução que espera numa automação desligada', () => {
  it('não diz "Segue em": diz que a automação está desligada', () => {
    const frase = fraseDaEspera({ retomaEm: '2026-11-28T12:00:00.000Z', situacaoDoAgendamento: 'CONFIRMED' }, FUSO, false)
    expect(frase).toBe('A automação está desligada.')
  })

  it('também a que ia reconferir um agendamento que caiu', () => {
    expect(fraseDaEspera({ retomaEm: '2026-11-28T12:00:00.000Z', situacaoDoAgendamento: 'CANCELLED' }, FUSO, false))
      .toBe('A automação está desligada.')
  })

  it('ligada, segue dizendo quando segue (RX-05)', () => {
    expect(fraseDaEspera({ retomaEm: '2026-11-28T12:00:00.000Z', situacaoDoAgendamento: 'CONFIRMED' }, FUSO, true))
      .toBe('Segue em 28/11 às 09:00.')
  })

  it('o editor diz ao painel se a automação está ligada, e o painel marca a espera como parada', () => {
    const editor = fonte('components/admin/automacoes/editor.tsx')
    expect(editor).toMatch(/<PainelDeExecucoes[\s\S]*?ligada=\{status === 'ATIVA'\}/)
    const painel = fonte('components/admin/automacoes/painel-de-execucoes.tsx')
    expect(painel).toMatch(/fraseDaEspera\(ex, fuso, ligada\)/)
    expect(painel).toMatch(/rotulo: 'Parada'/)
  })
})
