import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NODES, EVENTOS } from '@estetica-os/types'
import type { GrafoDeAutomacao, NomeDeEvento } from '@estetica-os/types'
import { variaveisDisponiveis, achatarDados } from '@/lib/automacoes/disponiveis'
import { isoNoFuso, dataHoraNoFuso } from '@/lib/datetime'
import { paraOTitular, diaSemHora } from '@/lib/lgpd/export'

/**
 * D15, A25 e A24 da 25ª simulação.
 *
 * D15 (princípio 3): no gatilho de oportunidade, o "Se" e o texto da mensagem
 * só ofereciam o nome e o telefone da CLIENTE — vazios para quem ainda não tem
 * ficha, que é o caso comum de uma oportunidade nova. O motor já hidrata
 * `lead.nome` e `lead.telefone` (contexto.ts).
 *
 * A25 (princípio 7): a dica do campo visto mostrava o ISO cru
 * ("2026-11-18T17:30:00.000Z") e listava os ids do payload.
 *
 * A24 (princípio 7): o JSON do titular (LGPD) trazia as datas em ISO UTC.
 */
const WEB = join(__dirname, '..')

function grafoCom(evento: NomeDeEvento): GrafoDeAutomacao {
  return {
    nos: [
      { id: 'g', tipo: NODES.GATILHO_EVENTO, pos: { x: 0, y: 0 }, nome: 'Quando', config: { evento } },
      { id: 'se', tipo: NODES.CONDICAO_SE, pos: { x: 1, y: 0 }, nome: 'Se', config: {} },
    ],
    ligacoes: [{ id: 'l', de: 'g', para: 'se' }],
  }
}

describe('D15: a oportunidade oferece o nome e o telefone dela', () => {
  it('o grupo Oportunidade tem lead.nome e lead.telefone', () => {
    const grupos = variaveisDisponiveis(grafoCom(EVENTOS.LEAD_CRIADO), 'se')
    const caminhos = grupos.find(g => g.grupo === 'Oportunidade')!.itens.map(i => i.caminho)
    expect(caminhos).toEqual(expect.arrayContaining(['lead.nome', 'lead.telefone']))
  })
  it('no gatilho de oportunidade ou de conversa, o grupo Cliente avisa que fica vazio sem ficha', () => {
    for (const ev of [EVENTOS.LEAD_CRIADO, EVENTOS.CONVERSA_MENSAGEM_RECEBIDA]) {
      const cliente = variaveisDisponiveis(grafoCom(ev), 'se').find(g => g.grupo === 'Cliente')!
      expect(cliente.rotulo).toMatch(/vazio se a pessoa ainda não tem ficha/)
    }
    const doAgendamento = variaveisDisponiveis(grafoCom(EVENTOS.AGENDAMENTO_CRIADO), 'se').find(g => g.grupo === 'Cliente')!
    expect(doAgendamento.rotulo).toBeUndefined()
  })
  it('o seletor mostra o rótulo do grupo', () => {
    expect(readFileSync(join(WEB, 'components/admin/automacoes/painel-do-no.tsx'), 'utf8')).toMatch(/label=\{g\.rotulo \?\? g\.grupo\}/)
  })
})

describe('A25: a dica do campo visto é legível', () => {
  it('a data e hora vem no fuso da rede, dd/mm/aaaa hh:mm', () => {
    const vistos = achatarDados({ inicio: '2026-11-18T17:30:00.000Z' }, 'evento.dados', 0, 'America/Sao_Paulo')
    expect(vistos[0]!.exemplo).toBe('18/11/2026 14:30')
  })
  it('o que não é data e hora passa como está', () => {
    const vistos = achatarDados({ dia: '2026-11-18', texto: 'oi' }, 'evento.dados', 0, 'America/Sao_Paulo')
    expect(vistos.map(v => v.exemplo)).toEqual(['2026-11-18', 'oi'])
  })
  // Os ids DECLARADOS no catálogo ("Id do cliente") ficam: perguntar se está vazio é regra de verdade.
  it('os ids só vistos no payload (fora do catálogo) não viram opção', () => {
    const grupos = variaveisDisponiveis(grafoCom(EVENTOS.LEAD_CRIADO), 'se', {
      vistos: [{ caminho: 'evento.dados.conversaId', exemplo: 'x' }, { caminho: 'evento.dados.branch_id', exemplo: 'y' }, { caminho: 'evento.dados.novoCampo', exemplo: 'z' }],
    })
    const doGatilho = grupos.find(g => g.grupo === 'O que chegou no gatilho')!.itens.map(i => i.caminho)
    expect(doGatilho).toContain('evento.dados.novoCampo')
    expect(doGatilho).not.toContain('evento.dados.conversaId')
    expect(doGatilho).not.toContain('evento.dados.branch_id')
  })
  it('a amostra do evento passa o fuso da rede', () => {
    expect(readFileSync(join(WEB, 'actions/automacoes.ts'), 'utf8')).toMatch(/achatarDados\(data\?\.dados \?\? null, 'evento\.dados', 0, await fusoDaRede\(ctx\.tenantId!\)\)/)
  })
})

describe('A24: as datas do JSON do titular no fuso da rede', () => {
  // O JSON é o arquivo da portabilidade (formato estruturado): segue ISO, mas com o relógio e o
  // deslocamento da rede — "14:30-03:00", não "17:30Z". A dica de tela é que vira dd/mm/aaaa hh:mm.
  it('isoNoFuso dá o mesmo instante no relógio do fuso, e recusa o resto', () => {
    expect(isoNoFuso('2026-11-18T17:30:00.000Z', 'America/Sao_Paulo')).toBe('2026-11-18T14:30:00-03:00')
    expect(isoNoFuso('2026-11-18T17:30:00+00:00', 'America/Manaus')).toBe('2026-11-18T13:30:00-04:00')
    expect(isoNoFuso('2026-11-18', 'America/Sao_Paulo')).toBeNull()
    expect(isoNoFuso('texto', 'America/Sao_Paulo')).toBeNull()
    expect(dataHoraNoFuso('2026-11-18T17:30:00.000Z', 'America/Sao_Paulo')).toBe('18/11/2026 14:30')
    expect(dataHoraNoFuso('2026-11-18', 'America/Sao_Paulo')).toBeNull()
  })
  it('paraOTitular troca o instante em qualquer nível, e a data sem hora fica', () => {
    const saida = paraOTitular({ criado_em: '2026-11-18T17:30:00.000Z', nascimento: '1990-05-02', itens: [{ quando: '2026-01-02T03:04:00Z' }] }, 'America/Sao_Paulo')
    expect(saida).toEqual({ criadoEm: '2026-11-18T14:30:00-03:00', nascimento: '1990-05-02', itens: [{ quando: '2026-01-02T00:04:00-03:00' }] })
  })
  // D5 da 28ª (regressão da A24): o nascimento chega do banco como INSTANTE à meia-noite UTC
  // ("1993-02-28T00:00:00+00:00") e o isoNoFuso o virava na véspera ("1993-02-27T21:00:00-03:00").
  // CLAUDE.md §14: data sem hora não passa por fuso. O pacote grava o dia ("1993-02-28").
  it('o nascimento em instante à meia-noite UTC sai como o DIA, nunca a véspera', () => {
    expect(diaSemHora('1993-02-28T00:00:00+00:00')).toBe('1993-02-28')
    expect(diaSemHora('1993-02-28T00:00:00.000Z')).toBe('1993-02-28')
    expect(diaSemHora('1993-02-28')).toBe('1993-02-28')
    expect(diaSemHora(null)).toBeNull()
    expect(paraOTitular({ dataNascimento: diaSemHora('1993-02-28T00:00:00+00:00') }, 'America/Sao_Paulo')).toEqual({ dataNascimento: '1993-02-28' })
    expect(readFileSync(join(WEB, 'lib/lgpd/export.ts'), 'utf8')).toContain('dataNascimento: diaSemHora(client.birth_date)')
  })
  it('o pacote passa o fuso', () => {
    expect(readFileSync(join(WEB, 'lib/lgpd/export.ts'), 'utf8')).toMatch(/\}, fuso\) as Json/)
  })
})
