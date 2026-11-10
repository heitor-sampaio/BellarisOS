import { describe, it, expect } from 'vitest'
import { textoDaExigenciaDoModelo } from '@/lib/checkout/exigencia-do-modelo'

// A28 da 10ª simulação (2026-11-10): o checkout do plano exigia o contrato da
// cliente sem CPF, e a tela não dizia que quem exige é o modelo — que a clínica
// configura (princípio 1: a clínica decide).
describe('A28: a assinatura que trava o checkout diz de onde vem a exigência', () => {
  it('um documento', () => {
    expect(textoDaExigenciaDoModelo(['Contrato do plano'])).toBe(
      'Quem exige a assinatura de “Contrato do plano” é o modelo do documento: em Configurações → Documentos, a clínica escolhe se ele “Bloqueia” o checkout ou “Só avisa”.')
  })
  it('vários', () => {
    expect(textoDaExigenciaDoModelo(['Contrato do plano', 'Termo da toxina'])).toBe(
      'Quem exige a assinatura de “Contrato do plano” e “Termo da toxina” são os modelos dos documentos: em Configurações → Documentos, a clínica escolhe se cada um “Bloqueia” o checkout ou “Só avisa”.')
  })
  it('nenhum, nada', () => {
    expect(textoDaExigenciaDoModelo([])).toBeNull()
  })
})
