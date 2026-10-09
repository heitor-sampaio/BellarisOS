import { describe, it, expect } from 'vitest'
import { nomeDaMeta, rotuloDaConexao } from '@/lib/whatsapp/rotulo'

/**
 * O nome de uma conexão de WhatsApp é o que a clínica lê em todo lugar
 * (inbox, templates, vínculos). Escolhido por ela ao conectar; sem escolha, o
 * nome da conta na Meta — nunca o id técnico do número (2026-10-09).
 */
describe('nomeDaMeta', () => {
  it('é o nome verificado e o telefone', () => {
    expect(nomeDaMeta({ verified_name: 'Clínica Bella', display_phone_number: '+55 48 99999-0000' }))
      .toBe('Clínica Bella · +55 48 99999-0000')
    expect(nomeDaMeta({ display_phone_number: '+55 48 99999-0000' })).toBe('+55 48 99999-0000')
    expect(nomeDaMeta({})).toBeNull()
    expect(nomeDaMeta(null)).toBeNull()
  })
})

describe('rotuloDaConexao', () => {
  const base = { padrao: 'WhatsApp Oficial', tecnico: '1372302949310529' }
  it('o nome escolhido vence tudo', () => {
    expect(rotuloDaConexao({ ...base, escolhido: '  Recepção  ', atual: 'Outro', daMeta: 'Clínica · +55' })).toBe('Recepção')
  })
  it('sem escolha, o nome que a conexão já tem fica — reconectar não renomeia', () => {
    expect(rotuloDaConexao({ ...base, escolhido: '', atual: 'Recepção', daMeta: 'Clínica · +55' })).toBe('Recepção')
  })
  it('o id técnico e o nome genérico não contam como nome: vale o da Meta', () => {
    expect(rotuloDaConexao({ ...base, atual: '1372302949310529', daMeta: 'Clínica · +55' })).toBe('Clínica · +55')
    expect(rotuloDaConexao({ ...base, atual: 'WhatsApp Oficial', daMeta: 'Clínica · +55' })).toBe('Clínica · +55')
  })
  it('sem nada, o padrão', () => {
    expect(rotuloDaConexao({ ...base })).toBe('WhatsApp Oficial')
  })
  it('corta no tamanho que a tela comporta', () => {
    expect(rotuloDaConexao({ ...base, escolhido: 'x'.repeat(100) })).toHaveLength(60)
  })
})
