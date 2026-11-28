import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * AT-03 e CLAUDE.md §11 (o Heitor, 23/11, UM4 "concordo": "o clínico (ficha de
 * saúde, evolução, fotos) é do Prontuário em Gerenciar, sem precisar atender"),
 * D4 da 41ª: quem tem o Prontuário em Gerenciar e não conclui digitava a
 * evolução no atendimento em andamento e não tinha como salvar — no formulário
 * da avaliação e no do plano gerado só o "Finalizar" a levava. A ficha de saúde
 * e a foto ela já gravava ali.
 *
 * Agora a evolução (e a intercorrência) se salvam ali, pela action da evolução
 * (`saveDraftNotes`: o Prontuário em Gerenciar e o alcance do agendamento). E a
 * tela de quem conclui recarrega o gravado (o sinal do prontuário): o campo que
 * ela não mexeu passa a mostrar o que a outra pessoa salvou, e o "Finalizar"
 * leva o que está na tela dela (AT-16; decisão do Claude, 28/11).
 */
const fonte = (arq: string) => readFileSync(join(__dirname, '..', arq), 'utf8')
const tela = fonte('components/branch/appointment-session.tsx')

function corpoDe(c: string, nome: string): string {
  const i = c.indexOf(`async function ${nome}(`)
  expect(i, `${nome} existe`).toBeGreaterThan(-1)
  return fimDoBloco(c, i)
}

/** Do início até a chave que fecha o bloco no começo da linha (o arquivo é CRLF). */
function fimDoBloco(c: string, i: number): string {
  const resto = c.slice(i)
  const fim = resto.search(/\r?\n\}\r?\n/)
  return fim === -1 ? resto : resto.slice(0, fim)
}

describe('a evolução do atendimento em andamento se salva sem concluir', () => {
  it('a action da evolução pede o Prontuário em Gerenciar e o alcance do agendamento', () => {
    const c = corpoDe(fonte('actions/appointments.ts'), 'saveDraftNotesInterno')
    expect(c).toContain("can(ctx, 'medical_records', 'MANAGE')")
    expect(c).toContain('alcancaOAgendamento(ctx, apptBranch.id')
  })

  it('a tela salva só a evolução e a intercorrência, pela action da evolução', () => {
    const c = corpoDe(tela, 'salvarEvolucao')
    expect(c).toContain('saveDraftNotes(null, fd)')
    expect(c).toContain("fd.set('notes', notes)")
    expect(c).toContain("fd.set('intercurrences', intercurrences)")
  })

  it('o cartão das observações tem o "Salvar evolução" quando a tela o pede', () => {
    const card = fimDoBloco(tela, tela.indexOf('function ObservacoesCard('))
    expect(card).toMatch(/salvar\?:/)
    expect(card).toContain('<BotaoSalvarEvolucao salvar={salvar} />')
    const botao = fimDoBloco(tela, tela.indexOf('function BotaoSalvarEvolucao('))
    expect(botao).toContain("'Salvar evolução'")
    expect(botao).toContain('data-salvar-evolucao')
  })

  it('o formulário da avaliação e o do plano gerado oferecem o "Salvar evolução" a quem escreve o clínico, antes de concluir', () => {
    // As duas ObservacoesCard do ramo que monta plano e o cartão da avaliação.
    const ramo = tela.slice(tela.indexOf('{!isPartOfPlan && podeMontarPlano ? (() => {'), tela.indexOf('{renderFichaCard(insumosSection, true)}'))
    expect(ramo).toMatch(/<ObservacoesCard[\s\S]*?salvar=\{salvarDaEvolucao\}/)
    expect(ramo).toContain('<BotaoSalvarEvolucao salvar={salvarDaEvolucao} />')
    expect(tela).toMatch(/const salvarDaEvolucao = !isDone && canEditRecords/)
  })

  it('a tela de quem conclui recarrega a evolução gravada que ela não mexeu', () => {
    expect(tela).toMatch(/const \[notasGravadas, setNotasGravadas\]/)
    expect(tela).toMatch(/if \(notes === notasGravadas\) setNotes\(/)
    expect(tela).toMatch(/if \(intercurrences === intercorrenciasGravadas\) setIntercurrences\(/)
  })
})
