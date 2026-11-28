import { describe, it, expect } from 'vitest'
import { textoDoJaUsado } from '@/lib/creditos/bonus'

// A31 da 12ª simulação: o estorno do crédito da Bruna (R$ 300 pagos + R$ 30 de
// bônus, R$ 180 usados, o bônus na proporção) dizia "Já usado R$ 163,64" — a
// diferença para os R$ 180 era a fatia do bônus, e a tela não dizia.
describe('A31: o "Já usado" do estorno do crédito diz a fatia do bônus', () => {
  const sem = (s: string) => s.replace(/ /g, ' ')
  it('na proporção: os R$ 180 usados, R$ 16,36 deles do bônus', () => {
    expect(sem(textoDoJaUsado({ usado: 163.64, bonus: 30, bonusSai: 13.64 }))).toBe('R$ 180,00 usados, R$ 16,36 deles do bônus')
  })
  it('o bônus saindo inteiro: tudo o que foi usado foi do pago', () => {
    expect(sem(textoDoJaUsado({ usado: 180, bonus: 30, bonusSai: 30 }))).toBe('R$ 180,00')
  })
  it('sem bônus: só o usado', () => {
    expect(sem(textoDoJaUsado({ usado: 119, bonus: 0, bonusSai: 0 }))).toBe('R$ 119,00')
  })
})

// D1 da 41ª simulação (CI-08, o Heitor, 2026-11-10: "No estorno sai o bonus junto, a clinica decide se
// integral ou parcial"): R$ 400 pagos + R$ 40 de bônus, R$ 165 usados (saldo R$ 275). Na proporção
// voltam R$ 250 e saem R$ 25 — e o estorno era sempre recusado ("Os valores do crédito mudaram…"): ao
// marcar "Na proporção", a janela já mostrava a conta e deixava confirmar com a conta da simulação
// ANTERIOR (a do inteiro, R$ 235), antes de a nova chegar; o banco calculava R$ 250 e recusava.
describe('D1: a conta da janela é a da escolha do bônus', async () => {
  const { lerPreviaDoEstornoDoCredito, contaDaEscolha } = await import('@/lib/creditos/venda-de-credito')
  const opcoes = { INTEIRO: { volta: 235, bonus_sai: 40 }, PROPORCIONAL: { volta: 250, bonus_sai: 25 } }
  const base = { vendido: 400, pago: 400, saldo: 275, metodo: 'PIX', vezes: null, bonus: 40, concedido_fica: 0, opcoes_do_bonus: opcoes }
  // A simulação de quando a janela abre (sem escolha: a conta do inteiro).
  const aoAbrir = lerPreviaDoEstornoDoCredito({ ...base, volta: 235, usado: 165, bonus_sai: 40, bonus_como: null })
  const naProporcao = lerPreviaDoEstornoDoCredito({ ...base, volta: 250, usado: 150, bonus_sai: 25, bonus_como: 'PROPORCIONAL' })
  const inteiro = lerPreviaDoEstornoDoCredito({ ...base, volta: 235, usado: 165, bonus_sai: 40, bonus_como: 'INTEIRO' })
  it('marcada "Na proporção", a conta do inteiro não vale: espera a da proporção', () => {
    expect(contaDaEscolha(aoAbrir, 'PROPORCIONAL')).toBeNull()
  })
  it('chegada a da proporção, volta R$ 250 e saem R$ 25 — o que vai ao banco como esperado', () => {
    const c = contaDaEscolha(naProporcao, 'PROPORCIONAL')
    expect([c?.volta, c?.bonusSai, c?.usado]).toEqual([250, 25, 150])
  })
  it('o inteiro só com a conta do inteiro; sem escolher, nenhuma', () => {
    expect(contaDaEscolha(naProporcao, 'INTEIRO')).toBeNull()
    expect(contaDaEscolha(inteiro, 'INTEIRO')?.volta).toBe(235)
    expect(contaDaEscolha(aoAbrir, null)).toBeNull()
  })
  it('sem bônus, a conta é a de sempre', () => {
    const semBonus = lerPreviaDoEstornoDoCredito({ vendido: 300, pago: 300, saldo: 181, volta: 181, usado: 119, bonus: 0, bonus_sai: 0, bonus_como: null })
    expect(contaDaEscolha(semBonus, null)?.volta).toBe(181)
  })
})
