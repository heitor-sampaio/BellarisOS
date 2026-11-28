import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { saldoNaPrateleira, disponivelEmEmbalagens, textoDoDisponivel } from '@/lib/estoque/saldo-em-texto'

// A50 da 11ª: "Atual: 11 frasco" para 10,84.
describe('A50: o saldo como está na prateleira', () => {
  it('fechados e o aberto', () => {
    expect(saldoNaPrateleira(10840, 1000, 'refil', 'g')).toBe('10 refis fechados + 1 aberto com 840 g')
    expect(saldoNaPrateleira(1840, 1000, 'refil', 'g')).toBe('1 refil fechado + 1 aberto com 840 g')
    expect(saldoNaPrateleira(840, 1000, 'refil', 'g')).toBe('1 refil aberto com 840 g')
  })
  it('sem aberto, só as embalagens', () => {
    expect(saldoNaPrateleira(11000, 1000, 'refil', 'g')).toBe('11 refis')
  })
})

// A6 da 42ª (ES-19, princípio 3): na transferência, "Disponível na origem: 2 frascos
// (2 frascos)" e "Butiá Lajeado · 2" no seletor, e o campo recusava 2 ("O máximo é
// 1,9."). O que pode sair é o que a origem RENDE, em embalagens com a fração e na
// unidade de uso — o número que a action confere —, no rótulo e no seletor.
describe('A6: o disponível para sair é o rendimento, no rótulo e no seletor', () => {
  it('1 frasco fechado + 27 ml de 30: 1,9 frasco (57 ml)', () => {
    expect(disponivelEmEmbalagens({ currentStock: 2, currentRendimento: 57 }, 30)).toBe(1.9)
    expect(textoDoDisponivel({ currentStock: 2, currentRendimento: 57 }, 30, 'frasco', 'ml')).toBe('1,9 frasco (57 ml)')
  })
  it('sem frasco aberto, o parêntese diz a unidade de uso, não repete a embalagem', () => {
    expect(textoDoDisponivel({ currentStock: 2, currentRendimento: 60 }, 30, 'frasco', 'ml')).toBe('2 frascos (60 ml)')
  })
  it('sem a unidade de uso, as embalagens', () => {
    expect(disponivelEmEmbalagens({ currentStock: 3 }, null)).toBe(3)
    expect(textoDoDisponivel({ currentStock: 3 }, null, 'caixa', '')).toBe('3 caixas')
  })
  it('a janela da transferência e o seletor das unidades usam a mesma conta', () => {
    const modal = readFileSync(resolve(__dirname, '../components/admin/admin-stock-manage-modal.tsx'), 'utf8')
    expect(modal).toMatch(/textoDoDisponivel\(daOrigem/)
    expect(modal).toMatch(/disponivelEmEmbalagens\(b, rende\)/)
    expect(modal).not.toMatch(/\[b\.branchId, b\.currentStock\]/)
  })
})
