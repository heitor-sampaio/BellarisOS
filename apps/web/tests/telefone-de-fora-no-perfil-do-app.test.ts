import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { maskPhone } from '@estetica-os/utils'

/**
 * CL-04 (`docs/regras/crm-inbox.md`, "O de outro país começa com '+'"): o
 * telefone de fora fica como foi escrito, com o código do país. O Perfil do
 * app tinha a máscara própria (`fmtPhone`), que punha "+33 6 12 34 56 78"
 * (11 dígitos) como "(33) 61234-5678". É a máscara da equipe, `maskPhone`.
 */
describe('o telefone no Perfil do app', () => {
  it('o de fora fica como foi escrito; o brasileiro com a máscara', () => {
    expect(maskPhone('+33 6 12 34 56 78')).toBe('+33 6 12 34 56 78')
    expect(maskPhone('48999990000')).toBe('(48) 99999-0000')
  })

  it('o Perfil usa a máscara da equipe, sem uma própria', () => {
    const fonte = readFileSync(join(__dirname, '..', 'components/client-portal/edit-profile-form.tsx'), 'utf8')
    expect(fonte).toContain('maskPhone(')
    expect(fonte).not.toMatch(/d\.length === 11\) return `\(/)
  })
})
