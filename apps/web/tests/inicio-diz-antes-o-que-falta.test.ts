import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fraseDoFaltaAssinar } from '@/lib/appointments/documentos-do-inicio'

/**
 * Princípio 7 (A7 da 29ª): "Iniciar mesmo assim?" perguntava do horário antes
 * de dizer que faltava assinar o termo — e, respondida a pergunta, o início
 * era recusado. O início diz ANTES o que falta (a mesma frase da trava do
 * banco, `trg_documentos_bloqueiam_inicio`) e só depois pergunta do horário.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
function corpo(arquivo: string, nome: string): string {
  const f = fonte(arquivo)
  const i = f.search(new RegExp(`(async )?function ${nome}\\b`))
  if (i < 0) throw new Error(`${nome} não está em ${arquivo}`)
  const fim = f.indexOf('\nasync function ', i + 10)
  const fim2 = f.indexOf('\nexport ', i + 10)
  const corte = [fim, fim2].filter(n => n > 0).sort((a, b) => a - b)[0]
  return f.slice(i, corte)
}

describe('o início diz antes o que falta assinar', () => {
  it('a frase é a da trava do banco, em ordem de título', () => {
    expect(fraseDoFaltaAssinar(['Termo de toxina', 'Autorização de imagem']))
      .toBe('Falta assinar: Autorização de imagem, Termo de toxina. Colha a assinatura antes de iniciar o atendimento.')
    expect(fraseDoFaltaAssinar([])).toBeNull()
  })

  it('iniciar confere os documentos ANTES de perguntar do horário', () => {
    const c = corpo('actions/appointments.ts', 'startAppointmentInterno')
    const doc = c.indexOf('faltaAssinarParaIniciar(')
    const pergunta = c.indexOf('perguntaDoInicioAdiantado(')
    expect(doc).toBeGreaterThan(0)
    expect(doc).toBeLessThan(pergunta)
  })

  it('"Check-in e iniciar" não pergunta do horário quando falta assinar', () => {
    const c = corpo('actions/appointments.ts', 'chegarEIniciar')
    const doc = c.indexOf('faltaAssinarParaIniciar(')
    const pergunta = c.indexOf('perguntaDoInicio(')
    expect(doc).toBeGreaterThan(0)
    expect(doc).toBeLessThan(pergunta)
  })

  it('a tela leva a colher também quando o check-in ficou feito', () => {
    expect(fonte('components/branch/appointment-session.tsx')).toContain("erroAoIniciar.includes('Falta assinar')")
  })
})
