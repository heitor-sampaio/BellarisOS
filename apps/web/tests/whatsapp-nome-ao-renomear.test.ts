import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validarNomeDaConexao, MAX_ROTULO } from '@/lib/whatsapp/rotulo'

const ler = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

/**
 * O nome do número de WhatsApp tem 60 caracteres em todo caminho (o Heitor, 25/11:
 * "60 pra tudo"). Ao conectar, o campo já parava em 60 e o nome da Meta já era
 * cortado; ao RENOMEAR ("Nome e vínculos"), o campo e a action aceitavam qualquer
 * tamanho.
 */
describe('o nome da conexão ao renomear', () => {
  it('apara, recusa vazio e acima de 60', () => {
    expect(MAX_ROTULO).toBe(60)
    expect(validarNomeDaConexao('  Recepção  ')).toEqual({ nome: 'Recepção' })
    expect(validarNomeDaConexao('x'.repeat(60))).toEqual({ nome: 'x'.repeat(60) })
    expect(validarNomeDaConexao('   ')).toEqual({ error: 'O nome da conexão não pode ficar vazio.' })
    expect(validarNomeDaConexao('x'.repeat(61))).toEqual({ error: 'O nome da conexão tem no máximo 60 caracteres.' })
  })

  it('a action de renomear passa pela mesma conferência', () => {
    const action = ler('actions/integrations.ts')
    const corpo = action.slice(action.indexOf('export async function atualizarVinculosDoNumero'))
    expect(corpo.slice(0, 1500)).toMatch(/validarNomeDaConexao\(dados\.rotulo\)/)
  })

  it('o campo "Nome da conexão" para em 60, como o do número novo', () => {
    const lista = ler('components/admin/lista-de-numeros.tsx')
    expect(lista).toMatch(/value=\{rotulo\}[\s\S]{0,200}maxLength=\{MAX_ROTULO\}/)
  })
})
