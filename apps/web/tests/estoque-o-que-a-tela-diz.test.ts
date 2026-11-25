import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loteNoCartao } from '@/components/shared/cartoes-do-estoque'
import { LotesVencendo } from '@/components/shared/lotes-vencendo'
import { EstoqueAbaixoDoMinimo } from '@/components/shared/estoque-abaixo-do-minimo'
import { saldoDoLoteNaTela } from '@/lib/estoque/situacao'

/**
 * O que as telas do Estoque DIZEM do lote e do mínimo (princípio 3: o que a
 * tela mostra é o que vale; ES-19, ES-20, ES-24 do catálogo).
 */

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-11-25T15:00:00Z')

describe('o cartão "Validade em 30 dias" sinaliza o vencido (D12 da 28ª, ES-24)', () => {
  it('"venceu" para o lote vencido, "vence" para o que ainda vale', () => {
    expect(loteNoCartao('Hidratante', { numero: 'H1', validade: '2026-11-14' }, AGORA, FUSO)).toBe('Hidratante — lote H1 · venceu 14/11/2026')
    expect(loteNoCartao('Hidratante', { numero: 'H2', validade: '2026-12-15' }, AGORA, FUSO)).toBe('Hidratante — lote H2 · vence 15/12/2026')
    // No dia da validade o lote ainda vale.
    expect(loteNoCartao('Gel', { numero: null, validade: '2026-11-25' }, AGORA, FUSO)).toBe('Gel — lote sem número · vence 25/11/2026')
  })
  it('as duas telas do Estoque passam o agora e o fuso da unidade', () => {
    for (const p of ['app/[slug]/estoque/page.tsx', 'app/admin/estoque/page.tsx']) {
      expect(fonte(p)).toMatch(/loteNoCartao\(nomeDoProduto\.get\(l\.produtoId\) \?\? '', l, now, fuso\)/)
    }
  })
})

describe('o saldo do lote na unidade de consumo, com o equivalente em embalagens (D13 da 28ª, ES-19)', () => {
  const acido = { unit: 'frasco', consumption_unit: 'ml', units_per_package: 30 }
  it('"22 ml · 0,73 frasco"; sem unidade de consumo, só a embalagem', () => {
    expect(saldoDoLoteNaTela(0.7334, acido)).toBe('22 ml · 0,73 frasco')
    expect(saldoDoLoteNaTela(3, acido)).toBe('90 ml · 3 frascos')
    expect(saldoDoLoteNaTela(2, { unit: 'frasco', consumption_unit: null, units_per_package: null })).toBe('2 frascos')
  })
  it('o lote que vence logo leva o saldo pronto (dashboard e Relatórios)', () => {
    expect(fonte('lib/estoque/lotes.ts')).toMatch(/saldo:\s+saldoDoLoteNaTela\(/)
  })
  it('o quadro do dashboard mostra o saldo pronto', () => {
    const html = renderToStaticMarkup(createElement(LotesVencendo, {
      agora: AGORA.toISOString(), fuso: FUSO,
      lotes: [{ id: 'l1', produto: 'Ácido', numero: 'A1', validade: '2026-12-01', quantidade: 0.7334, embalagem: 'frasco', saldo: '22 ml · 0,73 frasco', href: '#' }],
    }))
    expect(html).toContain('22 ml · 0,73 frasco')
    expect(html).not.toContain('0,73 frasco ·')
  })
  it('os dois dashboards levam o saldo pronto ao quadro', () => {
    for (const p of ['app/[slug]/dashboard/page.tsx', 'app/admin/dashboard/page.tsx']) {
      expect(fonte(p), p).toMatch(/lotesVencendoDoRecorte\([^)]*\)\)\.map\([\s\S]{0,400}saldo: l\.saldo/)
    }
  })
  it('os Relatórios mostram o saldo pronto na coluna Qtd, não a quantidade crua ("0.7334")', () => {
    expect(fonte('components/admin/reports-bi-section.tsx')).toMatch(/saldo: l\.saldo/)
    const view = fonte('components/admin/reports-bi-view.tsx')
    expect(view).toMatch(/qty:\s+b\.saldo/)
    expect(view).not.toMatch(/qty:\s+Number\(b\.quantity\)/)
  })
})

describe('o quadro do mínimo conta como o Estoque: "Sem estoque" é separado (D14 da 28ª, ES-20)', () => {
  const itens = [
    { productName: 'Gel', saldo: '2 frascos', minimo: '5 frascos', situacao: 'Abaixo do mínimo', semEstoque: false },
    { productName: 'Protetor', saldo: '0 un', minimo: '5 un', situacao: 'Sem estoque', semEstoque: true },
  ]
  it('o número do quadro conta só o no mínimo ou abaixo', () => {
    const html = renderToStaticMarkup(createElement(EstoqueAbaixoDoMinimo, { itens, href: '#' }))
    expect(html).toMatch(/data-conta-do-minimo[^>]*>1</)
    expect(html).toContain('data-sem-estoque')
    expect(html).toContain('Protetor')
  })
  it('a leitura marca o zerado à parte e não corta a lista antes de contar', () => {
    const l = fonte('lib/estoque/abaixo-do-minimo.ts')
    expect(l).toMatch(/semEstoque:\s+s\.situacao === 'SEM_ESTOQUE'/)
    expect(l).not.toMatch(/\.slice\(0, limite\)/)
  })
})

describe('o seletor de lote do ajuste e da perda (A1 da 28ª, ES-24)', () => {
  const m = fonte('components/admin/admin-stock-manage-modal.tsx')
  it('não promete "o que vence primeiro" — a saída tira do VÁLIDO que vence antes, e o vencido por último', () => {
    expect(m).not.toContain('<option value="">O que vence primeiro</option>')
    expect(m).not.toContain('Sem lote — sai o que vence primeiro')
    expect(m).toContain('O válido que vence primeiro')
  })
  it('a opção do lote vencido diz "venceu"', () => {
    expect(m).not.toContain('· vence ${validadeNaTela(l.validade)}')
    expect(m).toContain("loteVencido(l.validade, agora, fuso) ? 'venceu' : 'vence'")
  })
})

describe('o custo do insumo diz a unidade (A3 da 28ª, ES-19)', () => {
  it('o campo do custo leva a unidade de consumo ("/ml")', () => {
    const f = fonte('components/admin/procedure-form.tsx')
    expect(f).toMatch(/<CustoDoInsumo unidade=\{/)
    expect(f).toContain('data-custo-por-unidade')
  })
})
