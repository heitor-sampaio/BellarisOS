import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CONFIG_DA_REDE, falaQueGuardaARecusa } from '@/lib/configuracao-da-rede'
import { vocabulario } from '@/lib/unidades/vocabulario'

/**
 * A recusa da configuração da rede toda é UMA frase (CU-03: "Esta
 * configuração é só da Admin da rede."). A3 da 40ª simulação: na rede de uma
 * unidade, a mesma tela de Configurações dizia "só da Admin da rede" no
 * cartão da aba e "só da Admin" no aviso da aba fechada — o aviso passava
 * pela fala da rede de uma unidade (CG-25, "Admin da rede" vira "Admin"), o
 * cartão não. A frase da recusa passa inteira; o resto da fala muda como
 * sempre. Decisão do Claude, 27/11: vence a frase do CU-03, que os E2E da
 * rede de uma unidade já exigem (`configuracoes-atritos-da-14.spec.ts`, A5).
 */
const ler = (f: string) => readFileSync(path.resolve(__dirname, '..', f), 'utf8')

describe('a recusa da configuração da rede não muda na rede de uma unidade', () => {
  const umaUnidade = vocabulario(true, 'Estética Bella')

  it('a frase do CU-03 passa inteira, e o resto da fala muda', () => {
    const fala = falaQueGuardaARecusa(umaUnidade)
    expect(fala(`A aba Tags: ${CONFIG_DA_REDE} Quem muda: Ana. Você está na aba Geral.`))
      .toBe('A aba Tags: Esta configuração é só da Admin da rede. Quem muda: Ana. Você está na aba Geral.')
    expect(fala('A aba Fidelidade é da rede toda: quem muda é a Admin da rede. Você está na aba Geral.'))
      .toBe('A aba Fidelidade é da rede toda: quem muda é a Admin. Você está na aba Geral.')
    expect(fala('Rede')).toBe('Estética Bella')
  })

  it('com duas unidades, nada muda', () => {
    const fala = falaQueGuardaARecusa(vocabulario(false, 'Estética Bella'))
    expect(fala(`A aba Tags: ${CONFIG_DA_REDE}`)).toBe(`A aba Tags: ${CONFIG_DA_REDE}`)
  })

  it('o aviso da aba fechada das Configurações usa a fala que guarda a recusa', () => {
    const f = ler('app/_shared/configuracoes.tsx')
    expect(f).not.toContain('{fala(abaFechada)}')
    expect(f).toContain('falaQueGuardaARecusa(fala)(abaFechada)')
  })
})
