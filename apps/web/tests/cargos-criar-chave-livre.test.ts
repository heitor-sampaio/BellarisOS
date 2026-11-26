import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * A mesma colisão do D1 da 32ª simulação (2026-11-26), no "Novo cargo": o cargo
 * renomeado guarda a chave (`tenant_roles.key`, única na rede) do nome de
 * nascença — "Cópia de Recepcionista" virou "Recepção sem caixa" com a chave
 * COPIA_DE_RECEPCIONISTA —, e criar um cargo chamado "Cópia de Recepcionista"
 * recusava com "Já existe um cargo com esse nome." sem existir cargo nenhum com
 * esse nome (princípio 3). A chave nasce livre (o sufixo _2, _3…), e a recusa
 * pelo nome só vale quando o RÓTULO já existe.
 */
describe('o cargo novo pega uma chave livre; recusa só o nome que já existe', () => {
  it('com a chave do nome ocupada por um cargo renomeado, a chave _2', async () => {
    const { chaveDoCargoNovo } = await import('@/lib/cargos/duplicar')
    const existentes = [
      { label: 'Recepcionista', key: 'RECEPTIONIST' },
      { label: 'Recepção sem caixa', key: 'COPIA_DE_RECEPCIONISTA' },
    ]
    expect(chaveDoCargoNovo('Cópia de Recepcionista', existentes)).toEqual({ key: 'COPIA_DE_RECEPCIONISTA_2' })
  })

  it('a _2 também ocupada: a _3', async () => {
    const { chaveDoCargoNovo } = await import('@/lib/cargos/duplicar')
    const existentes = [
      { label: 'Recepção A', key: 'COMERCIAL' },
      { label: 'Recepção B', key: 'COMERCIAL_2' },
    ]
    expect(chaveDoCargoNovo('Comercial', existentes)).toEqual({ key: 'COMERCIAL_3' })
  })

  it('nada ocupado: a chave do nome', async () => {
    const { chaveDoCargoNovo } = await import('@/lib/cargos/duplicar')
    expect(chaveDoCargoNovo('Comercial', [{ label: 'Recepcionista', key: 'RECEPTIONIST' }])).toEqual({ key: 'COMERCIAL' })
  })

  it('o nome que já existe (sem diferença de acento e maiúscula) recusa', async () => {
    const { chaveDoCargoNovo } = await import('@/lib/cargos/duplicar')
    const existentes = [{ label: 'Recepção', key: 'RECEPTIONIST' }]
    expect(chaveDoCargoNovo('recepcao', existentes)).toEqual({ error: 'Já existe um cargo com esse nome.' })
    expect(chaveDoCargoNovo('Recepção', existentes)).toEqual({ error: 'Já existe um cargo com esse nome.' })
  })

  it('o createRole lê os rótulos e as chaves da rede e grava a chave livre', () => {
    const fonte = readFileSync(resolve(__dirname, '..', 'actions/roles.ts'), 'utf8')
    const corpo = fonte.slice(fonte.indexOf('export async function createRole'), fonte.indexOf('export async function updateRole'))
    expect(corpo).toMatch(/select\('label, key'\)/)
    expect(corpo).toMatch(/chaveDoCargoNovo\(/)
  })

  // O renomear também: a recusa por 23505 nunca disparava (o rótulo não é único
  // no banco), e renomear para o nome de outro cargo passava sem aviso.
  it('renomear para o nome de OUTRO cargo recusa; o mesmo cargo com outra grafia passa', async () => {
    const { nomeJaUsado } = await import('@/lib/cargos/duplicar')
    const existentes = [
      { id: 'a', label: 'Recepção' },
      { id: 'b', label: 'Comercial' },
    ]
    expect(nomeJaUsado('recepcao', 'b', existentes)).toBe(true)
    expect(nomeJaUsado('Recepção', 'a', existentes)).toBe(false)
    expect(nomeJaUsado('Vendas', 'b', existentes)).toBe(false)
  })

  it('o updateRole confere o nome nos cargos da rede antes de gravar', () => {
    const fonte = readFileSync(resolve(__dirname, '..', 'actions/roles.ts'), 'utf8')
    const corpo = fonte.slice(fonte.indexOf('export async function updateRole'))
    expect(corpo.slice(0, corpo.indexOf('.update({ label })'))).toMatch(/nomeJaUsado\(label, roleId,/)
  })
})
