import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * plataforma:UN-13: as Comissões estão entre as telas em que a unidade
 * desativada aparece com o selo. O cabeçalho já o mostrava com a unidade
 * escolhida no filtro; o CARD de cada pessoa (uma pessoa × uma unidade), em
 * "Todas as unidades" no portal da rede, dizia só o nome da unidade — o card
 * da desativada parecia o de uma unidade no ar.
 */
const tela = readFileSync(join(__dirname, '..', 'components/shared/financeiro-comissoes.tsx'), 'utf8')

describe('UN-13: o card das comissões da unidade desativada tem o selo', () => {
  it('junto do nome da unidade do card, pela unidade DELE (não a do filtro)', () => {
    const card = tela.slice(tela.indexOf('{r.branchName}</p>'), tela.indexOf('{r.branchName}</p>') + 400)
    expect(card).toMatch(/\{p\.unidades\?\.find\(u => u\.id === r\.branchId\)\?\.ativa === false && <SeloUnidadeDesativada \/>\}/)
  })
  it('o do cabeçalho continua (a unidade escolhida no filtro)', () => {
    expect(tela).toMatch(/\{p\.unidades\?\.find\(u => u\.id === p\.unidadeAtual\)\?\.ativa === false && <SeloUnidadeDesativada \/>\}/)
  })
})
