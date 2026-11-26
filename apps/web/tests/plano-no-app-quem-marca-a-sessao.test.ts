import { describe, it, expect } from 'vitest'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'
import { textoDaSessaoAAgendarNoApp } from '@/lib/clientes/textos-do-app'

// D19 da 31ª simulação (PO-11: "cada sessão “A agendar” diz quem marca — “A
// agendar · pelo app” ou “A agendar · quem marca é a equipe”"): o cartão do
// início dizia, mas a tela do plano (Ver o plano) mostrava só "A agendar".
const ler = (rel: string) => nodeFs.readFileSync(nodePath.join(__dirname, '..', rel), 'utf8')

describe('PO-11: a sessão a agendar do plano diz quem marca, no app', () => {
  it('o texto', () => {
    expect(textoDaSessaoAAgendarNoApp(true)).toBe('A agendar · pelo app')
    expect(textoDaSessaoAAgendarNoApp(false)).toBe('A agendar · quem marca é a equipe')
  })
  it('o cartão do início e a tela do plano usam o mesmo texto', () => {
    expect(ler('app/[slug]/cliente/home/page.tsx')).toMatch(/textoDaSessaoAAgendarNoApp\(peloApp\(s\)\)/)
    expect(ler('app/[slug]/cliente/planos/[id]/page.tsx')).toMatch(/textoDaSessaoAAgendarNoApp\(peloApp\)/)
  })
})
