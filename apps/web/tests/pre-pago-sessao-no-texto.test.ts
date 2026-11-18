import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { textoDoCreditoNoApp } from '@/lib/creditos/texto-do-pago'

const ler = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8')

/**
 * A6 da 25ª simulação (CLAUDE.md §1: "Unidade é uma unidade que pertence à
 * rede"): as sessões do pré-pago apareciam como "Unidade 1/2/3", "Unidade
 * agendada.", "Cancelar unidade", "Unidade cancelada." — na ficha de uma rede
 * de duas unidades, "unidade" é outra coisa. Na tela é "Sessão". Os nomes
 * internos (`procedure_sale_units`, `unidadeId`) ficam: são do código.
 */
describe('A6: o pré-pago fala em sessão, não em unidade', () => {
  it('a lista do pré-pago da ficha', () => {
    const t = ler('components/shared/procedimentos-pagos.tsx')
    expect(t).not.toMatch(/>Unidade \{u\.numero\}</)
    expect(t).toMatch(/>Sessão \{u\.numero\}</)
    expect(t).not.toMatch(/'Unidade agendada\.'/)
    expect(t).toMatch(/'Sessão agendada\.'/)
  })
  it('o cancelamento', () => {
    const t = ler('components/shared/cancelar-unidade-pre-paga.tsx')
    expect(t).not.toMatch(/Unidade cancelada|Cancelar unidade|Cancelar a unidade|>Unidade \{previa|A unidade deixa de valer/)
    expect(t).toMatch(/rotulo="Cancelar sessão"/)
  })
  it('as recusas das actions do pré-pago (a sessão, não a unidade da rede)', () => {
    const t = ler('actions/pre-pago.ts')
    // Só a recusa da unidade da REDE (a da venda) diz "Unidade não encontrada.".
    expect((t.match(/'Unidade não encontrada\.'/g) ?? []).length).toBe(1)
    expect((t.match(/'Sessão não encontrada\.'/g) ?? []).length).toBe(3)
  })
  it('o app diz "(sessão 2 de 3)" no pré-pago', () => {
    expect(textoDoCreditoNoApp({ tipo: 'PRE_PAGO', origem: 'Pré-pago', procedimento: 'Limpeza', numero: 2, total: 3 }))
      .toBe('Incluído no pré-pago de Limpeza (sessão 2 de 3)')
  })
  it('o estorno da venda do pré-pago', () => {
    expect(ler('actions/financial.ts')).not.toMatch(/cancele a unidade pré-paga/)
  })
})
