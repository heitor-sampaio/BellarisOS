import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  filtrosDaAgenda, lerTagsDaUrl, literalDeTags, aplicarFiltrosDaAgenda, buscaComFiltro,
  temFiltro, ocupacaoSeMede, SEM_FILTRO, bloqueioPassaNoFiltro,
} from '@/lib/agenda/filtros'

/**
 * Os filtros da Agenda (o Heitor, 18/11, sobre a agenda que só tinha "mostrar
 * cancelados" e dia/semana/mês: "Então precisa arrumar"; e a regra das Tags,
 * CLAUDE.md §1): por profissional, por sala e por tag, na CONSULTA.
 */

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'
const ROSA = '33333333-3333-4333-8333-333333333333'
const VOCABULARIO = ['Gestante', 'Indicação', 'VIP', 'Alto, médio']

describe('filtrosDaAgenda — o que vale da URL', () => {
  const opcoes = { profissionais: [ANA, BIA], salas: [ROSA], tags: VOCABULARIO }

  it('sem nada na URL, sem filtro', () => {
    expect(filtrosDaAgenda({}, opcoes)).toEqual(SEM_FILTRO)
    expect(temFiltro(SEM_FILTRO)).toBe(false)
  })

  it('a profissional e a sala só valem entre as opções da tela', () => {
    expect(filtrosDaAgenda({ profissional: ANA, sala: ROSA }, opcoes)).toEqual({ profissional: ANA, sala: ROSA, tags: [] })
    // Quem não está nas opções não vira filtro escondido (princípio 3: a tela diria "todas").
    expect(filtrosDaAgenda({ profissional: '99999999-9999-4999-8999-999999999999', sala: 'qualquer' }, opcoes))
      .toEqual(SEM_FILTRO)
  })

  it('com a Agenda em "só os meus" o filtro de profissional não existe: o pedido não vence o escopo', () => {
    expect(filtrosDaAgenda({ profissional: BIA }, { ...opcoes, profissionais: null }).profissional).toBeNull()
  })

  it('sem sala na tela (a rede sem unidade escolhida), o ?sala= não vale', () => {
    expect(filtrosDaAgenda({ sala: ROSA }, { ...opcoes, salas: null }).sala).toBeNull()
  })

  it('o valor repetido na URL vale o primeiro', () => {
    expect(filtrosDaAgenda({ profissional: [ANA, BIA] }, opcoes).profissional).toBe(ANA)
  })
})

describe('lerTagsDaUrl — as tags marcadas, com o nome do vocabulário', () => {
  it('casa sem caixa e devolve o nome do vocabulário, sem repetir', () => {
    expect(lerTagsDaUrl('vip,gestante,VIP', VOCABULARIO)).toEqual(['VIP', 'Gestante'])
  })
  it('a tag que não existe na rede sai', () => {
    expect(lerTagsDaUrl('VIP,Inventada', VOCABULARIO)).toEqual(['VIP'])
  })
  it('a tag com vírgula no nome volta inteira', () => {
    expect(lerTagsDaUrl('Alto, médio,VIP', VOCABULARIO)).toEqual(['Alto, médio', 'VIP'])
  })
  it('vazio, nada', () => {
    expect(lerTagsDaUrl('', VOCABULARIO)).toEqual([])
    expect(lerTagsDaUrl(',,', VOCABULARIO)).toEqual([])
  })
})

describe('literalDeTags — o array do Postgres, com aspas', () => {
  it('cada tag entre aspas; a aspa e a barra escapadas', () => {
    expect(literalDeTags(['VIP', 'Alto, médio'])).toBe('{"VIP","Alto, médio"}')
    expect(literalDeTags(['a"b', 'c\\d'])).toBe('{"a\\"b","c\\\\d"}')
  })
})

describe('aplicarFiltrosDaAgenda — o filtro vai na CONSULTA', () => {
  function consultaFalsa() {
    const chamadas: [string, string, unknown][] = []
    const q = {
      eq(c: string, v: unknown) { chamadas.push(['eq', c, v]); return q },
      contains(c: string, v: string) { chamadas.push(['contains', c, v]); return q },
      not(c: string, op: string, v: null) { chamadas.push(['not', c, [op, v]]); return q },
    }
    return { q, chamadas }
  }

  it('sem filtro, a consulta fica como estava', () => {
    const { q, chamadas } = consultaFalsa()
    aplicarFiltrosDaAgenda(q, SEM_FILTRO)
    expect(chamadas).toEqual([])
  })

  it('profissional, sala e tags (E: todas as marcadas) viram condições da consulta', () => {
    const { q, chamadas } = consultaFalsa()
    aplicarFiltrosDaAgenda(q, { profissional: ANA, sala: ROSA, tags: ['VIP', 'Gestante'] })
    expect(chamadas).toEqual([
      ['eq', 'professional_id', ANA],
      ['eq', 'room_id', ROSA],
      ['contains', 'clients.tags', '{"VIP","Gestante"}'],
      // A cliente que não passou no filtro sai com o agendamento (o !inner).
      ['not', 'clients', ['is', null]],
    ])
  })
})

describe('buscaComFiltro — a URL guarda os filtros, como o ?date=', () => {
  it('põe, troca e tira, sem mexer no resto', () => {
    expect(buscaComFiltro('?date=2026-11-18&cancelados=1', { profissional: ANA }))
      .toBe(`?date=2026-11-18&cancelados=1&profissional=${ANA}`)
    expect(buscaComFiltro(`?date=2026-11-18&profissional=${ANA}`, { profissional: null })).toBe('?date=2026-11-18')
    expect(buscaComFiltro('', { tags: ['VIP', 'Gestante'] })).toBe('?tags=VIP%2CGestante')
    expect(buscaComFiltro('?tags=VIP', { tags: [] })).toBe('')
  })
})

describe('ocupacaoSeMede — a ocupação é do tempo das profissionais', () => {
  it('com sala ou tag ela não se mede; com a profissional, sim (a dela)', () => {
    expect(ocupacaoSeMede(SEM_FILTRO)).toBe(true)
    expect(ocupacaoSeMede({ ...SEM_FILTRO, profissional: ANA })).toBe(true)
    expect(ocupacaoSeMede({ ...SEM_FILTRO, sala: ROSA })).toBe(false)
    expect(ocupacaoSeMede({ ...SEM_FILTRO, tags: ['VIP'] })).toBe(false)
  })
})

describe('bloqueioPassaNoFiltro — o bloqueio na grade filtrada', () => {
  const daAna = { professionalId: ANA, roomId: null }
  const daRosa = { professionalId: null, roomId: ROSA }
  it('sem filtro (ou só com tag: bloqueio não é pessoa), todos', () => {
    expect([daAna, daRosa].filter(b => bloqueioPassaNoFiltro(b, SEM_FILTRO))).toEqual([daAna, daRosa])
    expect([daAna, daRosa].filter(b => bloqueioPassaNoFiltro(b, { ...SEM_FILTRO, tags: ['VIP'] }))).toEqual([daAna, daRosa])
  })
  it('com a profissional, só o dela; com a sala, só o da sala', () => {
    expect([daAna, daRosa].filter(b => bloqueioPassaNoFiltro(b, { ...SEM_FILTRO, profissional: ANA }))).toEqual([daAna])
    expect([daAna, daRosa].filter(b => bloqueioPassaNoFiltro(b, { ...SEM_FILTRO, profissional: BIA }))).toEqual([])
    expect([daAna, daRosa].filter(b => bloqueioPassaNoFiltro(b, { ...SEM_FILTRO, sala: ROSA }))).toEqual([daRosa])
  })
})

describe('as duas agendas aplicam o filtro na consulta (não no navegador)', () => {
  const raiz = path.resolve(__dirname, '..')
  for (const arquivo of ['app/[slug]/agenda/page.tsx', 'app/admin/agenda/page.tsx']) {
    it(arquivo, () => {
      const fonte = readFileSync(path.join(raiz, arquivo), 'utf8')
      expect(fonte).toContain('filtrosDaAgenda(')
      expect(fonte).toContain('aplicarFiltrosDaAgenda(')
      // As opções de tag são o vocabulário lido no servidor (não useTagsDaRede).
      expect(fonte).toContain('tagsAtivasDaRede(')
    })
  }
})
