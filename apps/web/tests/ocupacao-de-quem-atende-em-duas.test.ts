import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { semOsQueJaSaoCartao } from '@/lib/agenda/ocupado-fora'

/**
 * D13 da 33ª simulação (CLAUDE.md §13.1, um número, uma fonte; OC-03): o Dr.
 * Itamar atende em Barra e em Aragarças. No topo da agenda de Aragarças ele
 * via 28% (255/900) e o dashboard 30% (255/855); a Zuleide, 30% nos dois. A
 * página tirava do "ocupado fora" DELE os agendamentos que ela mostra como
 * cartão em "Seus atendimentos em outras unidades" — o que só vale na Minha
 * agenda, onde esses cartões entram na grade e voltam à ocupação como "ocupado
 * fora". Na agenda inteira eles não entram em lugar nenhum: os 45 min da outra
 * unidade sumiam da conta só para quem atende nas duas.
 */
const bloco = (inicio: string, minutos: number) => ({ inicio, minutos, onde: 'Barra do Garças' })

describe('semOsQueJaSaoCartao', () => {
  it('tira, um a um, os que já são cartão, e não mexe na lista de entrada', () => {
    const fora = [bloco('2026-11-26T13:00:00.000Z', 45), bloco('2026-11-26T15:00:00.000Z', 30)]
    const copia = JSON.parse(JSON.stringify(fora))
    expect(semOsQueJaSaoCartao(fora, [{ scheduled_at: '2026-11-26T13:00:00.000Z', duration_min: 45 }]))
      .toEqual([bloco('2026-11-26T15:00:00.000Z', 30)])
    expect(fora, 'a lista da agenda inteira fica como está').toEqual(copia)
  })
  it('dois iguais e um cartão: sai um só', () =>
    expect(semOsQueJaSaoCartao([bloco('x', 30), bloco('x', 30)], [{ scheduled_at: 'x', duration_min: 30 }])).toEqual([bloco('x', 30)]))
})

describe('a página da agenda', () => {
  const pagina = readFileSync(join(__dirname, '..', 'app/[slug]/agenda/page.tsx'), 'utf8')
  it('a agenda inteira recebe o "ocupado fora" inteiro, também o de quem vê', () => {
    expect(pagina).toMatch(/ocupadoForaDosProfissionais=\{ocupadoFora\}/)
    expect(pagina, 'nada reescreve o ocupado fora de quem vê').not.toMatch(/ocupadoFora\[ctx\.internalUserId\]\s*=/)
  })
  it('só a Minha agenda tira os que já são cartão', () =>
    expect(pagina).toMatch(/ocupadoFora=\{semOsQueJaSaoCartao\(ocupadoFora\[ctx\.internalUserId \?\? ''\] \?\? \[\], meusDeFora\)\}/))
})
