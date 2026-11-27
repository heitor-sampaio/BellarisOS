import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { linhasDoHistoricoParaQuemVe } from '@/lib/clients/historico-do-agendamento'

/**
 * O histórico do atendimento é parte do prontuário (o Heitor, 27/11, R23: "O historico do atendimento é parte do
 * prontuario."; R32: "Somem só as linhas clínicas (as da foto); as da agenda e do caixa ficam"). Quem não tem o
 * Prontuário em Ver não vê as linhas da foto clínica (anexada, enviada, tirada pelo app, apagada).
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o histórico do atendimento sem as linhas da foto', () => {
  const linhas = [
    { action: 'CREATED' }, { action: 'CHECKIN' }, { action: 'FOTO_CLINICA' }, { action: 'FOTO_ENVIADA' },
    { action: 'FOTO_TIRADA_DO_APP' }, { action: 'FOTO_CLINICA_APAGADA' }, { action: 'PAYMENT_CONFIRMED' },
  ]
  it('sem o Prontuário em Ver, somem só as da foto', () => {
    expect(linhasDoHistoricoParaQuemVe(linhas, false).map(l => l.action)).toEqual(['CREATED', 'CHECKIN', 'PAYMENT_CONFIRMED'])
  })
  it('com o Prontuário em Ver, todas', () => {
    expect(linhasDoHistoricoParaQuemVe(linhas, true)).toHaveLength(linhas.length)
  })
  it('a janela da agenda e a tela do atendimento filtram pelo podeVerClinico', () => {
    expect(fonte('actions/historico-do-agendamento.ts')).toMatch(/linhasDoHistoricoParaQuemVe\(linhas \?\? \[\], podeVerClinico\(ctx\)\)/)
    expect(fonte('app/_shared/sessao-de-atendimento.tsx')).toMatch(/linhasDoHistoricoParaQuemVe\(\(historyRaw \?\? \[\]\) as RawHistory\[\], canViewRecords\)/)
  })
})
