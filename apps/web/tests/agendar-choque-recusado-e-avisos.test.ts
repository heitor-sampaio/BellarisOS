import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avisoDosBloqueios } from '@/lib/agenda/bloqueio'
import { motivoDoConfirmarDesligado } from '@/lib/agenda/motivo-do-confirmar'

/**
 * O modal "Novo agendamento":
 * - D5: depois que o servidor recusa o choque, o "Usar o próximo livre" continua
 *   ali (AG-07: o modal "oferece 'Usar o próximo livre'"); a recusa trocava o
 *   bloco do choque por um texto sem o botão. A recusa segue UMA mensagem só
 *   (A26 da 5ª: `e2e/agenda-encaixe-avisa.spec.ts`).
 * - A7: no dia em que a unidade não abre, "A unidade não abre neste dia" aparecia
 *   duas vezes (o aviso do horário e a grade de horários vazia): uma só.
 * - A9: o aviso junto dos bloqueios (desde a R07, sem o "confirme só se for isso
 *   mesmo": o bloqueio recusa).
 */
const modal = () => readFileSync(join(__dirname, '..', 'components/branch/appointment-modal.tsx'), 'utf8')

describe('D5: a recusa do choque mantém o "Usar o próximo livre"', () => {
  it('o próximo livre é buscado pelo choque do aviso, também depois da recusa', () => {
    // E também pelo bloqueio e pela sala ocupada: o Heitor, 26/11, na página de
    // perguntas (R13/R14): "Só mostra os horarios, salas e pessoas que estão livres" /
    // "Horarios, salas e pessoas não disponíveis não devem aparecer nas listas".
    expect(modal()).toMatch(/const chaveDoProximo = \(conflitoDoAviso \|\| bloqueioDoAviso \|\| salaOcupada\) \? chaveDosAvisos : ''/)
  })
  it('a mensagem da recusa traz o botão', () => {
    expect(modal()).toMatch(/recusadoPorChoque && rotuloDoProximo && proximo && \(\s*<button[^>]*data-proximo-livre-da-recusa/)
  })
  it('a recusa de um horário que já saiu da tela não fica dizendo o choque', () => {
    expect(modal()).toMatch(/const recusaDeOutroHorario = /)
  })
})

/**
 * R06 (o Heitor, 26/11, na página de perguntas: "Desliga o botão, e os três
 * testes conferem o botão desligado (a proposta)"): quando a janela já diz "Não
 * vai ser agendado"/"Não vai ser remarcado" (o choque com outro atendimento), o
 * Confirmar fica desligado, com o motivo ao lado (a regra do botão desligado com
 * o motivo). A recusa do servidor continua (a action recusa o choque: a ação
 * direta prova).
 * R07 (o Heitor, 26/11, no chat, sobre a R07: "r07 se ta bloqueado não dá pra
 * marcar"): o BLOQUEIO (da pessoa que atende ou da sala) é tratado como o
 * choque — "Não vai ser agendado", o Confirmar desligado, o motivo ao lado. O
 * encaixe fora do horário NÃO desliga: é permitido.
 */
const sheet = () => readFileSync(join(__dirname, '..', 'components/branch/appointment-sheet.tsx'), 'utf8')
const disabledDoBotao = (fonte: string, rotulo: string) => {
  const i = fonte.indexOf(rotulo)
  const inicio = fonte.lastIndexOf('<button', i)
  const trecho = fonte.slice(inicio, i)
  return /disabled=\{([^}]*)\}/.exec(trecho)?.[1] ?? ''
}

describe('R06 e R07: o choque e o bloqueio desligam o Confirmar, com o motivo ao lado', () => {
  it('o motivo diz por quê: o horário que já passou, o choque, o bloqueio', () => {
    expect(motivoDoConfirmarDesligado({ choque: true })).toBe('Escolha outro horário: este bate com outro atendimento.')
    expect(motivoDoConfirmarDesligado({ bloqueio: true })).toBe('Escolha outro horário: este está bloqueado.')
    expect(motivoDoConfirmarDesligado({ choque: true, passou: true })).toBe('Escolha outro horário: este já passou.')
    expect(motivoDoConfirmarDesligado({})).toBeNull()
  })
  it('agendar: o motivo vem do choque e do bloqueio do aviso', () => {
    // E da sala escolhida que ficou ocupada: o Heitor, 26/11, na página de perguntas
    // (R13/R14): "Só mostra os horarios, salas e pessoas que estão livres" /
    // "Horarios, salas e pessoas não disponíveis não devem aparecer nas listas".
    expect(modal()).toMatch(/const motivoDoConfirmar = motivoDoConfirmarDesligado\(\{ choque: !!conflitoDoAviso, bloqueio: !!bloqueioDoAviso, salaOcupada: !!salaOcupada \}\)/)
  })
  it('agendar: o "Confirmar agendamento" desliga com o motivo', () => {
    expect(disabledDoBotao(modal(), "'Confirmar agendamento'")).toMatch(/!!motivoDoConfirmar/)
  })
  it('agendar: o motivo aparece ao lado do botão', () => {
    expect(modal()).toMatch(/\{motivoDoConfirmar && \(\s*<span data-motivo-do-confirmar/)
  })
  it('agendar: o Enter no campo também não envia', () => {
    expect(modal()).toMatch(/if \(conferindoOHorario \|\| carregandoSalas \|\| motivoDoConfirmar\) return/)
  })
  it('agendar: o bloqueio diz "Não vai ser agendado", não é um aviso de encaixe', () => {
    expect(modal()).toMatch(/<span data-bloqueio-do-horario[\s\S]{0,300}Não vai ser agendado: \{bloqueioDoAviso\}/)
    expect(modal()).not.toMatch(/avisos\.bloqueio \?\? null, avisos\.foraDoHorario/)
  })
  it('remarcar: o motivo vem do choque, do horário que passou e do bloqueio', () => {
    expect(sheet()).toMatch(/const motivoDoConfirmar = motivoDoConfirmarDesligado\(\{ choque: !!conflitoRemarcar, passou: avisosLidos\.de === novoDT && !!avisosLidos\.passou, bloqueio: !!bloqueioRemarcar \}\)/)
  })
  it('remarcar: o "Confirmar novo horário" desliga com o motivo', () => {
    expect(disabledDoBotao(sheet(), "'Confirmar novo horário'")).toMatch(/!!motivoDoConfirmar/)
  })
  it('remarcar: o motivo aparece ao lado do botão', () => {
    expect(sheet()).toMatch(/\{motivoDoConfirmar && \(\s*<span data-motivo-do-confirmar/)
  })
  it('remarcar: o bloqueio diz "Não vai ser remarcado"', () => {
    expect(sheet()).toMatch(/Não vai ser remarcado: \{bloqueioRemarcar\}/)
  })
  it('o encaixe (fora do horário) não desliga nenhum dos dois', () => {
    expect(disabledDoBotao(modal(), "'Confirmar agendamento'")).not.toMatch(/avisosDoMomento|foraDoHorario/)
    expect(disabledDoBotao(sheet(), "'Confirmar novo horário'")).not.toMatch(/avisosRemarcar|foraDoHorario/)
  })
})

describe('A7: "A unidade não abre neste dia" uma vez só', () => {
  it('a grade de horários não aparece no dia em que a unidade não abre (o aviso do horário já diz)', () => {
    expect(modal()).toMatch(/\{gradeDoDia && horasDaGrade\.length > 0 && \(/)
  })
})

// A9 da 32ª pedia "Confirme só se for isso mesmo." no fim do aviso do bloqueio.
// R07 (o Heitor, 26/11, no chat, sobre a R07: "r07 se ta bloqueado não dá pra
// marcar"): não há mais o que confirmar — o bloqueio recusa; as frases só se juntam.
describe('A9 e R07: os bloqueios do horário, juntos, sem pedir confirmação', () => {
  it('um bloqueio', () => {
    expect(avisoDosBloqueios(['Bruna está com o horário bloqueado das 12:00 às 13:00 (Almoço).']))
      .toBe('Bruna está com o horário bloqueado das 12:00 às 13:00 (Almoço).')
  })
  it('vários, juntos; nenhum, nada', () => {
    expect(avisoDosBloqueios(['A.', 'B.'])).toBe('A. B.')
    expect(avisoDosBloqueios([])).toBeNull()
  })
  it('o aviso do horário usa a junção', () => {
    expect(readFileSync(join(__dirname, '..', 'lib/appointments/encaixe.ts'), 'utf8')).toMatch(/const bloqueio = avisoDosBloqueios\(\[/)
  })
})
