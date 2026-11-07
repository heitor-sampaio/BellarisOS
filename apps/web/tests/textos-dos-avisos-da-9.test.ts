import { describe, it, expect } from 'vitest'
import {
  textoDoRemarcado, textoDoCancelado, textoDoConcluido, textoDoPagamento,
} from '@/lib/appointments/texto-do-aviso'

// A48 da 9ª simulação: "Seu Avaliação foi concluído" (o gênero errado), e só
// o "Horário marcado" dizia a unidade — o remarcado e o cancelado, não.
describe('os avisos à cliente', () => {
  it('o concluído e o pagamento não erram o gênero do procedimento', () => {
    expect(textoDoConcluido('Avaliação')).toBe('Atendimento concluído: Avaliação. Confirme e avalie pelo app.')
    expect(textoDoPagamento('Drenagem linfática')).toBe('Pagamento confirmado: Drenagem linfática.')
  })
  it('o remarcado e o cancelado dizem a unidade quando a clínica tem mais de uma', () => {
    expect(textoDoRemarcado('Avaliação', '07/11 às 10:00', 'Moinhos')).toBe('Novo horário: Avaliação em 07/11 às 10:00, na unidade Moinhos.')
    expect(textoDoRemarcado('Avaliação', '07/11 às 10:00', null)).toBe('Novo horário: Avaliação em 07/11 às 10:00.')
    expect(textoDoCancelado('Avaliação', '07/11 às 10:00', 'Moinhos', null))
      .toBe('Agendamento cancelado: Avaliação de 07/11 às 10:00, na unidade Moinhos.')
    expect(textoDoCancelado('Avaliação', '07/11 às 10:00', null, 'Imprevisto'))
      .toBe('Agendamento cancelado: Avaliação de 07/11 às 10:00. Motivo: Imprevisto.')
  })
})
