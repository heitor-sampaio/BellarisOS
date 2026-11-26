import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { textoDoRegistroTravado, TEXTO_DOS_INSUMOS_NO_EDITAR_REGISTRO } from '@/lib/atendimento/registro-travado'

// A2 da 33ª simulação e a Decisão A (decisão do Claude, 26/11, princípio 7):
// o "Editar registro" corrige o texto clínico (PT-11) e não os insumos — a
// baixa é movimento do estoque —, mas a tela não dizia onde se corrige o insumo.
describe('o "Editar registro" diz onde se corrigem os insumos', () => {
  it('o texto', () =>
    expect(TEXTO_DOS_INSUMOS_NO_EDITAR_REGISTRO).toBe('Os insumos não se editam aqui: o ajuste é no Estoque, por quem tem o Estoque em Gerenciar.'))
  it('a faixa do registro destravado o mostra', () => {
    const fonte = readFileSync(join(__dirname, '..', 'components/branch/appointment-session.tsx'), 'utf8')
    expect(fonte).toMatch(/data-insumos-no-editar[\s\S]{0,300}\{TEXTO_DOS_INSUMOS_NO_EDITAR_REGISTRO\}/)
  })
})

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
      // Corrigir o concluído é do Prontuário em Gerenciar, e só dele (UM4, o Heitor, 2026-11-23).
      texto: 'Atendimento concluído. Corrigir o registro pede o Prontuário em Gerenciar.',
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
