import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as livre from '@/lib/agenda/so-o-que-esta-livre'

/**
 * A lista vazia do Agendar diz o caminho do encaixe (o arremate da 33ª; R15, o
 * Heitor, 26/11: "quem está fora do horário também some das listas (o encaixe
 * só pelo campo de horário)"; princípio 7). Com o horário digitado ANTES da
 * pessoa e todo mundo fora do expediente, a lista ficava vazia com "Ninguém
 * está livre nesse horário. Escolha outro horário para ver quem atende." — e o
 * encaixe, que a R15 deixa pelo campo de horário, ninguém achava. Quando a
 * causa é só o expediente (ninguém ocupado nem bloqueado), a frase do encaixe
 * entra ao lado (decisão do Claude, 26/11). O texto de antes fica.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

type Encaixe = (motivos: (livre.Indisponivel | null)[]) => string | null
const encaixe = () => (livre as unknown as { encaixeDaListaVazia?: Encaixe }).encaixeDaListaVazia

describe('a lista vazia do Agendar', () => {
  it('todos fora do horário: o caminho do encaixe', () => {
    const f = encaixe()
    expect(f, 'encaixeDaListaVazia em lib/agenda/so-o-que-esta-livre.ts').toBeTypeOf('function')
    expect(f!(['fora_do_horario', 'fora_do_horario'])).toBe(
      'Para um encaixe fora do horário, apague o horário, escolha primeiro quem atende e depois digite o horário.',
    )
  })

  it('alguém ocupado ou bloqueado: nada a mais (o encaixe não resolve o choque)', () => {
    const f = encaixe()
    expect(f, 'encaixeDaListaVazia em lib/agenda/so-o-que-esta-livre.ts').toBeTypeOf('function')
    expect(f!(['fora_do_horario', 'ocupada'])).toBeNull()
    expect(f!(['bloqueada'])).toBeNull()
  })

  it('o Agendar mantém o texto de sempre e põe a frase do encaixe ao lado', () => {
    const modal = fonte('components/branch/appointment-modal.tsx')
    expect(modal).toContain('{NINGUEM_LIVRE_NO_HORARIO} Escolha outro horário para ver quem atende.')
    expect(modal).toMatch(/encaixeDaListaVazia\(profissionaisNoHorario\.map\(p => p\.indisponivel\)\)/)
  })
})
