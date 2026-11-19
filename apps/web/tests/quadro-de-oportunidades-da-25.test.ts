import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { opcoesDeTagDoQuadro, temTodasAsTags } from '@/lib/crm/filtro-de-tags'

/**
 * O quadro de oportunidades na 25ª simulação.
 *
 * D13 (CLAUDE.md §14, "botão que a pessoa não pode usar: a tela esconde";
 * crm-inbox.md, "quem só pode ver só pode ver"): o "Nova oportunidade" da
 * unidade e o "+" de cada etapa apareciam para quem tem o CRM em Ver, e o
 * card abria o formulário editável.
 *
 * D14 (CLAUDE.md §1, Tags: "onde tiver for passível de filtro, um dos filtros
 * que ela pode usar são as tags"): o filtro de Tags só oferecia as tags dos
 * cards carregados e sumia quando nenhum card tinha tag.
 */
const WEB = join(__dirname, '..')
const ler = (rel: string) => readFileSync(join(WEB, rel), 'utf8')

describe('D13: quem tem o CRM em Ver só vê', () => {
  it('o "Nova oportunidade" da unidade pede o CRM em Gerenciar', () => {
    expect(ler('app/[slug]/oportunidades/page.tsx')).toMatch(/can\(ctx, 'crm', 'MANAGE'\) && \(\s*<CRMLeadModal/)
  })
  it('o "+" de cada etapa também', () => {
    expect(ler('components/branch/crm-board.tsx')).toMatch(/!networkMode && podeMover && \(\s*<CRMLeadModal/)
  })
  it('o card abre só para ler: o formulário desligado, sem Salvar', () => {
    const board = ler('components/branch/crm-board.tsx')
    expect(board).toMatch(/somenteLeitura=\{!podeMover\}/)
    const modal = ler('components/branch/crm-lead-modal.tsx')
    expect(modal).toMatch(/<fieldset disabled=\{somenteLeitura\}/)
    expect(modal).toMatch(/\{!somenteLeitura && \(\s*<button type="submit"/)
  })
})

describe('D14: o filtro de Tags do quadro oferece o vocabulário da rede', () => {
  it('com o vocabulário e nenhum card com tag, as tags da rede são opções', () => {
    expect(opcoesDeTagDoQuadro(['VIP', 'Indicação'], [])).toEqual(['Indicação', 'VIP'])
  })
  it('a tag de um card fora do vocabulário (arquivada) também, sem repetir pela caixa', () => {
    expect(opcoesDeTagDoQuadro(['VIP'], [['vip', 'Antiga']])).toEqual(['Antiga', 'VIP'])
  })
  it('o filtro não liga para a caixa ("VIP" e "vip" são a mesma tag)', () => {
    expect(temTodasAsTags(['vip'], ['VIP'])).toBe(true)
    expect(temTodasAsTags(['Outra'], ['VIP'])).toBe(false)
  })
  // A regra mudou (o Heitor, 19/11: "Quem tem TODAS (E)", em todo filtro de
  // tags): o quadro usava OU (`temAlgumaTag`), e a lista de Clientes, o
  // inbox e o Financeiro usam E. Agora o card entra com TODAS as marcadas.
  it('com duas tags marcadas, o card precisa das DUAS (E, como Clientes e o inbox)', () => {
    expect(temTodasAsTags(['VIP', 'Indicação'], ['vip', 'Indicação'])).toBe(true)
    expect(temTodasAsTags(['VIP'], ['VIP', 'Indicação'])).toBe(false)
    expect(temTodasAsTags([], ['VIP'])).toBe(false)
    expect(temTodasAsTags(null, ['VIP'])).toBe(false)
  })
  it('as duas páginas passam o vocabulário ao quadro, e o quadro o usa', () => {
    expect(ler('app/[slug]/oportunidades/page.tsx')).toMatch(/tagsDaRede=\{/)
    expect(ler('app/admin/oportunidades/page.tsx')).toMatch(/tagsDaRede=\{/)
    const board = ler('components/branch/crm-board.tsx')
    expect(board).toMatch(/opcoesDeTagDoQuadro\(/)
    expect(board).toMatch(/temTodasAsTags\(l\.tags, filters\.tags\)/)
    expect(board).not.toMatch(/temAlgumaTag/)
  })
})
