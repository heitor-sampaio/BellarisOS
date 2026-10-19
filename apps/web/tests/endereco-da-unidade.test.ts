import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { escolherEndereco, slugDoTexto, ENDERECOS_RESERVADOS } from '@/lib/unidades/endereco'

describe('o endereço (slug) da unidade é único no sistema inteiro', () => {
  it('vem do nome, sem acento nem símbolo', () => {
    expect(slugDoTexto('São José — Centro!')).toBe('sao-jose-centro')
    expect(slugDoTexto('  Jardins  ')).toBe('jardins')
  })

  it('livre: o próprio nome', () => {
    expect(escolherEndereco('centro', 'Clínica Aurora', new Set())).toBe('centro')
  })

  it('ocupado por outra clínica: com o nome da clínica; depois, numerado', () => {
    expect(escolherEndereco('centro', 'Clínica Aurora', new Set(['centro']))).toBe('centro-clinica-aurora')
    expect(escolherEndereco('centro', 'Clínica Aurora', new Set(['centro', 'centro-clinica-aurora']))).toBe('centro-2')
    expect(escolherEndereco('centro', 'Clínica Aurora', new Set(['centro', 'centro-clinica-aurora', 'centro-2']))).toBe('centro-3')
  })

  it('o nome de uma rota do sistema nunca vira endereço de unidade', () => {
    expect(escolherEndereco('admin', 'Clínica Aurora', new Set())).toBe('admin-clinica-aurora')
    expect(escolherEndereco('login', 'Clínica Aurora', new Set())).toBe('login-clinica-aurora')
  })

  it('a reserva cobre toda rota fixa do topo do app (pasta nova em app/ entra na lista)', () => {
    const app = path.resolve(__dirname, '..', 'app')
    const topo = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('[') && !d.name.startsWith('_'))
      .flatMap(d => (d.name.startsWith('(') ? topo(path.join(dir, d.name)) : [d.name]))
    for (const rota of topo(app)) expect(ENDERECOS_RESERVADOS, `a rota /${rota}`).toContain(rota)
  })
})
