import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A6 da 34ª simulação (princípio 7): no PDV, depois de assinar o contrato do
 * pacote ("primeiro colhe assinatura, depois paga" — PC2), a venda voltava
 * zerada: a aba, quem vendeu, a forma e as parcelas. O que a pessoa escolheu
 * para a venda fica guardado na aba do navegador (sessionStorage, por unidade e
 * cliente) enquanto o contrato espera a assinatura, e volta se a tela se monta
 * de novo (o refresh da assinatura, o recarregar). Nada que o servidor não
 * confira de novo: a venda confere o contrato assinado e o pagamento.
 */
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

class ArmazemFalso {
  dados = new Map<string, string>()
  getItem(k: string) { return this.dados.get(k) ?? null }
  setItem(k: string, v: string) { this.dados.set(k, v) }
  removeItem(k: string) { this.dados.delete(k) }
}

const venda = {
  pacoteId: 'p2',
  estado: { forma: 'PARCELADO', metodo: 'PIX', entrada: '100,00', parcelas: 5, data: '2026-12-26', vencimento: '', vezes: 1, bandeira: '' },
  desconto: { tipo: 'VALOR', texto: '' },
  vendedorId: 'u1', semVendedor: false, responsavelId: 'u9',
} as const

describe('a venda do pacote guardada na aba', () => {
  beforeEach(() => { (globalThis as { window?: unknown }).window = { sessionStorage: new ArmazemFalso() } })

  it('guarda e devolve o que foi escolhido, por unidade e cliente', async () => {
    const m = await import('@/lib/vendas/venda-do-pacote-na-aba')
    m.guardarVendaDoPacote('b1', 'c1', venda)
    expect(m.lerVendaDoPacote('b1', 'c1')).toEqual(venda)
    expect(m.lerVendaDoPacote('b1', 'outra')).toBeNull()
    expect(m.lerVendaDoPacote('outra', 'c1')).toBeNull()
  })

  it('o que não confere não volta, e esquecer apaga', async () => {
    const m = await import('@/lib/vendas/venda-do-pacote-na-aba')
    const w = (globalThis as unknown as { window: { sessionStorage: ArmazemFalso } }).window
    w.sessionStorage.setItem(m.chaveDaVendaDoPacote('b1', 'c1'), JSON.stringify({ pacoteId: 'p2', estado: { forma: 'QUALQUER' } }))
    expect(m.lerVendaDoPacote('b1', 'c1')).toBeNull()
    m.guardarVendaDoPacote('b1', 'c1', venda)
    m.esquecerVendaDoPacote('b1', 'c1')
    expect(m.lerVendaDoPacote('b1', 'c1')).toBeNull()
  })

  it('sem o armazenamento, nada quebra', async () => {
    (globalThis as { window?: unknown }).window = undefined
    const m = await import('@/lib/vendas/venda-do-pacote-na-aba')
    expect(() => m.guardarVendaDoPacote('b1', 'c1', venda)).not.toThrow()
    expect(m.lerVendaDoPacote('b1', 'c1')).toBeNull()
  })

  it('o formulário guarda ao pedir o contrato, relê ao montar e esquece ao vender ou cancelar', () => {
    const f = fonte('components/shared/vender-pacote.tsx')
    expect(f).toMatch(/guardarVendaDoPacote\(/)
    expect(f).toMatch(/lerVendaDoPacote\(/)
    expect(f.match(/esquecerVendaDoPacote\(/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('a venda volta na aba do pacote', () => {
    expect(fonte('components/shared/vender.tsx')).toMatch(/lerVendaDoPacote\(branchId, clienteId\)[\s\S]{0,120}setAba\('PACOTE'\)/)
  })
})
