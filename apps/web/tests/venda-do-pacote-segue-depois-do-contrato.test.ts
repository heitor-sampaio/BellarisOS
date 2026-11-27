import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A20 da 39ª (princípio 3; a regra do contrato antes do dinheiro: "assinado —
 * ou dispensado, com o motivo —, a venda fecha e o adota", vendas-financeiro.md,
 * e a dica do próprio bloco: "Assinado, a venda segue"): no PDV, "Vender por
 * R$ 360,00" pediu o contrato; colhido no papel, "Continuar" voltava ao
 * formulário com "Contrato assinado. Agora, o pagamento." e o mesmo "Vender
 * por" — a venda só saía num SEGUNDO clique, a tela não dizia que tinha
 * vendido, e o total do PDV seguia o velho. De volta da assinatura conferida, a
 * venda que a pessoa já pediu SEGUE: é o `vender()` de sempre, com o retorno de
 * sempre ("vendido", o PDV recarregado). O link e o "Pedir no portal" voltam
 * pelo "Já assinou: vender", o mesmo `vender()`.
 */
const f = readFileSync(join(__dirname, '..', 'components', 'shared', 'vender-pacote.tsx'), 'utf8')
const volta = f.slice(f.indexOf('function voltarDoContrato'), f.indexOf('function esquecerContrato'))
const vender = f.slice(f.indexOf('function vender('), f.indexOf('if (registrada) return'))

describe('a venda do pacote segue depois do contrato assinado', () => {
  it('conferido o ASSINADO, a venda pedida segue (sem um segundo clique)', () => {
    expect(volta).toMatch(/r\.doc\?\.status === 'ASSINADO'[\s\S]{0,200}vender\(/)
    expect(f).not.toContain('Contrato assinado. Agora, o pagamento.')
  })
  it('a resposta já dada (vender sem responsável) vale na venda que segue', () => {
    expect(vender).toMatch(/resposta\.semResponsavel \?\? semResponsavel/)
    expect(vender).toMatch(/semResponsavel: semR === true/)
  })
  it('vendido, o PDV recarrega o que o servidor gravou e a tela diz que vendeu', () => {
    expect(vender).toMatch(/router\.refresh\(\)/)
    expect(vender).toMatch(/setRegistrada\(aviso\)/)
  })
})
