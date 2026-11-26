import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AVISO_DO_HORARIO_NOVO_NO_APP, textoDoRemarcado } from '@/lib/clientes/textos-do-app'

/**
 * A1 da 31ª simulação (princípio 3 e AG-42: "O app diz “O horário novo fica
 * como Agendado até ser confirmado.”"): a frase só aparecia DEPOIS de remarcar.
 * O efeito tem de estar à vista antes do "Confirmar novo horário". O texto é o
 * mesmo, e segue também na confirmação (`textoDoRemarcado`).
 */
const fonte = readFileSync(join(__dirname, '..', 'components/client-portal/alterar-agendamento.tsx'), 'utf8')

describe('A1: o remarcar do app diz antes que o horário novo fica Agendado', () => {
  it('o texto é o de AG-42, e o do remarcado continua com ele', () => {
    expect(AVISO_DO_HORARIO_NOVO_NO_APP).toBe('O horário novo fica como Agendado até ser confirmado.')
    expect(textoDoRemarcado({ quemAtende: null, dia: 'terça-feira, 17/11', hora: '15:00', unidadeNova: null }))
      .toContain(AVISO_DO_HORARIO_NOVO_NO_APP)
  })
  it('o aviso fica no formulário do remarcar, antes do botão de confirmar', () => {
    const remarcar = fonte.slice(fonte.indexOf("{modo === 'remarcar' && ("), fonte.indexOf("{modo === 'cancelar' && ("))
    const aviso = remarcar.indexOf('data-remarcar-fica-agendado')
    expect(aviso).toBeGreaterThan(-1)
    expect(remarcar).toMatch(/\{AVISO_DO_HORARIO_NOVO_NO_APP\}/)
    expect(aviso).toBeLessThan(remarcar.indexOf('Confirmar novo horário'))
  })
})
