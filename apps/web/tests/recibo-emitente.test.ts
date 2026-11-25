import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * "Quem recebeu" dizia duas coisas (princípio 7: o mesmo nome não diz duas
 * coisas): no Fechamento do dia é a PESSOA que registrou o recebimento ("Por
 * quem recebeu"); no recibo era o título da seção da rede e da unidade que
 * emitem o recibo. No recibo, a seção é "Emitente".
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')

describe('o recibo chama a rede e a unidade de "Emitente", não de "Quem recebeu"', () => {
  const recibo = ler('lib/financeiro/recibo.ts')

  it('a seção da rede e da unidade é "Emitente"', () => {
    expect(recibo).toContain("{ title: 'Emitente', fields: emitente }")
    expect(recibo).not.toContain("title: 'Quem recebeu'")
  })

  it('e "Quem recebeu" continua sendo a pessoa, no Fechamento do dia', () => {
    expect(ler('components/shared/fechamento-do-dia-tela.tsx')).toContain('Quem recebeu não registrado')
  })
})
