import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * PC-14: "Na agenda da equipe, escolher quem não realiza só avisa" — o novo
 * agendamento avisava, e o "Trocar profissional" oferecia quem não realiza o
 * procedimento sem dizer nada. Avisa do mesmo jeito (princípio 2: não recusa).
 *
 * E o vocabulário (CLAUDE.md §1, o Heitor, 13/11: "não quero mais tu falando
 * nomes de cargos como se fossem cargos fixos"; Q33 do catálogo de
 * atendimento): "Esta profissional não realiza…", "Nova profissional" e
 * "Profissional trocada: agora é …" falavam da pessoa como um cargo fixo, no
 * feminino. Texto neutro.
 */
const fonte = (arq: string) => readFileSync(join(__dirname, '..', arq), 'utf8')

describe('trocar quem atende avisa quem não realiza o procedimento', () => {
  it('o aviso é o do novo agendamento, num lugar só', async () => {
    const { avisoDeQuemNaoRealiza } = await import('@/lib/procedimentos/quem-realiza')
    expect(avisoDeQuemNaoRealiza('Bia')).toBe('Bia não está em “Quem realiza” deste procedimento.')
    expect(fonte('components/branch/appointment-modal.tsx')).toMatch(/avisoDeQuemNaoRealiza\(naoRealiza\)/)
  })

  it('a lista da troca diz, de cada pessoa, se realiza o procedimento', () => {
    const a = fonte('actions/appointments.ts')
    const i = a.indexOf('export async function profissionaisParaTrocar(')
    const corpo = a.slice(i, a.indexOf('\n}\n', i))
    expect(corpo).toMatch(/procedure_id/)
    expect(corpo).toMatch(/quemRealizaOProcedimento\(admin, a\.procedure_id\)/)
    expect(corpo).toMatch(/realiza: realiza\(/)
  })

  it('a janela avisa ao escolher quem não realiza, e deixa trocar', () => {
    const j = fonte('components/branch/janela-do-agendamento-acoes.tsx')
    const i = j.indexOf('export function TrocarProfissional(')
    const corpo = j.slice(i, j.indexOf('\nexport function ', i + 10))
    expect(corpo).toMatch(/data-aviso-quem-realiza/)
    expect(corpo).toMatch(/avisoDeQuemNaoRealiza\(nova\.name\)/)
    expect(corpo).toMatch(/disabled=\{!nova\}/)
  })
})

describe('os textos falam de quem atende, não de um cargo', () => {
  it('a recusa de quem não realiza', async () => {
    const { NAO_REALIZA } = await import('@/lib/procedimentos/quem-realiza')
    expect(NAO_REALIZA).toBe('Quem você escolheu não realiza este procedimento.')
  })
  it('a troca de quem atende', () => {
    const j = fonte('components/branch/janela-do-agendamento-acoes.tsx')
    expect(j).not.toMatch(/Nova profissional|Profissional trocada/)
    expect(j).toMatch(/>Quem vai atender</)
    expect(j).toMatch(/toast\.success\(`Agora quem atende é \$\{nova\.name\}\.`\)/)
  })
})
