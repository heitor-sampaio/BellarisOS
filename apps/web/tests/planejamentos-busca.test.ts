import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { planoCasaComBusca } from '@/lib/busca/cliente'

/**
 * F73 (a sobra da F70): a busca da lista de Planejamentos segue a regra única
 * da busca de cliente (lib/busca/cliente.ts) — sem acento, o telefone pelos
 * dígitos nacionais, o documento por dígitos.
 */
const plano = { nome: 'Plano de Rejuvenescimento', cliente: { name: 'José Antônio', phone: '+55 (31) 99100-0034' }, documento: '529.982.247-25' }

describe('a busca dos planejamentos', () => {
  it('sem acento acha o nome da cliente e o do plano', () => {
    expect(planoCasaComBusca(plano, 'jose antonio')).toBe(true)
    expect(planoCasaComBusca(plano, 'rejuvenescimento')).toBe(true)
  })
  it('o telefone pelos dígitos nacionais, com ou sem o 55', () => {
    expect(planoCasaComBusca(plano, '31991000034')).toBe(true)
    expect(planoCasaComBusca(plano, '(31) 99100-0034')).toBe(true)
  })
  it('o documento por dígitos', () => {
    expect(planoCasaComBusca(plano, '52998224725')).toBe(true)
  })
  it('o que não é dela não casa', () => {
    expect(planoCasaComBusca(plano, 'maria')).toBe(false)
    expect(planoCasaComBusca(plano, '11988887777')).toBe(false)
  })
  it('listarPlanejamentos filtra pela regra, não com includes', () => {
    const t = fs.readFileSync(path.resolve(__dirname, '../actions/treatment-plans.ts'), 'utf8')
    const ini = t.indexOf('export async function listarPlanejamentos')
    const corpo = t.slice(ini, t.indexOf('\nexport ', ini + 10))
    expect(corpo).toMatch(/planoCasaComBusca\(/)
    expect(corpo).not.toMatch(/toLowerCase\(\)\.includes\(termo\)/)
  })
})
