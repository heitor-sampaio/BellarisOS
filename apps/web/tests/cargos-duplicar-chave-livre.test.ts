import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * D1 da 32ª simulação (2026-11-26): o 2º "Duplicar" do mesmo cargo recusava com
 * "Já existe um cargo com esse nome.". A cópia renomeada guarda a chave
 * (`tenant_roles.key`, única na rede) do nome de nascença — "Cópia de
 * Recepcionista" virou "Recepção sem caixa" com a chave COPIA_DE_RECEPCIONISTA
 * —, e o nome da cópia seguinte conferia só os RÓTULOS: saía "Cópia de
 * Recepcionista" de novo, com a mesma chave (23505). A cópia escolhe o nome
 * cuja chave está livre entre os rótulos E as chaves (A15 da 15ª: "(2)", "(3)").
 */
describe('D1: a cópia do cargo pega um nome e uma chave livres', () => {
  it('com a chave da 1ª cópia ocupada por um cargo renomeado, vem o "(2)" e a chave _2', async () => {
    const { copiaDoCargo } = await import('@/lib/cargos/duplicar')
    const existentes = [
      { label: 'Recepcionista', key: 'RECEPTIONIST' },
      { label: 'Recepção sem caixa', key: 'COPIA_DE_RECEPCIONISTA' },
    ]
    expect(copiaDoCargo('Recepcionista', existentes)).toEqual({
      label: 'Cópia de Recepcionista (2)', key: 'COPIA_DE_RECEPCIONISTA_2',
    })
  })

  it('a chave do "(2)" também ocupada: vem o "(3)"', async () => {
    const { copiaDoCargo } = await import('@/lib/cargos/duplicar')
    const existentes = [
      { label: 'Recepcionista', key: 'RECEPTIONIST' },
      { label: 'Recepção A', key: 'COPIA_DE_RECEPCIONISTA' },
      { label: 'Recepção B', key: 'COPIA_DE_RECEPCIONISTA_2' },
    ]
    expect(copiaDoCargo('Recepcionista', existentes)).toEqual({
      label: 'Cópia de Recepcionista (3)', key: 'COPIA_DE_RECEPCIONISTA_3',
    })
  })

  it('nada ocupado: "Cópia de X", com a chave do nome', async () => {
    const { copiaDoCargo } = await import('@/lib/cargos/duplicar')
    expect(copiaDoCargo('Recepcionista', [{ label: 'Recepcionista', key: 'RECEPTIONIST' }]))
      .toEqual({ label: 'Cópia de Recepcionista', key: 'COPIA_DE_RECEPCIONISTA' })
  })

  it('o duplicarCargo lê as chaves e grava a da cópia livre', () => {
    const fonte = readFileSync(resolve(__dirname, '..', 'actions/roles.ts'), 'utf8')
    const corpo = fonte.slice(fonte.indexOf('export async function duplicarCargo'))
    expect(corpo).toMatch(/select\('label, key'\)/)
    expect(corpo).toMatch(/copiaDoCargo\(/)
  })
})
