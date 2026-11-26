import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * D3 da 32ª simulação (OP-37: a janela diz o limite e deixa corrigir;
 * princípio 7). No "Nova/Editar oportunidade", a recusa do servidor (o valor
 * −500, o acima do limite do registro) zerava o formulário: o `<form
 * action={formAction}>` do React 19 se reinicia depois da action, mesmo
 * quando ela devolve `{ error }` — o nome, o valor e o retorno sumiam, e o
 * select controlado do Responsável voltava, no DOM, a "Sem responsável" (e era
 * esse o valor que o próximo envio mandaria). A mesma regra do cadastro
 * (docs/regras/crm-inbox.md: "O formulário não se apaga com o erro nem com o
 * aviso (`onSubmit` em vez do reset automático da action)").
 *
 * Sem o reset automático, cada ABERTURA da janela começa do zero pela chave do
 * formulário (o contador de aberturas): a oportunidade criada não deixa o nome
 * dela na próxima "Nova oportunidade".
 */

const modal = readFileSync(join(__dirname, '..', 'components/branch/crm-lead-modal.tsx'), 'utf8')
const form = modal.slice(modal.indexOf('<form ref={formRef}'), modal.indexOf('{mudouEtapa && (', modal.indexOf('<form ref={formRef}')))

describe('a recusa do servidor não zera a janela da oportunidade', () => {
  it('o formulário não usa o reset automático da action', () => {
    expect(form).not.toBe('')
    expect(form).not.toMatch(/action=\{formAction\}/)
  })

  it('o envio é pelo onSubmit: sem o envio nativo, a action dentro de uma transição', () => {
    const corpo = form.slice(form.indexOf('onSubmit={e => {'))
    // O preventDefault vem antes de qualquer condição: o envio nativo nunca acontece.
    expect(corpo).toMatch(/^onSubmit=\{e => \{\s*(\/\/[^\n]*\s*)*e\.preventDefault\(\)/)
    expect(corpo).toMatch(/startTransition\(\(\) => formAction\(/)
  })

  it('cada abertura começa do zero (a chave do formulário muda ao abrir)', () => {
    expect(form).toMatch(/key=\{`\$\{pessoa\?\.id \?\? 'novo'\}-\$\{aberturas\}`\}/)
    const abrir = modal.slice(modal.indexOf('const open = useCallback('), modal.indexOf('const close = useCallback('))
    expect(abrir).toMatch(/setAberturas\(n => n \+ 1\)/)
  })
})
