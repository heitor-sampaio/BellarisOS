import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avisoAcimaDoComum, LIMITE_DO_INTEIRO } from '@/lib/acima-do-comum'
import type { GrafoDeAutomacao } from '@estetica-os/types'

/**
 * O princípio 2 (não recusar o valor que a rede escolheu, no máximo avisar; o
 * Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser
 * feito.") e o princípio 3 (o que a tela mostra é o que vale na conta).
 *
 * - O "No máximo" do passo "Buscar clientes" vale o número gravado: a prévia e
 *   o motor cortavam em 500, calados, e o passo dizia o teto gravado. Acima de
 *   500 (o comum) a tela avisa; só o impossível (zero, negativo, fracionário,
 *   acima do registro) se recusa. Acima de 1.000 a leitura vai em páginas (o
 *   PostgREST corta em 1.000 em silêncio).
 * - As tags do filtro vão todas: cortavam em 50, caladas.
 * - O dia do mês vai de 1 a 31, e a tela diz o que acontece no mês sem aquele
 *   dia (o motor não dispara naquele mês).
 */
const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')

function linhas(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `c${String(i).padStart(6, '0')}`, name: `Cliente ${i}`, phone: null, auth_id: null }))
}

function grafoComBusca(cfgBusca: Record<string, unknown>, cfgGatilho: Record<string, unknown> = { frequencia: 'diaria', hora: '09:00' }): GrafoDeAutomacao {
  return {
    nos: [
      { id: 'g1', tipo: 'gatilho.agenda', nome: 'Todo dia', pos: { x: 0, y: 0 }, config: cfgGatilho },
      { id: 'b1', tipo: 'buscar.clientes', nome: 'Buscar', pos: { x: 200, y: 0 }, config: cfgBusca },
      { id: 'n1', tipo: 'acao.notificar_equipe', nome: 'Avisar', pos: { x: 400, y: 0 }, config: { alvo: 'responsavel', corpo: 'oi' } },
    ],
    ligacoes: [{ de: 'g1', para: 'b1' }, { de: 'b1', para: 'n1' }],
  } as unknown as GrafoDeAutomacao
}

describe('o "No máximo" do "Buscar clientes" vale o número que a rede gravou', () => {
  it('aceita qualquer inteiro maior que zero até o limite do registro; sem valor, os 200 que a tela mostra', async () => {
    const { conferirLimiteDaBusca } = await import('@/lib/automacoes/busca-do-passo')
    expect(conferirLimiteDaBusca(undefined)).toEqual({ limite: 200 })
    expect(conferirLimiteDaBusca(800)).toEqual({ limite: 800 })
    expect(conferirLimiteDaBusca(250_000)).toEqual({ limite: 250_000 })
    expect(conferirLimiteDaBusca(LIMITE_DO_INTEIRO)).toEqual({ limite: LIMITE_DO_INTEIRO })
  })

  it('recusa só o impossível: zero, negativo, fracionário e acima do registro', async () => {
    const { conferirLimiteDaBusca } = await import('@/lib/automacoes/busca-do-passo')
    for (const v of [0, -3, 2.5, LIMITE_DO_INTEIRO + 1, 'abc']) {
      expect(conferirLimiteDaBusca(v)).toHaveProperty('recusa')
    }
  })

  it('acima de 500 a tela avisa com o texto do "acima do comum", e o valor vale como está', async () => {
    const { avisoDoLimiteDaBusca } = await import('@/lib/automacoes/busca-do-passo')
    expect(avisoDoLimiteDaBusca(500)).toBeNull()
    expect(avisoDoLimiteDaBusca(501)).toBe(avisoAcimaDoComum(501, 500, 'clientes'))
    expect(avisoDoLimiteDaBusca(501)).toBe('Acima do comum (mais de 500 clientes). Confira: o valor vale como está.')
  })

  it('o motor lê o número gravado, não 500', async () => {
    const publico = await import('@/lib/clientes/publico')
    const ate = vi.spyOn(publico, 'lerPublicoAte').mockImplementation(async (_t, _f, n) => linhas(Math.min(n, 900)))
    try {
      const { buscarClientes } = await import('@/lib/automacoes/tempo')
      const r = await buscarClientes('rede', { limite: 800 })
      expect(ate.mock.calls.at(-1)?.[2]).toBe(801)
      expect(r.clientes).toHaveLength(800)
      expect(r.truncado).toBe(true)
    } finally {
      ate.mockRestore()
    }
  })

  it('acima de 1.000 a leitura vai em páginas (o PostgREST corta em 1.000 em silêncio)', async () => {
    const publico = await import('@/lib/clientes/publico')
    const ate = vi.spyOn(publico, 'lerPublicoAte').mockImplementation(async (_t, _f, n) => linhas(Math.min(n, 1000)))
    const todas = vi.spyOn(publico, 'lerPublico').mockResolvedValue(linhas(2000))
    try {
      const { buscarClientes } = await import('@/lib/automacoes/tempo')
      const r = await buscarClientes('rede', { limite: 1500 })
      expect(r.clientes).toHaveLength(1500)
      expect(r.truncado).toBe(true)
      todas.mockResolvedValue(linhas(1200))
      const r2 = await buscarClientes('rede', { limite: 1500 })
      expect(r2.clientes).toHaveLength(1200)
      expect(r2.truncado).toBe(false)
    } finally {
      ate.mockRestore()
      todas.mockRestore()
    }
  })

  it('o motor recusa o impossível com o motivo, em vez de chutar outro número', async () => {
    const { buscarClientes } = await import('@/lib/automacoes/tempo')
    await expect(buscarClientes('rede', { limite: 0 })).rejects.toThrow(/No máximo/)
  })

  it('a validação acusa o impossível como erro (não liga) e deixa passar o acima do comum', async () => {
    const { validarGrafo } = await import('@/lib/automacoes/validar')
    const doPasso = (cfg: Record<string, unknown>) => validarGrafo(grafoComBusca(cfg)).filter(p => p.noId === 'b1' && p.grau === 'erro')
    expect(doPasso({ limite: 0 })).toHaveLength(1)
    expect(doPasso({ limite: 2.5 })).toHaveLength(1)
    expect(doPasso({ limite: 5000 })).toHaveLength(0)
    expect(doPasso({})).toHaveLength(0)
  })

  it('a prévia, o motor e o passo não têm mais o 500 calado, e o passo diz o teto que valeu', () => {
    const acao = fonte('actions/automacoes.ts')
    expect(acao).not.toMatch(/Math\.min\(Math\.floor\(limite\), 500\)/)
    expect(fonte('lib/automacoes/tempo.ts')).not.toMatch(/Math\.min\(cfg\.limite \?\? 200, 500\)/)
    const executar = fonte('lib/automacoes/executar.ts')
    expect(executar).not.toMatch(/O teto de \$\{cfg\.limite \?\? 200\}/)
    expect(executar).toMatch(/O teto de \$\{limite\.toLocaleString\('pt-BR'\)\} cortou a lista/)
    const painel = fonte('components/admin/automacoes/painel-do-no.tsx')
    expect(painel).not.toMatch(/max=\{500\}/)
    expect(painel).toMatch(/data-acima-do-comum="limite-da-busca"/)
  })
})

describe('as tags do filtro vão todas', () => {
  it('sessenta tags chegam inteiras à busca', async () => {
    const { tagsDaBusca } = await import('@/lib/automacoes/busca-do-passo')
    const muitas = Array.from({ length: 60 }, (_, i) => `tag ${i}`)
    expect(tagsDaBusca(muitas)).toEqual(muitas)
    expect(tagsDaBusca(['a', 3, null, 'b'])).toEqual(['a', 'b'])
    expect(tagsDaBusca(undefined)).toBeUndefined()
  })

  it('a action não corta a lista em 50', () => {
    expect(fonte('actions/automacoes.ts')).not.toMatch(/\.slice\(0, 50\)/)
  })
})

describe('o dia do mês vai de 1 a 31, e a tela diz o mês sem aquele dia', () => {
  it('29, 30 e 31 dizem em que meses a automação não dispara; até 28, nada a dizer', async () => {
    const { dicaDoDiaDoMes } = await import('@/lib/automacoes/dia-do-mes')
    expect(dicaDoDiaDoMes(1)).toBeNull()
    expect(dicaDoDiaDoMes(28)).toBeNull()
    expect(dicaDoDiaDoMes(29)).toMatch(/fevereiro/)
    expect(dicaDoDiaDoMes(29)).toMatch(/bissexto/)
    expect(dicaDoDiaDoMes(30)).toMatch(/fevereiro/)
    expect(dicaDoDiaDoMes(31)).toMatch(/abril, junho, setembro e novembro/)
    expect(dicaDoDiaDoMes(31)).toMatch(/não dispara/)
  })

  it('o motor dispara no dia 31 só nos meses que o têm (o que a dica diz)', async () => {
    const { estaNaHora } = await import('@/lib/automacoes/tempo')
    const cfg = { frequencia: 'mensal' as const, hora: '09:00', diaDoMes: 31 }
    // 31/10 às 09:10 em Brasília (12:10Z): dispara. 30/11 (o último de novembro): não.
    expect(estaNaHora(cfg, null, new Date('2026-10-31T12:10:00.000Z'), 'America/Sao_Paulo')).toBe(true)
    expect(estaNaHora(cfg, null, new Date('2026-11-30T12:10:00.000Z'), 'America/Sao_Paulo')).toBe(false)
  })

  it('a validação recusa só o dia que não existe em mês nenhum', async () => {
    const { validarGrafo } = await import('@/lib/automacoes/validar')
    const doGatilho = (diaDoMes: number) =>
      validarGrafo(grafoComBusca({}, { frequencia: 'mensal', hora: '09:00', diaDoMes })).filter(p => p.noId === 'g1' && p.grau === 'erro')
    expect(doGatilho(31)).toHaveLength(0)
    expect(doGatilho(29)).toHaveLength(0)
    expect(doGatilho(0)).toHaveLength(1)
    expect(doGatilho(32)).toHaveLength(1)
    expect(doGatilho(1.5)).toHaveLength(1)
  })

  it('o painel oferece de 1 a 31 e não diz mais "Até o dia 28"', () => {
    const painel = fonte('components/admin/automacoes/painel-do-no.tsx')
    expect(painel).not.toMatch(/max=\{28\}/)
    expect(painel).not.toMatch(/Até o dia 28/)
    expect(painel).toMatch(/min=\{1\} max=\{31\}/)
    expect(painel).toMatch(/dicaDoDiaDoMes\(/)
  })
})
