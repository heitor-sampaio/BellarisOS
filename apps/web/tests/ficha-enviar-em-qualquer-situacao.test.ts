import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * D16 da 41ª (FI-14: "'Enviar a ficha' está SEMPRE na janela do agendamento,
 * para quem tem a Agenda em Gerenciar"): no agendamento CONCLUÍDO não havia o
 * "Enviar a ficha" — a janela só mostrava o bloco nos agendamentos em aberto,
 * e a ficha já respondida para o agendamento virava só o selo. A regra não
 * exclui situação nenhuma (decisão do Claude, 28/11, pela FI-14 "sempre"): o
 * concluído, o cancelado e a falta também mandam, e a respondida também (sem
 * pendente, o botão abre uma para este agendamento). O banco recusava o
 * cancelado e a falta (`pre_atendimento_abrir_manual`).
 */
const ler = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const raiz = join(__dirname, '..', '..', '..')

describe('"Enviar a ficha" em qualquer situação do agendamento', () => {
  it('a janela do agendamento mostra o bloco da ficha em qualquer situação', () => {
    const janela = ler('components/branch/appointment-sheet.tsx')
    expect(janela).toContain('<PreAtendimentoDoAgendamento appointmentId={appointment.id}')
    expect(janela).not.toMatch(/isActive && <PreAtendimentoDoAgendamento/)
  })

  it('a ficha respondida só vira o selo sozinho para quem não manda', () => {
    const bloco = ler('components/branch/pre-atendimento-do-agendamento.tsx')
    expect(bloco).toMatch(/if \(respondida && !podeMandar\) \{/)
  })

  it('o banco abre a ficha também para o cancelado e a falta', () => {
    const ultima = readdirSync(join(raiz, 'supabase', 'migrations')).filter(f => f.endsWith('.sql')).sort()
      .map(f => readFileSync(join(raiz, 'supabase', 'migrations', f), 'utf8'))
      .filter(s => /pre_atendimento_abrir_manual/.test(s)).at(-1)!
    expect(ultima).toContain("O agendamento foi cancelado: a ficha não se manda por ele.")
    expect(ultima).toMatch(/trocar_no_corpo\(\s*'public\.pre_atendimento_abrir_manual/)
  })
})
