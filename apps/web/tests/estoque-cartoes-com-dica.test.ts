import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DICA_DO_VALOR, DICA_DO_GIRO, DETALHE_DO_GIRO } from '@/lib/estoque/situacao'

/**
 * A14 da 31ª simulação (2026-11-26; princípio 7): os cartões Valor em estoque e
 * Giro não tinham dica — quem só vê não sabia o que contam —, e o Valor não dizia
 * que é a custo de lote (`metrics_valor_em_estoque` → `valor_do_saldo`: o saldo
 * ao custo dos lotes com saldo; o que nenhum lote com custo cobre, ao último
 * custo). O Giro é o custo dos insumos dos atendimentos no mês
 * (`metrics_giro_estoque`: PROCEDURE_USAGE). Os dois ganham a `<Dica>`, nos dois
 * portais; o detalhe do Giro fica.
 */
const ler = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')

describe('os cartões Valor e Giro do Estoque têm dica', () => {
  it('as dicas dizem o que cada um conta', () => {
    expect(DICA_DO_VALOR).toMatch(/custo do lote/)
    expect(DICA_DO_VALOR).toMatch(/último custo/)
    expect(DICA_DO_VALOR).toMatch(/não é o preço de venda/i)
    expect(DICA_DO_GIRO).toMatch(/atendimentos/)
    expect(DICA_DO_GIRO).toMatch(/venda de produto/)
    expect(DETALHE_DO_GIRO).toBe('insumos dos atendimentos, sem a venda de produto')
  })

  it('o cartão desenha a Dica, e as duas páginas do Estoque a passam ao Valor e ao Giro', () => {
    const cartoes = ler('components/shared/cartoes-do-estoque.tsx')
    expect(cartoes).toMatch(/<Dica rotulo=/)
    for (const pagina of ['app/admin/estoque/page.tsx', 'app/[slug]/estoque/page.tsx']) {
      const src = ler(pagina)
      expect(src, pagina).toMatch(/dica:\s+DICA_DO_VALOR/)
      expect(src, pagina).toMatch(/dica:\s+DICA_DO_GIRO/)
    }
  })
})
