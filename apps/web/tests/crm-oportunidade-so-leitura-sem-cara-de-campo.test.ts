import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A9 da 38ª simulação (CLAUDE.md §14, "a tela esconde"; princípio 7): no card
 * da oportunidade em "Só leitura" (o CRM em Ver), os campos seguiam com cara
 * de editáveis — a seta do seletor, o calendário e o "dd/mm/aaaa" da data, a
 * alça da caixa de observações, o "Preencha pelo menos um dos campos abaixo",
 * os exemplos cinza no campo vazio e TODOS os procedimentos como botões de
 * marcar. Quem só vê lê os valores: sem seletor, sem convite a preencher, só os
 * procedimentos escolhidos, e o vazio como "—" (o padrão do `SoLeitura` das
 * Configurações). O fundo do card e a linha fina da A5 da 32ª continuam
 * (`tests/crm-oportunidade-so-leitura-parece-leitura.test.ts`).
 */

const modal = readFileSync(join(__dirname, '..', 'components/branch/crm-lead-modal.tsx'), 'utf8')
const css = modal.match(/const CSS_SO_LEITURA = `([\s\S]*?)`/)?.[1] ?? ''

describe('A9: a oportunidade em "Só leitura" não tem cara de campo', () => {
  it('o seletor sem a seta, a data sem o calendário, as observações sem a alça', () => {
    expect(css).toMatch(/appearance: none/)
    expect(css).toMatch(/::-webkit-calendar-picker-indicator/)
    expect(modal).toMatch(/resize: somenteLeitura \? 'none' : 'vertical'/)
  })

  it('o vazio é "—", não o exemplo de como preencher', () => {
    expect(css).not.toMatch(/::placeholder \{ color: transparent; \}/)
    expect(modal).toMatch(/const exemplo = \(t: string\) => \(somenteLeitura \? '—' : t\)/)
    for (const ex of ['Nome do contato', '(00) 00000-0000', 'contato@email.com', '@usuario ou link do perfil', 'R$ 0,00',
      'Interesse, contexto, próximos passos…', 'Ex.: ligar para falar do orçamento']) {
      expect(modal, ex).toContain(`placeholder={exemplo('${ex}')}`)
    }
    // A data de retorno de quem só vê é texto (o campo de data mostraria "dd/mm/aaaa").
    expect(modal).toMatch(/somenteLeitura \? \(\s*<input name="retornar_em" type="text"/)
  })

  it('sem o convite a preencher e só os procedimentos escolhidos, como texto', () => {
    expect(modal).toMatch(/\{!somenteLeitura && \(\s*<p[^>]*>\s*Preencha pelo menos um dos campos abaixo/)
    expect(modal).toMatch(/data-procedimentos-so-leitura/)
  })
})
