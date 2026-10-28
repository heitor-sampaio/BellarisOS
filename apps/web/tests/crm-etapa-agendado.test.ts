import { describe, it, expect } from 'vitest'
import { etapaParaAgendar, type EtapaDoFunil } from '@/lib/crm/etapa-agendado'

/**
 * Agendar uma cliente com oportunidade aberta leva o card para a etapa de
 * "agendado" do funil (A12, simulação de 2026-10-27). A etapa se acha pela
 * MARCA, nunca pelo nome: a clínica renomeia.
 */
const e = (id: string, position: number, outcome = 'OPEN', marca: string | null = null): EtapaDoFunil => ({ id, position, outcome, marca })
const funil = [e('novo', 0), e('contato', 1), e('ag', 2, 'OPEN', 'AGENDADO'), e('depois', 3), e('ganho', 4, 'WON'), e('perdido', 5, 'LOST')]

describe('etapaParaAgendar', () => {
  it('leva quem está antes da etapa marcada até ela', () => {
    expect(etapaParaAgendar(funil, 'novo')).toBe('ag')
    expect(etapaParaAgendar(funil, 'contato')).toBe('ag')
  })
  it('não mexe em quem já está nela, nem em quem passou dela', () => {
    expect(etapaParaAgendar(funil, 'ag')).toBeNull()
    expect(etapaParaAgendar(funil, 'depois')).toBeNull()
  })
  it('não mexe em card de desfecho (ganho ou perdido)', () => {
    expect(etapaParaAgendar(funil, 'ganho')).toBeNull()
    expect(etapaParaAgendar(funil, 'perdido')).toBeNull()
  })
  it('funil sem etapa marcada não move nada — o nome não conta', () => {
    expect(etapaParaAgendar(funil.map(x => ({ ...x, marca: null })), 'novo')).toBeNull()
  })
  it('a ordem das etapas não importa', () => {
    expect(etapaParaAgendar([...funil].reverse(), 'novo')).toBe('ag')
  })
})
