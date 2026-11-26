import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A5 da 32ª simulação (princípio 7): o filtro "Etapa" do inbox misturava as
 * etapas de funis diferentes — duas "Proposta" lado a lado, sem dizer de qual
 * funil. E escolher um funil não filtrava direito: a etapa derivada das
 * conversas carregadas levava sempre o PRIMEIRO funil da pessoa
 * (`c.funnel_ids[0]`), e o nome saía de uma lista sem repetição, desalinhada
 * dos ids.
 *
 * Agora cada etapa da conversa leva o funil DELA (`stage_funnel_ids`, alinhado
 * a `stage_ids`, e `stage_names` também alinhado), e, com mais de um funil e
 * nenhum escolhido, a etapa aparece como "Funil · Etapa".
 */

const fonte = (arq: string) => readFileSync(join(__dirname, '..', arq), 'utf8')

describe('o filtro "Etapa" não mistura os funis', async () => {
  const mod = await import('@/lib/inbox/rotulo-da-etapa').catch(() => null)
  const FUNIS = [{ id: 'f1', nome: 'Harmonização' }, { id: 'f2', nome: 'Corporal' }]

  it('o módulo existe', () => {
    expect(mod, 'lib/inbox/rotulo-da-etapa.ts').not.toBeNull()
  })

  it('com mais de um funil e nenhum escolhido: "Funil · Etapa"', () => {
    expect(mod!.rotuloDaEtapa({ nome: 'Proposta', funil: 'f2' }, FUNIS, 'todos')).toBe('Corporal · Proposta')
  })

  it('com o funil escolhido, ou com um funil só, só a etapa', () => {
    expect(mod!.rotuloDaEtapa({ nome: 'Proposta', funil: 'f2' }, FUNIS, 'f2')).toBe('Proposta')
    expect(mod!.rotuloDaEtapa({ nome: 'Proposta', funil: 'f1' }, [FUNIS[0]!], 'todos')).toBe('Proposta')
  })

  it('a conversa leva o funil de CADA etapa, alinhado aos ids', () => {
    const acoes = fonte('actions/inbox.ts')
    expect(acoes).toMatch(/stage_funnel_ids:\s+string\[\]/)
    const card = acoes.slice(acoes.indexOf('async function anexarDadosDoCard('))
    expect(card).toMatch(/agregado\.stage_funnel_ids\.push\(/)
    expect(card).not.toMatch(/!agregado\.stage_names\.includes\(/)
  })

  it('o filtro deriva a etapa com o funil dela e mostra o rótulo', () => {
    const filtros = fonte('components/admin/inbox-filtros.tsx')
    expect(filtros).not.toMatch(/funil: c\.funnel_ids\[0\]/)
    expect(filtros).toMatch(/c\.stage_funnel_ids\[i\]/)
    expect(filtros).toMatch(/rotuloDaEtapa\(e, opcoes\.funis, filtros\.funil\)/)
  })
})
