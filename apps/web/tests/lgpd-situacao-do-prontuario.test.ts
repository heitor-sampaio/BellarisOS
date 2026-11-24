import { describe, it, expect } from 'vitest'
import { textoDoProntuarioForaDoPacote, prontuarioNaSolicitacao } from '@/lib/lgpd/situacao-do-prontuario'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

// Simulação de um dia de clínica (2026-10-20): a Mariana PEDIU o prontuário e
// o pacote dizia "Não incluído nesta solicitação" — como se não tivesse pedido.
describe('o prontuário fora do pacote, por situação', () => {
  it('não pedido', () => {
    expect(textoDoProntuarioForaDoPacote('not_requested').json).toBe('Não incluído nesta solicitação.')
  })
  it('pedido e em análise: diz que vem num pacote novo', () => {
    const t = textoDoProntuarioForaDoPacote('pending')
    expect(t.json).toMatch(/em análise/i)
    expect(t.pdf.join(' ')).toMatch(/em análise/i)
    expect(t.pdf.join(' ')).toMatch(/novo/i)
  })
  it('pedido e não liberado', () => {
    expect(textoDoProntuarioForaDoPacote('denied').json).toMatch(/não liberou/i)
  })
})

// A56 da 8ª simulação (2026-11-06): com "Incluir prontuário" marcado, o JSON
// dizia só `incluiProntuario: false` antes da liberação — parecia que o pedido
// tinha sido ignorado. O pedido diz a situação do prontuário por extenso.
describe('A56: a solicitação diz a situação do prontuário', () => {
  it('pedido e esperando a rede: "pendente de liberação"', () => {
    expect(prontuarioNaSolicitacao('pending', false)).toBe('pedido — pendente de liberação pela equipe')
  })
  it('liberado e incluído', () => {
    expect(prontuarioNaSolicitacao('approved', true)).toBe('pedido — liberado e incluído neste pacote')
  })
  it('não liberado', () => {
    expect(prontuarioNaSolicitacao('denied', false)).toBe('pedido — não liberado pela equipe')
  })
  it('não pedido', () => {
    expect(prontuarioNaSolicitacao('not_requested', false)).toBe('não pedido')
  })
})

describe('o que o pedido da LGPD leva, dito igual no app e na equipe (princípio 3)', () => {
  const ler = (rel: string) => nodeFs.readFileSync(nodePath.join(__dirname, '..', rel), 'utf8')

  describe('a liberação e a caixa do app dizem o que o prontuário do pacote leva de fato', () => {
    it('um texto só, sem o que não vai no prontuário (os termos são da parte geral; a foto vai como contagem)', async () => {
      const { CONTEUDO_DO_PRONTUARIO } = await import('@/lib/lgpd/situacao-do-prontuario')
      expect(CONTEUDO_DO_PRONTUARIO).toBe('a ficha de saúde respondida e o registro de cada atendimento (evolução, ficha de atendimento, dores, intercorrências, insumos e anotações)')
    })
    it('a caixa do app e a confirmação do Liberar usam o mesmo texto', () => {
      const app = ler('components/client-portal/data-request-card.tsx')
      const equipe = ler('components/admin/settings-lgpd.tsx')
      expect(app).not.toMatch(/termos assinados/)
      expect(equipe).not.toMatch(/a evolução e as fotos/)
      expect(app).toMatch(/\{CONTEUDO_DO_PRONTUARIO\}/)
      expect(equipe).toMatch(/\{CONTEUDO_DO_PRONTUARIO\}/)
    })
  })

  describe('cada pedido da LGPD no app diz o que é', () => {
    it('com ou sem o prontuário', async () => {
      const { oQueOPedidoLeva } = await import('@/lib/lgpd/situacao-do-prontuario')
      expect(oQueOPedidoLeva(true)).toBe('com o prontuário')
      expect(oQueOPedidoLeva(false)).toBe('sem o prontuário')
    })
    it('o pedido em preparo e o pronto dizem a data e se levam o prontuário', () => {
      const app = ler('components/client-portal/data-request-card.tsx')
      expect(app).toMatch(/data-pedido-lgpd="em-preparo"/)
      expect(app).toMatch(/data-pedido-lgpd="pronto"/)
      expect(app.match(/Pedido de \{fmt\([a-zA-Z]+\.requested_at, fuso\)\}, \{oQueOPedidoLeva\([a-zA-Z]+\.include_medical\)\}/g)?.length).toBe(2)
    })
  })

})
