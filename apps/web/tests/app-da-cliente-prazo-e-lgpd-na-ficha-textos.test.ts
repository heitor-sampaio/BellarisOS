import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const WEB = join(__dirname, '..')
const ler = (p: string) => readFileSync(join(WEB, p), 'utf8')

describe('textos do app e da ficha', () => {
  // A14 da 39ª: sem a nota do fuso (o fuso de Brasília), a frase ficava
  // "(24 horas antes do horário) . A equipe…" — o espaço vai com a nota.
  it('o "prazo para alterar" não deixa espaço antes do ponto', () => {
    const f = ler('components/client-portal/alterar-agendamento.tsx')
    expect(f).not.toMatch(/\{' '\}\s*<NotaDoFuso fuso=\{fusoDoAgendamento\} prefixo="· " \/>\./)
    expect(f).toMatch(/horas antes do horário\)<NotaDoFuso fuso=\{fusoDoAgendamento\} prefixo=" · " \/>\./)
  })

  // A17 da 39ª (CLAUDE.md §14, princípio 7): a ficha mandava quem não tem a aba
  // LGPD a "Configurações → LGPD". Quem a alcança tem o link; os outros, nada.
  it('a ficha não aponta a aba LGPD a quem não a alcança', () => {
    expect(ler('components/branch/client-profile.tsx')).not.toMatch(/A resposta é em Configurações → LGPD/)
  })
})
