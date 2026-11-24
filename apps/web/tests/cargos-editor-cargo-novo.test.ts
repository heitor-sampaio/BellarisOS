import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O cargo recém-criado abre no editor, e o que se clica grava nele (D5 da 27ª
 * simulação, 2026-11-24; princípio 3). No banco: o "Financeiro" do Instituto
 * Helicônia ganhou, 52 s depois de criado o "Comercial", a agenda, os clientes,
 * o CRM e o Copilot em Gerenciar — o Comercial ficou vazio. O escolhido nasce no
 * endereço ANTES do pedido (o id do cargo novo vem da tela), e o cargo criado
 * vale na lista sem esperar o servidor.
 */
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')
describe('D5: o cargo recém-criado abre no editor, e o que se clica grava nele [3]', () => {
  const doServidor = [
    { id: 'adm', is_system: true, label: 'Admin da rede' },
    { id: 'fin', is_system: false, label: 'Financeiro' },
  ]
  const comercial = { id: 'com', is_system: false, label: 'Comercial' }

  it('o cargo criado vale na lista antes de o servidor mandá-la de novo', async () => {
    const { comOsCriados, cargoEscolhido } = await import('@/lib/cargos/cargo-escolhido')
    const lista = comOsCriados(doServidor, [comercial])
    expect(lista.map(r => r.id)).toEqual(['adm', 'fin', 'com'])
    // O endereço já diz o novo: é ele que abre (era o "Financeiro", o primeiro editável).
    expect(cargoEscolhido(lista, 'com')).toBe('com')
  })

  it('chegou a lista do servidor com ele: vale a do servidor, sem repetir', async () => {
    const { comOsCriados } = await import('@/lib/cargos/cargo-escolhido')
    const servidor = [...doServidor, { ...comercial, label: 'Comercial (servidor)' }]
    expect(comOsCriados(servidor, [comercial]).map(r => r.label)).toEqual(['Admin da rede', 'Financeiro', 'Comercial (servidor)'])
  })

  it('o id do cargo novo nasce na tela e vai ao endereço ANTES do pedido; a action grava com ele', () => {
    const tela = fonte('components/admin/roles-editor.tsx')
    expect(tela).toMatch(/<input type="hidden" name="id" value=\{novoId\}/)
    expect(tela).toMatch(/onSubmit=\{\(\) => escreverCargoNoEndereco\(novoId\)\}/)
    expect(tela).toMatch(/comOsCriados\(/)
    const acoes = fonte('actions/roles.ts')
    expect(acoes).toMatch(/formData\.get\('id'\)/)
    expect(acoes).toMatch(/duplicarCargo\(roleId: string, novoId\?: string/)
  })
})
