import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { textoDosLotesDaBaixa } from '@/lib/estoque/fefo'

/**
 * D11 da 41ª (princípio 3; AT-20 "Baixar do estoque o que já foi aplicado"): a
 * tela do atendimento desistido no meio dizia "50 UI … Saiu do lote L-A2: 12 UI;
 * 38 UI sem lote" — os 50 eram o insumo do cadastro do procedimento, e os 38
 * "sem lote" nunca saíram do estoque. A baixa gravada foi 12 UI.
 *
 * O cancelado mostra, como o concluído, os insumos da BAIXA feita (o
 * `PROCEDURE_USAGE` do atendimento); sem baixa, nenhum insumo.
 */
const pagina = readFileSync(join(__dirname, '..', 'app/_shared/sessao-de-atendimento.tsx'), 'utf8')

describe('o atendimento cancelado mostra a baixa gravada, não o cadastro do procedimento', () => {
  it('os insumos do cancelado são os da baixa feita', () => {
    const i = pagina.indexOf('const insumosDaBaixa')
    expect(i).toBeGreaterThan(-1)
    const decl = pagina.slice(i, pagina.indexOf('?', i))
    expect(decl).toMatch(/'COMPLETED'/)
    expect(decl).toMatch(/'CANCELLED'/)
  })

  it('com a baixa gravada, o texto do lote não inventa "sem lote"', () => {
    const partes = [{ id: 'l', numero: 'L-A2', validade: null, quantidade: 12 }]
    expect(textoDosLotesDaBaixa(partes, 'UI', 12, true)).toBe('Saiu do lote L-A2')
  })
})
