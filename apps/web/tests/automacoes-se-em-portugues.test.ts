import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { CAMPOS_DO_EVENTO, EVENTOS } from '@estetica-os/types'

/**
 * A27 da 32ª simulação (princípio 7). O "Se" das automações dizia "Desfecho
 * da etapa (OPEN, WON, LOST)" e a "Etapa" era texto livre (o nome exato). Os
 * valores aparecem em português (Aberta, Ganha, Perdida) e a etapa sai de uma
 * lista das etapas da rede; o valor gravado continua o que o motor compara
 * (o código do desfecho, o nome da etapa).
 */

const fonte = (arquivo: string) => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8')

describe('A27: o desfecho e a etapa no "Se"', () => {
  it('o campo do desfecho fala português', () => {
    const rotulos = CAMPOS_DO_EVENTO[EVENTOS.LEAD_ETAPA_MUDOU].map(c => c.rotulo)
    expect(rotulos).toContain('Desfecho da etapa (aberta, ganha ou perdida)')
    expect(rotulos.join(' ')).not.toMatch(/OPEN|WON|LOST/)
  })

  it('os desfechos pelo nome, com o código que o motor compara', async () => {
    const { DESFECHOS_DA_ETAPA, ehDesfechoDaEtapa } = await import('@/lib/automacoes/resumo')
    expect(DESFECHOS_DA_ETAPA).toEqual([
      { valor: 'OPEN', rotulo: 'Aberta' }, { valor: 'WON', rotulo: 'Ganha' }, { valor: 'LOST', rotulo: 'Perdida' },
    ])
    expect(ehDesfechoDaEtapa('evento.dados.desfecho')).toBe(true)
    expect(ehDesfechoDaEtapa('evento.dados.etapaNome')).toBe(false)
  })

  it('os campos de etapa: a do fato, a anterior e a da oportunidade', async () => {
    const { CAMPOS_DE_ETAPA } = await import('@/lib/automacoes/disponiveis')
    expect([...CAMPOS_DE_ETAPA].sort()).toEqual(['evento.dados.deEtapaNome', 'evento.dados.etapaNome', 'lead.etapa'])
  })

  it('o painel do "Se" escolhe o desfecho e a etapa numa lista', () => {
    const painel = fonte('components/admin/automacoes/painel-do-no.tsx')
    expect(painel).toMatch(/ehDesfechoDaEtapa\(r\.campo\)/)
    expect(painel).toMatch(/CAMPOS_DE_ETAPA\.has\(r\.campo\)/)
    expect(painel).toMatch(/Escolha a etapa…/)
    expect(painel).toMatch(/etapas=\{opcoes\?\.etapas/)
  })
})
