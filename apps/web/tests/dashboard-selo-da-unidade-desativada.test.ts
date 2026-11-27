import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * D13 da 35ª simulação (UN-13; plataforma.md, "a unidade desativada continua
 * CONTADA": ela leva o selo "Unidade desativada", `nomeNaTela`): no Dashboard
 * da rede, o "Aproveitamento por unidade" e o mapa diziam só o nome de Rio
 * Preto, desativada — o "Por unidade" e o "Hoje por unidade" já tinham o selo.
 * O mesmo selo, da mesma função, em todo bloco por unidade da página.
 */
const PAGINA = fs.readFileSync(path.resolve(__dirname, '..', 'app', 'admin', 'dashboard', 'page.tsx'), 'utf8')

const bloco = (inicio: string) => {
  const i = PAGINA.indexOf(inicio)
  expect(i, inicio).toBeGreaterThan(-1)
  return PAGINA.slice(i, PAGINA.indexOf('}))', i))
}

describe('D13: o dashboard da rede põe o selo da desativada em todo bloco por unidade', () => {
  it('o aproveitamento por unidade', () => {
    expect(bloco('const branchOccupancy')).toMatch(/name:\s*nomeNaTela\(\{ name: b\.branchName, ativa: b\.isActive \}\)/)
  })
  it('o mapa', () => {
    expect(bloco('const hotmapRawBranches')).toMatch(/name:\s*nomeNaTela\(b\)/)
  })
})
