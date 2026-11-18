import { describe, it, expect } from 'vitest'
import { quemMarcaAsSessoes } from '@/lib/plano-de-tratamento/textos'
import { agendavelPeloApp } from '@/lib/clientes/agendavel-no-app'
import { documentosPuxadosDoPlano } from '@/lib/plano-de-tratamento/documentos'
import { situacaoDaSessaoNoApp } from '@/lib/plano-de-tratamento/sessao-no-app'

/**
 * Bloco Plano de tratamento, leva 2 (a revisão do Heitor de 2026-11-13).
 */
describe('PT3: a sessão de plano ou de pacote se agenda pelo app', () => {
  it('o procedimento no app agenda; fora do app, só a sessão já comprada (plano ou pacote)', () => {
    expect(agendavelPeloApp({ visivelNoApp: true, sessaoComprada: false })).toBe(true)
    expect(agendavelPeloApp({ visivelNoApp: false, sessaoComprada: true })).toBe(true)
    expect(agendavelPeloApp({ visivelNoApp: false, sessaoComprada: false })).toBe(false)
  })
  it('o texto de quem marca não diz "paga" (o plano aceito pode ainda não ter sido recebido — princípio 3)', () => {
    const [t] = quemMarcaAsSessoes([{ numero: 2, peloApp: true }])
    expect(t).toBe('Sessão 2: agende pelo app em “Agendar” (faz parte do seu plano).')
    expect(quemMarcaAsSessoes([2, 4].map(numero => ({ numero, peloApp: true })))[0]).toContain('fazem parte do seu plano')
  })
  it('a situação de cada sessão no app: feita, agendada ou a agendar', () => {
    const fuso = 'America/Sao_Paulo'
    expect(situacaoDaSessaoNoApp({ status: 'COMPLETED', scheduled_at: '2026-11-10T13:00:00Z', completed_at: '2026-11-10T14:00:00Z' }, fuso).texto).toBe('Feita em 10/11')
    expect(situacaoDaSessaoNoApp({ status: 'SCHEDULED', scheduled_at: '2026-11-20T13:00:00Z', completed_at: null }, fuso).texto).toBe('Agendada para 20/11 às 10:00')
    expect(situacaoDaSessaoNoApp(null, fuso)).toMatchObject({ texto: 'A agendar', aAgendar: true })
    // Ligada a um CANCELADO só fica a desistência no meio (o `pre_pago_libera`
    // solta o cancelado antes de iniciar): a sessão conta como usada e não
    // volta (o Heitor, 2026-11-18: "problema de quem desistir"). Era "A agendar".
    expect(situacaoDaSessaoNoApp({ status: 'CANCELLED', scheduled_at: '2026-11-20T13:00:00Z', completed_at: null }, fuso).aAgendar).toBe(false)
  })
})

describe('DC1c/PC9b: os documentos que o plano puxa dos procedimentos', () => {
  const procedimentos = [
    { id: 'p1', nome: 'Laser', termo: 't1', contrato: 'c1', outros: ['d1'] },
    { id: 'p2', nome: 'Peeling', termo: 't2', contrato: null, outros: ['d1'] },
  ]
  const modelos = [
    { id: 't1', nome: 'Termo do laser', tipo: 'TERMO' }, { id: 't2', nome: 'Termo do peeling', tipo: 'TERMO' },
    { id: 'd1', nome: 'Uso de imagem', tipo: 'DOCUMENTO' }, { id: 'c1', nome: 'Contrato do laser', tipo: 'CONTRATO' },
  ]
  it('o termo e os outros de cada procedimento distinto, uma vez cada, sem o contrato do procedimento', () => {
    const r = documentosPuxadosDoPlano([['p1'], ['p1', 'p2']], procedimentos, modelos, [])
    expect(r.map(d => d.id)).toEqual(['t1', 't2', 'd1'])
    expect(r.find(d => d.id === 'd1')!.de).toEqual(['Laser', 'Peeling'])
  })
  it('o excluído fica marcado (e volta com "Incluir de novo")', () => {
    const r = documentosPuxadosDoPlano([['p1', 'p2']], procedimentos, modelos, ['t2'])
    expect(r.find(d => d.id === 't2')!.excluido).toBe(true)
    expect(r.find(d => d.id === 't1')!.excluido).toBe(false)
  })
})
