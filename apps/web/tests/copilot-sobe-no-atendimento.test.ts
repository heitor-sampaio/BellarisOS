import { describe, it, expect } from 'vitest'
import { subidaDoBotaoDoCopilot } from '../lib/copilot/subida-do-botao'

// D1 da 10ª simulação: no celular, a ação principal do atendimento é a barra
// do rodapé — o botão do Copilot sobe acima dela, como sobe no inbox.
describe('onde o botão do Copilot sobe', () => {
  it('no inbox, sempre', () => {
    expect(subidaDoBotaoDoCopilot('/batel/inbox')).toBe('sim')
    expect(subidaDoBotaoDoCopilot('/admin/inbox/abc')).toBe('sim')
  })
  it('na tela do atendimento, só no celular', () => {
    expect(subidaDoBotaoDoCopilot('/batel/agenda/3f2b8c1e-0d5a-4c1b-9e7f-1a2b3c4d5e6f')).toBe('celular')
    expect(subidaDoBotaoDoCopilot('/admin/agenda/3f2b8c1e-0d5a-4c1b-9e7f-1a2b3c4d5e6f')).toBe('celular')
  })
  it('no resto, não sobe', () => {
    expect(subidaDoBotaoDoCopilot('/batel/agenda')).toBe('nao')
    expect(subidaDoBotaoDoCopilot('/batel/agenda/comissoes')).toBe('nao')
    expect(subidaDoBotaoDoCopilot('/admin/dashboard')).toBe('nao')
  })
})
