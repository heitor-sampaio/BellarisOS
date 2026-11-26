import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * As listas só oferecem o que está LIVRE, também fora da agenda (o Heitor, 26/11,
 * na página de perguntas, R13 e R14: "Só mostra os horarios, salas e pessoas que
 * estão livres"; "Horarios, salas e pessoas não disponíveis não devem aparecer
 * nas listas"):
 * - a sala do agendar pelo painel da oportunidade (CRM) mostrava "(ocupada)";
 * - o repasse da desativação listava a pessoa com atendimento no horário,
 *   desligada, e contava como livre a pessoa BLOQUEADA no horário (o servidor
 *   recusava ao repassar — R07: "se ta bloqueado não dá pra marcar").
 */
const ler = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

describe('o painel da oportunidade: a sala do agendar', () => {
  const painel = ler('components/admin/inbox-lead-panel.tsx')
  it('não oferece a sala ocupada ou bloqueada (só a já escolhida fica, marcada)', () => {
    expect(painel).not.toMatch(/\(ocupada\)`/)
    expect(painel).toMatch(/soOQueEstaLivre\(salasOferecidas/)
  })
  it('sem sala livre, diz por quê', () => {
    expect(painel).toContain('Nenhuma sala está livre nesse horário: o agendamento vai sem sala.')
  })
})

describe('o repasse da desativação', () => {
  const tela = ler('components/admin/desativar-membro.tsx')
  const repasse = ler('lib/equipe/repasse.ts')
  it('não lista quem tem atendimento no horário', () => {
    expect(tela).not.toContain('(com atendimento no horário)')
  })
  it('quem está bloqueado no horário não conta como livre', () => {
    expect(repasse).toMatch(/from\('agenda_bloqueios'\)/)
    expect(repasse).toMatch(/bloqueados\.get\(p\.id\)/)
  })
})
