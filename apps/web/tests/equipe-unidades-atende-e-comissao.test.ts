import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const raiz = path.join(__dirname, '..')
const fonte = (f: string) => readFileSync(path.join(raiz, f), 'utf8')

/**
 * EQ-06 / LO-03 do catálogo de Plataforma: o login abre na ÚLTIMA unidade usada
 * (PO1, aprovado na revisão — `lib/unidades/de-entrada.ts`); a principal só
 * quando não há uma. A Equipe dizia "Principal: X — o login abre nela."
 */
describe('a principal na Equipe', () => {
  it('não diz que o login abre sempre nela', () => {
    const c = fonte('components/shared/unidades-do-membro.tsx')
    expect(c).not.toMatch(/o login abre nela\./)
    expect(c).toMatch(/última unidade/)
  })
})

/**
 * UN-11/UN-12: "Mudar a equipe de unidade" (a janela de desativar a unidade).
 * - O "Atende" só vale nas unidades da pessoa (o Heitor, 2026-11-23: "uma
 *   pessoa só pode atender nas unidades que faz parte, isso é obvio"): a marca
 *   na unidade que sai vai para a unidade que entra (decisão do Claude,
 *   catálogo de 24/11, princípio 3 — o que ela fazia na que sai, faz na nova).
 * - Cada passo, um módulo; nenhuma ação pede dois (23/11): é da Equipe.
 */
describe('mudar a equipe de unidade', () => {
  it('a marca do "Atende" na unidade que sai vai para a que entra', async () => {
    const { atendeAoMudarDeUnidade } = await import('@/lib/equipe/atende')
    expect(atendeAoMudarDeUnidade(['sai', 'b'], 'sai', 'entra')).toEqual(['b', 'entra'].sort())
    expect(atendeAoMudarDeUnidade(['sai'], 'sai', 'entra')).toEqual(['entra'])
    expect(atendeAoMudarDeUnidade(['sai', 'entra'], 'sai', 'entra')).toEqual(['entra'])
    // Sem a unidade que sai, nada muda (nulo: a action não regrava o "Atende").
    expect(atendeAoMudarDeUnidade(['b'], 'sai', 'entra')).toBeNull()
    expect(atendeAoMudarDeUnidade([], 'sai', 'entra')).toBeNull()
  })

  it('pede só a Equipe em Gerenciar e grava o "Atende" junto com a unidade', () => {
    const c = fonte('actions/branches.ts')
    const ini = c.indexOf('export async function moverEquipeDaUnidade(')
    const corpo = c.slice(ini, c.indexOf('\n}\n', ini))
    expect(corpo).toMatch(/assertPermission\(ctx, 'team', 'MANAGE'\)/)
    expect(corpo).not.toMatch(/assertPermission\(ctx, 'settings'/)
    expect(corpo).toMatch(/atendeAoMudarDeUnidade\(/)
  })
})

/**
 * O resumo da comissão no cadastro (princípio 3; o mesmo que a A6 da 24ª
 * corrigiu no chip): sem a comissão de venda dela, vale a do pacote, a do
 * produto e a da rede — "Comissão: nenhuma." escondia as três.
 */
describe('o resumo da comissão de quem não atende', () => {
  it('sem a de venda dela, diz que vale a do pacote, do produto ou da rede', async () => {
    const { resumoDaComissaoDoMembro } = await import('@/lib/equipe/textos-do-cadastro')
    expect(resumoDaComissaoDoMembro({ tipo: 'NENHUMA', valor: '', venda: '', atende: false }))
      .toBe('Comissão: a de venda do pacote, do produto ou da rede.')
    expect(resumoDaComissaoDoMembro({ tipo: 'NENHUMA', valor: '', venda: '10', atende: false })).toBe('Comissão: 10% de cada venda.')
  })
})
