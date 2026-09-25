import { describe, it, expect } from 'vitest'
import { iniciaisDoNome } from '../src/iniciais'

describe('iniciaisDoNome', () => {
  it('usa o primeiro e o último nome', () => {
    expect(iniciaisDoNome('Ana Maria Prado')).toBe('AP')
    expect(iniciaisDoNome('Heitor Sampaio')).toBe('HS')
  })

  it('com um nome só, usa as duas primeiras letras', () => {
    expect(iniciaisDoNome('Natascha')).toBe('NA')
  })

  it('com quantas=1, uma letra só', () => {
    expect(iniciaisDoNome('Ana Maria Prado', 1)).toBe('A')
  })

  it('vazio, nulo e só espaços viram "?"', () => {
    expect(iniciaisDoNome('')).toBe('?')
    expect(iniciaisDoNome(null)).toBe('?')
    expect(iniciaisDoNome(undefined)).toBe('?')
    expect(iniciaisDoNome('   ')).toBe('?')
  })

  it('espaço repetido não vira inicial vazia', () => {
    expect(iniciaisDoNome('Ana   Prado')).toBe('AP')
    expect(iniciaisDoNome('  Ana Prado  ')).toBe('AP')
  })

  // O que derrubava a hidratação do inbox: `nome[0]` num nome que começa por
  // emoji devolve METADE de um par substituto, que não é UTF-8 válido — o
  // servidor escreve U+FFFD, o cliente escreve o substituto, e o React
  // descarta a árvore inteira.
  describe('nome que começa por emoji', () => {
    it('nunca devolve metade de um par substituto', () => {
      for (const nome of ['👁️‍🗨️', '🎈 Festa', '👩‍⚕️ Dra. Ana', '𝒜na']) {
        const r = iniciaisDoNome(nome)
        for (const u of r) {
          const c = u.charCodeAt(0)
          expect(c >= 0xD800 && c <= 0xDBFF && r.length === 1,
            `${JSON.stringify(nome)} → ${JSON.stringify(r)} tem substituto solto`).toBe(false)
        }
        // Ida e volta por UTF-8: o que não sobrevive a isto quebra a hidratação.
        expect(Buffer.from(r, 'utf8').toString('utf8')).toBe(r)
      }
    })

    it('pega o caractere inteiro, não o pedaço', () => {
      expect(iniciaisDoNome('👁️‍🗨️', 1)).toBe('👁')
      expect(iniciaisDoNome('🎈 Festa')).toBe('🎈F')
    })
  })
})
