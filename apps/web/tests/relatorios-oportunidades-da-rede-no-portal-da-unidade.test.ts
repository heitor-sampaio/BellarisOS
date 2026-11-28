import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// FO-07 (D12 da 41ª): com uma unidade escolhida numa rede de mais de uma — no
// portal da rede E no portal da unidade —, os dois cartões da aba Oportunidades
// que não seguem o recorte se chamam "Conversão (rede)" e "Oportunidades
// recebidas (rede)". No portal da unidade eles saíam sem "(rede)": a página
// passava `branches={[branch]}` sem a unidade escolhida nem as da rede, e o
// rótulo (`daRede`) pede as duas. Na rede de UMA unidade, segue sem "(rede)".

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('os cartões "(rede)" no portal da unidade', () => {
  const pagina = fonte('app/[slug]/reports/page.tsx')

  it('a página diz que a unidade da rota é o recorte', () => {
    expect(pagina).toMatch(/selectedBranchId=\{branch\.id\}/)
  })

  it('e passa as unidades ativas da rede (a mesma régua do "uma unidade só")', () => {
    expect(pagina).toMatch(/const unidadesDaRede = await getCachedNetworkBranches\(ctx\.tenantId!\)/)
    expect(pagina).toMatch(/todasAsUnidades=\{unidadesDaRede\}/)
  })

  it('o cálculo continua só na unidade da rota', () => {
    expect(pagina).toMatch(/branches=\{\[branch\]\}/)
  })
})
