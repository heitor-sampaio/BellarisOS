import { describe, it, expect } from 'vitest'
import { valorDosPontosNoFormulario } from '@/lib/fidelidade/formato'

/**
 * O formulário da recompensa diz quanto os pontos do custo valem em reais
 * (fidelidade:RV-06; A5 da 7ª, e2e/configuracoes-atritos-da-7.spec.ts). O texto
 * sumia, sem aviso, quando o valor do ponto da rede é zero (A24 da 30ª): pelo
 * princípio 4 ("faltou o dado, vale zero e a tela avisa"), a tela diz que os
 * pontos não valem nada em reais. Sem custo digitado, não há o que dizer.
 */
describe('quanto os pontos do custo valem, no formulário da recompensa', () => {
  it('com o valor do ponto: o texto de sempre (A5 da 7ª)', () => {
    const t = valorDosPontosNoFormulario(2000, 0.01, 150)!
    expect(t).toMatch(/^2\.000 pontos valem R\$\s20,00 pelo valor do ponto \(R\$\s0,01, na configuração acima\) — o procedimento custa R\$\s150,00 na tabela\.$/)
    expect(valorDosPontosNoFormulario(2000, 0.01, null)).toMatch(/na configuração acima\)\.$/)
  })
  it('com o valor do ponto em zero: avisa, não some', () => {
    const t = valorDosPontosNoFormulario(400, 0, null)
    expect(t).toMatch(/400 pontos não valem nada em reais: o valor do ponto está em R\$\s0,00 na configuração acima\./)
  })
  it('sem custo digitado (a recompensa nova, antes de digitar): nada', () => {
    expect(valorDosPontosNoFormulario(0, 0.01, null)).toBeNull()
    expect(valorDosPontosNoFormulario(0, 0, null)).toBeNull()
  })
})
