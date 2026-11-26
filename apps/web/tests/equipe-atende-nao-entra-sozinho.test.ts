import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * D9 da 32ª simulação (2026-11-26): acrescentar Cascavel às "Unidades" da
 * Ivanete (que atendia só em Passo Fundo) ligava o "Atende" em Cascavel sozinho
 * — a caixa fechada valia "as unidades dela" e acompanhava a mudança. A regra
 * (o Heitor, 8ª simulação: "o atende vira um checklist com todas as unidades,
 * as que estiverem marcadas ficam disponiveis"; AG-61/AG-62): atende onde está
 * MARCADO. Quem edita a pessoa que já atende fica com o que ela tinha; a
 * unidade nova aparece na lista, desmarcada, e quem edita a marca se quiser.
 * Só segue "todas as unidades dela" quem pediu isso na tela (a caixa ligada
 * agora, ou "Atender em todas as unidades dela").
 */
const PF = 'pf', CAS = 'cas', CHA = 'cha'

describe('D9: a unidade acrescentada não entra sozinha no "Atende"', () => {
  it('editando quem atende só em PF, acrescentar Cascavel mantém [PF] e abre a lista', async () => {
    const { estadoDoAtende } = await import('@/lib/equipe/atende')
    const e = estadoDoAtende({ ligado: true, aberto: false, acompanha: false, marcadas: [PF], unidadesDela: [PF, CAS] })
    expect(e.efetivo).toEqual([PF])
    expect(e.listaAVista, 'a lista mostra Cascavel desmarcada').toBe(true)
  })

  it('desmarcar antes de salvar vale', async () => {
    const { estadoDoAtende } = await import('@/lib/equipe/atende')
    const e = estadoDoAtende({ ligado: true, aberto: true, acompanha: false, marcadas: [CHA], unidadesDela: [PF, CHA] })
    expect(e.efetivo).toEqual([CHA])
  })

  it('quem pediu "todas as unidades dela" (a caixa ligada na tela) acompanha as unidades', async () => {
    const { estadoDoAtende } = await import('@/lib/equipe/atende')
    const e = estadoDoAtende({ ligado: true, aberto: false, acompanha: true, marcadas: [PF], unidadesDela: [PF, CAS] })
    expect(e.efetivo).toEqual([PF, CAS])
    expect(e.listaAVista).toBe(false)
  })

  it('a unidade tirada das "Unidades" sai do "Atende" (o Heitor, 23/11)', async () => {
    const { estadoDoAtende } = await import('@/lib/equipe/atende')
    const e = estadoDoAtende({ ligado: true, aberto: false, acompanha: false, marcadas: [PF, CAS], unidadesDela: [PF] })
    expect(e.efetivo).toEqual([PF])
    expect(e.listaAVista).toBe(false)
  })

  it('a caixa desligada não atende em nada', async () => {
    const { estadoDoAtende } = await import('@/lib/equipe/atende')
    expect(estadoDoAtende({ ligado: false, aberto: false, acompanha: true, marcadas: [], unidadesDela: [PF, CAS] }).efetivo).toEqual([])
  })

  it('o hook da tela usa a regra pura, e quem já atende nasce sem acompanhar', () => {
    const fonte = readFileSync(resolve(__dirname, '..', 'components/shared/unidades-do-membro.tsx'), 'utf8')
    expect(fonte).toMatch(/estadoDoAtende\(/)
    expect(fonte).toMatch(/useState\(inicial\.length === 0\)/)
  })
})

describe('D9: o gatilho do banco não troca a lista que a Equipe mandou', () => {
  it('a Equipe manda a marca "lista escolhida" e o gatilho a respeita', () => {
    const acao = readFileSync(resolve(__dirname, '..', 'actions/team.ts'), 'utf8')
    expect(acao).toMatch(/setHeader\('x-bellaris-atende-escolhido', '1'\)/)
    const raiz = resolve(__dirname, '..', '..', '..', 'supabase', 'migrations')
    const mig = readFileSync(resolve(raiz, '20261210500001_atende_escolhido_nao_segue_as_unidades.sql'), 'utf8')
    expect(mig).toMatch(/x-bellaris-atende-escolhido/)
    expect(mig).toMatch(/atende_em_sincronizar/)
    expect(mig.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})
