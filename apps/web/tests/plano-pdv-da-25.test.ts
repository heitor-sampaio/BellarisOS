import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { rodapeDoPlanoFechado } from '@/lib/plano-de-tratamento/textos'
import { recusaDaSessaoNaoLiberada, textoDoPacoteEmAberto } from '@/lib/pacotes/regras'

const raiz = path.join(__dirname, '..')
const ler = (rel: string) => readFileSync(path.join(raiz, rel), 'utf8')
const sp = (s: string | null) => (s ?? '').replace(/ /g, ' ')

/**
 * D1 da 25ª simulação (princípio 3; o Heitor, 18/11: "Uma coisa só foi vendida
 * se foi paga."): o plano ACEITO e ainda não recebido aparecia como "Plano
 * fechado e pago.", com "A receber R$ 0,00" — o aceite não tem dinheiro nenhum
 * (`plano_aceitar`), e o resumo só lia lançamentos.
 */
describe('D1: o plano aceito e não recebido não é "fechado e pago"', () => {
  it('o rodapé diz que falta receber no PDV', () => {
    const t = rodapeDoPlanoFechado(0, null, { naoRecebido: true })
    expect(t).not.toMatch(/fechado e pago/)
    expect(t).toBe('Plano aceito e ainda não recebido: a comanda do plano está no PDV.')
  })
  it('o pago de fato segue "fechado e pago"', () => {
    expect(rodapeDoPlanoFechado(0, null)).toBe('Plano fechado e pago.')
  })
  it('o resumo destaca o "A receber" com o valor do plano e passa o não recebido ao rodapé', () => {
    const t = ler('components/branch/planejamento-tratamento.tsx')
    expect(t).toMatch(/rodapeDoPlanoFechado\(resumo\.aReceber, noPdv\.quem, \{ naoRecebido: !!faltaReceber \}\)/)
    expect(t).toMatch(/const aReceberNaTela = faltaReceber \? resumo\.valor : resumo\.aReceber/)
  })
})

/**
 * A14 da 25ª: a ficha dizia só "se recebe no PDV" — mas a transferência que
 * caiu na conta tem baixa no Financeiro (CX2, aprovado pelo Heitor em 13/11:
 * "Blz pode ser assim"; vendas-financeiro.md). As duas portas são regra.
 */
describe('A14: o que falta se recebe no PDV, e a transferência tem baixa no Financeiro', () => {
  const FINANCEIRO = 'Se caiu na conta, a baixa é no Financeiro.'
  it('o rodapé do plano fechado', () => {
    expect(rodapeDoPlanoFechado(414, null)).toContain(FINANCEIRO)
    expect(rodapeDoPlanoFechado(414, ['Lúcia'])).toContain(FINANCEIRO)
  })
  it('o pacote em aberto', () => {
    expect(textoDoPacoteEmAberto(true)).toContain(FINANCEIRO)
    expect(textoDoPacoteEmAberto(false)).toContain(FINANCEIRO)
    expect(sp(recusaDaSessaoNaoLiberada({ crediarioLibera: false, vencidoCancela: false }, 300))).toContain(FINANCEIRO)
  })
})
