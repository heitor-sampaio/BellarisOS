import { describe, it, expect } from 'vitest'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

/**
 * A ficha de saúde respondida no ATENDIMENTO vai ao PDF da LGPD (D3 da 33ª;
 * LG-12: "O prontuário liberado leva as perguntas e respostas da ficha (com o
 * nome 'Ficha de saúde')"; princípio 3). O PDF montava a seção só com os
 * pedidos da ficha respondidos (`pre_atendimentos`), e a ficha preenchida pela
 * equipe no atendimento (`medical_records.general_anamnesis`) ia só ao JSON: o
 * PDF dizia "Nenhuma ficha de saúde respondida (0)" com as respostas no JSON.
 */

const RESPONDIDA_PELO_LINK = {
  respondidaEm: '2026-11-10T13:00:00.000Z', respondidaPor: 'a cliente, pelo link', ficha: 'Ficha de saúde',
  respostas: [{ pergunta: 'Alergias', resposta: 'Dipirona' }],
}

describe('a ficha de saúde do prontuário no PDF', () => {
  it('a ficha respondida no atendimento entra, com o nome "Ficha de saúde" e as respostas', async () => {
    const { fichasDeSaudeDoProntuario } = await import('@/lib/lgpd/prontuario-legivel')
    const fichas = fichasDeSaudeDoProntuario([], {
      respondidaEm: '2026-11-26T14:00:00.000Z', respondidaPor: 'a equipe', ficha: 'Ficha de saúde',
      respostas: [{ pergunta: 'Alergias', resposta: 'Látex' }],
    })
    expect(fichas).toEqual([expect.objectContaining({ ficha: 'Ficha de saúde', respondidaPor: 'a equipe', respostas: [{ pergunta: 'Alergias', resposta: 'Látex' }] })])
  })

  it('a ficha que já veio pelo pedido respondido não se repete (a mesma hora ou as mesmas respostas)', async () => {
    const { fichasDeSaudeDoProntuario } = await import('@/lib/lgpd/prontuario-legivel')
    expect(fichasDeSaudeDoProntuario([RESPONDIDA_PELO_LINK], { ...RESPONDIDA_PELO_LINK, respondidaPor: 'a cliente, pelo link' })).toHaveLength(1)
    // A equipe regravando as mesmas respostas não troca a hora da ficha do prontuário (lib/pre-atendimento/ficha.ts).
    expect(fichasDeSaudeDoProntuario([RESPONDIDA_PELO_LINK], { ...RESPONDIDA_PELO_LINK, respondidaEm: '2026-11-01T10:00:00.000Z' })).toHaveLength(1)
  })

  it('a do atendimento, mais nova que a do link, vem junto, da mais nova para a mais velha', async () => {
    const { fichasDeSaudeDoProntuario } = await import('@/lib/lgpd/prontuario-legivel')
    const fichas = fichasDeSaudeDoProntuario([RESPONDIDA_PELO_LINK], {
      respondidaEm: '2026-11-26T14:00:00.000Z', respondidaPor: 'a equipe', ficha: 'Ficha de saúde',
      respostas: [{ pergunta: 'Alergias', resposta: 'Dipirona e látex' }],
    })
    expect(fichas.map(f => f.respondidaPor)).toEqual(['a equipe', 'a cliente, pelo link'])
  })

  it('a ficha gravada sem resposta não entra', async () => {
    const { fichasDeSaudeDoProntuario } = await import('@/lib/lgpd/prontuario-legivel')
    expect(fichasDeSaudeDoProntuario([], { respondidaEm: null, respondidaPor: 'a equipe', ficha: 'Ficha de saúde', respostas: [] })).toEqual([])
    expect(fichasDeSaudeDoProntuario([RESPONDIDA_PELO_LINK], null)).toEqual([RESPONDIDA_PELO_LINK])
  })

  it('o PDF monta a seção por ela, com a ficha do prontuário', () => {
    const f = nodeFs.readFileSync(nodePath.join(__dirname, '..', 'lib', 'lgpd', 'export.ts'), 'utf8')
    expect(f).toMatch(/fichasDeSaudeDoProntuario\(/)
    expect(f).toMatch(/general_anamnesis/)
  })
})
