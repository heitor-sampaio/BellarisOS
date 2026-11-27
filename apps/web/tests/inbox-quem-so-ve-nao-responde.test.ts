import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * D1 da 38ª simulação (ALTA): quem tem o CRM só em Ver via a caixa de resposta
 * do inbox, e ao enviar a tela caía em "Você não tem acesso a esta área".
 * CLAUDE.md §14: "Botão que a pessoa não pode usar (o módulo em Ver, sem o
 * módulo): a tela esconde, e a action devolve { error } em vez de lançar".
 *
 * A tela: o compositor (campo, anexo, áudio, respostas rápidas, modelo), o
 * contexto preso a ele e os avisos que só servem a quem vai mandar (a outra
 * caixa e a janela de 24 h, com as escapatórias) aparecem só para quem
 * responde. As actions de mandar devolvem a recusa em vez de lançar.
 */

const fonte = (arquivo: string) => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8')

function corpoDe(texto: string, assinatura: string): string {
  const i = texto.indexOf(assinatura)
  expect(i, assinatura).toBeGreaterThan(-1)
  const resto = texto.slice(i)
  return resto.slice(0, resto.indexOf('\n}\n'))
}

describe('D1: as actions de mandar recusam com { error } a quem só vê', () => {
  const action = fonte('actions/inbox.ts')
  for (const fn of ['sendMessage', 'sendMediaMessage', 'sendTemplateMessage', 'editMessage']) {
    it(`${fn} não lança: confere o CRM em Gerenciar e devolve a recusa`, () => {
      const corpo = corpoDe(action, `export async function ${fn}(`)
      expect(corpo).not.toMatch(/assertPermission\(ctx, 'crm'/)
      expect(corpo).toMatch(/if \(!can\(ctx, 'crm', 'MANAGE'\)\) return \{ ok: false, error: SO_VE_AS_CONVERSAS \}/)
    })
  }

  it('a recusa é a mesma do "Tentar de novo"', () => {
    expect(action).toMatch(/const SO_VE_AS_CONVERSAS = 'Seu cargo não responde conversas\.'/)
    expect(corpoDe(action, 'export async function reenviarMensagem(')).toMatch(/error: SO_VE_AS_CONVERSAS/)
  })
})

describe('D1: a tela esconde o compositor de quem só vê', () => {
  const tela = fonte('components/admin/crm-inbox.tsx')
  const inicio = tela.indexOf('{/* O que só serve a quem responde')
  const fim = tela.indexOf('{/* Fim do que só serve a quem responde */}')
  const bloco = inicio > -1 && fim > inicio ? tela.slice(inicio, fim) : ''

  it('um bloco só, aberto por canEdit', () => {
    expect(bloco, 'o bloco do compositor').not.toBe('')
    expect(bloco).toMatch(/^\{\/\* O que só serve a quem responde[^]*?\*\/\}\s*\{canEdit && \(/)
  })

  it('dentro dele: o campo, o anexo, o contexto da resposta e os avisos de envio', () => {
    expect(bloco).toMatch(/className="inbox-composer"/)
    expect(bloco).toMatch(/<PainelDeAnexo/)
    expect(bloco).toMatch(/<BotoesDeAnexo/)
    expect(bloco).toMatch(/<MenuDeAcoes/)
    expect(bloco).toMatch(/Respondendo/)
    expect(bloco).toMatch(/Você fala pelo/)
    expect(bloco).toMatch(/Enviar um template/)
  })

  it('fora dele não sobra campo nem anexo', () => {
    const fora = tela.replace(bloco, '')
    expect(fora).not.toMatch(/className="inbox-composer"/)
    expect(fora).not.toMatch(/<PainelDeAnexo/)
    expect(fora).not.toMatch(/<BotoesDeAnexo/)
  })

  it('a conversa encerrada segue dizendo que está encerrada, para todos', () => {
    expect(tela).toMatch(/Conversa encerrada/)
  })
})
