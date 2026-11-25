import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O modal "Novo lançamento" fecha (e renova a chave do envio) a CADA
 * lançamento gravado (princípios 3 e 7): o efeito dependia de
 * `state?.success`, que já era `true` desde o primeiro — na segunda despesa
 * seguida o valor não mudava, o efeito não rodava, e o modal ficava aberto com
 * o valor ainda lá, convidando a lançar duas vezes. A action devolve um objeto
 * novo a cada envio (`useActionState`): é ele que o efeito acompanha.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')

describe('o Novo lançamento fecha também no segundo lançamento seguido', () => {
  const modal = ler('components/branch/financial-transaction-modal.tsx')

  it('o efeito que fecha acompanha cada resposta da action, não só o "deu certo"', () => {
    expect(modal).not.toMatch(/\}, \[state\?\.success, close, envio\]\)/)
    expect(modal).toMatch(/if \(state\?\.success\) \{ envio\.renovar\(\); close\(\) \}\s*\}, \[state, close, envio\]\)/)
  })
})
