import { describe, it, expect } from 'vitest'
import { textoDoRegistroTravado } from '@/lib/atendimento/registro-travado'

// D11 da 8ª simulação (2026-11-06): o atendimento CANCELADO dizia "Atendimento
// concluído. Para corrigir, use 'Editar registro'" — o texto do registro
// travado não olhava o status.
describe('textoDoRegistroTravado (D11)', () => {
  it('concluído, a quem corrige: o caminho do "Editar registro"', () =>
    expect(textoDoRegistroTravado('COMPLETED', true)).toEqual({
      titulo: 'Registro bloqueado para edição',
      texto: 'Atendimento concluído. Para corrigir, use "Editar registro": a alteração fica no histórico.',
      podeEditar: true,
    }))
  it('concluído, a quem não corrige: quem corrige', () =>
    expect(textoDoRegistroTravado('COMPLETED', false)).toEqual({
      titulo: 'Registro bloqueado para edição',
      texto: 'Atendimento concluído. Corrigir o registro pede a Agenda e o Prontuário em Gerenciar.',
      podeEditar: false,
    }))
  it('cancelado: diz que foi cancelado, e não há registro a editar', () =>
    expect(textoDoRegistroTravado('CANCELLED', true)).toEqual({
      titulo: 'Atendimento cancelado',
      texto: 'Este agendamento foi cancelado: não houve atendimento, então não há registro a editar.',
      podeEditar: false,
    }))
  it('não compareceu: diz a falta', () =>
    expect(textoDoRegistroTravado('NO_SHOW', true)).toEqual({
      titulo: 'A cliente não compareceu',
      texto: 'A falta foi marcada: não houve atendimento, então não há registro a editar.',
      podeEditar: false,
    }))
})
