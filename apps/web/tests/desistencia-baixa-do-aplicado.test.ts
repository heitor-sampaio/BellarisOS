import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A18 da 35ª simulação (princípio 3; PT-13/PT-19: a aplicação registrada neste
 * atendimento é o que foi aplicado): o Dr. Anselmo registrou no mapa 8 UI de
 * toxina e desistiu no meio; a janela do cancelamento oferecia "Baixar do
 * estoque o que já foi aplicado: Toxina 20 UI" — a dose do insumo no
 * procedimento, não a aplicada.
 */
const fonte = (arq: string) => readFileSync(join(__dirname, '..', arq), 'utf8')
const toxina = { productId: 'p-tox', name: 'Toxina botulínica', unit: 'U', quantity: 20 }
const luva = { productId: 'p-luva', name: 'Luva', unit: 'par', quantity: 1 }

describe('a baixa da desistência parte da aplicação registrada', () => {
  it('o produto aplicado vai com a dose aplicada; o resto, como estava', async () => {
    const { insumosDaDesistencia } = await import('@/lib/atendimento/desistencia')
    const r = insumosDaDesistencia([toxina, luva], [{ product: 'Toxina botulínica', unit: 'UI', total: 8, origem: 'APLICACAO' }], [])
    expect(r).toEqual([{ ...toxina, quantity: 8 }, luva])
  })
  it('o planejamento (sem aplicação) não é o aplicado: a baixa fica a da tela', async () => {
    const { insumosDaDesistencia } = await import('@/lib/atendimento/desistencia')
    expect(insumosDaDesistencia([toxina], [{ product: 'Toxina botulínica', unit: 'UI', total: 8, origem: 'PLANEJAMENTO' }], [])).toEqual([toxina])
    expect(insumosDaDesistencia([toxina], [], [])).toEqual([toxina])
  })
  it('o aplicado que não está nos insumos marcados entra, pelo produto do estoque', async () => {
    const { insumosDaDesistencia } = await import('@/lib/atendimento/desistencia')
    const r = insumosDaDesistencia([luva], [{ product: 'Toxina botulínica', unit: 'U', total: 8, origem: 'APLICACAO' }],
      [{ id: 'p-tox', name: 'Toxina botulínica', unit: 'U' }])
    expect(r).toEqual([luva, { productId: 'p-tox', name: 'Toxina botulínica', unit: 'U', quantity: 8 }])
  })
  it('a janela do cancelamento lê a aplicação deste atendimento e monta a baixa por ela', () => {
    const s = fonte('components/branch/appointment-session.tsx')
    const i = s.indexOf('function CancelModal')
    const janela = s.slice(i, s.indexOf('\nfunction ', i + 10))
    expect(janela).toMatch(/dosesDoMapaDoAtendimento\(appointmentId\)/)
    expect(janela).toMatch(/insumosDaDesistencia\(/)
  })
})
