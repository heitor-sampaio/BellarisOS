import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { iniciaisDoNome } from '@estetica-os/utils'

/**
 * As iniciais na Equipe (CLAUDE.md §14: "Tirar inicial de nome com nome[0] ou
 * charAt(0) — use iniciaisDoNome"; princípio 3). A "Dra. Edna Ribeiro" saía "DR"
 * na Equipe da unidade e "ER" na da rede: a da unidade tirava as iniciais à
 * mão, com o título. As duas telas usam a mesma função.
 */
const fonte = (arq: string) => readFileSync(path.join(__dirname, '..', arq), 'utf8')

describe('as iniciais da Equipe, nos dois portais, saem da mesma função', () => {
  it('o título fica de fora', () => {
    expect(iniciaisDoNome('Dra. Edna Ribeiro')).toBe('ER')
    expect(iniciaisDoNome('Dra. Glória Mendes')).toBe('GM')
  })

  it('a Equipe da unidade usa iniciaisDoNome, sem tirar a letra à mão', () => {
    const unidade = fonte('app/[slug]/team/page.tsx')
    expect(unidade).toMatch(/import \{[^}]*\biniciaisDoNome\b[^}]*\} from '@estetica-os\/utils'/)
    expect(unidade).toMatch(/function Initials\(\{ name \}: \{ name: string \}\) \{\s*const letters = iniciaisDoNome\(name\)/)
    expect(unidade).not.toMatch(/parts\[0\]!\[0\]/)
  })

  it('a Equipe da rede também', () => {
    expect(fonte('app/admin/team/page.tsx')).toMatch(/const letters = iniciaisDoNome\(name\)/)
  })
})
