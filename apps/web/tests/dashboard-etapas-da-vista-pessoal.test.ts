import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * DB-01 (inventário, 25/11): no dashboard da UNIDADE, quem atende sem a
 * Agenda vê as etapas da Agenda do quadro "Clientes no mês" com os números
 * DELA — a vista pessoal (VP-01; o Heitor, 23/11: "as vistas pessoais
 * resolvem"). Sem a Agenda nem a vista pessoal, as etapas continuam fora (A32
 * da 24ª). No dashboard da rede, a vista pessoal da agenda não existe (VP-01).
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('as etapas da Agenda na vista pessoal do dashboard da unidade', () => {
  const p = fonte('app/[slug]/dashboard/page.tsx')
  it('as etapas aparecem a quem vê a Agenda OU a vista pessoal dela', () => {
    expect(p).toContain('etapas={etapasDoQueOCargoVe(funnel, mostraAgenda)}')
  })
  it('na vista pessoal, os números das etapas da Agenda são os DELA (o núcleo dela), e o subtítulo diz', () => {
    expect(p).toMatch(/const agendaDoQuadro = professionalOnly \? core : doQuadro/)
    expect(p).toMatch(/count: agendaDoQuadro\.appointmentsTotal/)
    expect(p).toMatch(/count: agendaDoQuadro\.appointmentsCompleted/)
    expect(p).toContain('Os seus agendamentos')
  })
})
