import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tituloDasRecompensasNoApp } from '@/lib/fidelidade/formato'

/**
 * AP-01 (recomendação do Claude aprovada pelo Heitor, 13/11: "Concordo"): "A troca aparece só se a rede ligou
 * a troca pelo portal … desligada, ela não troca pelo app." A5 da 42ª: com a troca pelo app desligada, o
 * bloco se chamava "Troque seus pontos" — o título prometia o que a tela não faz. Corrige-se pelo NOME
 * (princípio 7, "intuitivo não é explicativo"): desligada, o bloco é "Recompensas"; ligada, "Troque seus pontos".
 */

describe('o título do bloco das recompensas no app', () => {
  it('com a troca pelo app, convida a trocar; sem ela, só nomeia as recompensas', () => {
    expect(tituloDasRecompensasNoApp(true)).toBe('Troque seus pontos')
    expect(tituloDasRecompensasNoApp(false)).toBe('Recompensas')
  })
  it('a tela usa o título pela troca pelo app da rede', () => {
    const t = readFileSync(join(__dirname, '..', 'app/[slug]/cliente/fidelidade/page.tsx'), 'utf8')
    expect(t).toContain('tituloDasRecompensasNoApp(cfg.client_redeem)')
    expect(t).not.toMatch(/<span>Troque seus pontos<\/span>/)
  })
})
