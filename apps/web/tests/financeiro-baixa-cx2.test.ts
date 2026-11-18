import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { TenantContext } from '@estetica-os/types'
import { NO_PERMISSIONS, ALL_SCOPES } from '@/lib/permissions'

/**
 * CX2 (o plano de adaptação, aprovado pelo Heitor em 13/11: "Blz pode ser
 * assim"): "O Financeiro tem a lista de tudo que falta receber, de todas as
 * clientes, e dá baixa só no que entra sem passar pelo balcão (a transferência
 * que caiu na conta)". A baixa no Financeiro (`markTransactionPaid`) pedia o
 * PDV (C33, F67): quem tinha o Financeiro em Gerenciar sem o PDV lia a lista e
 * não recebia. O que passa pelo balcão (a comanda, o check-in do plano) segue
 * no PDV.
 *
 * O "só os meus" do Financeiro não dá baixa (C35: o financeiro dessa pessoa é
 * "Minhas comissões").
 */

const raiz = path.join(__dirname, '..')
const fonte = (f: string) => readFileSync(path.join(raiz, f), 'utf8')

function ctx(over: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'auth-1', internalUserId: 'user-1', userName: 'Fulana', roleLabel: 'Cargo',
    tenantId: 'tenant-1', branchId: null, role: 'BRANCH_ADMIN', roleId: 'role-1', clientId: null,
    permissions: { ...NO_PERMISSIONS }, scopes: { ...ALL_SCOPES }, reportTabs: [],
    providesServices: false, isNetworkAdmin: false, isClient: false,
    ...over,
  }
}

describe('quem dá baixa no Financeiro (CX2)', () => {
  it('o PDV em Gerenciar, ou o Financeiro em Gerenciar de todos', async () => {
    const { podeDarBaixa } = await import('@/lib/financeiro/so-os-meus')
    expect(podeDarBaixa(ctx({ permissions: { ...NO_PERMISSIONS, cashier: 'MANAGE' } }))).toBe(true)
    expect(podeDarBaixa(ctx({ permissions: { ...NO_PERMISSIONS, financial: 'MANAGE' } }))).toBe(true)
    // Financeiro em Ver não dá baixa; "só os meus" também não (C35).
    expect(podeDarBaixa(ctx({ permissions: { ...NO_PERMISSIONS, financial: 'VIEW' } }))).toBe(false)
    expect(podeDarBaixa(ctx({
      permissions: { ...NO_PERMISSIONS, financial: 'MANAGE' }, scopes: { ...ALL_SCOPES, financial: 'OWN' },
    }))).toBe(false)
    expect(podeDarBaixa(ctx())).toBe(false)
  })

  it('a action e as duas telas do Financeiro usam a mesma régua', () => {
    const action = fonte('actions/financial.ts')
    const corpo = action.slice(action.indexOf('export async function markTransactionPaid'), action.indexOf('export async function reverseTransaction'))
    expect(corpo).toMatch(/podeDarBaixa\(ctx\)/)
    expect(corpo).not.toMatch(/assertPermission\(ctx, 'cashier', 'MANAGE'\)/)
    for (const pagina of ['app/admin/financeiro/page.tsx', 'app/[slug]/financeiro/page.tsx']) {
      expect(fonte(pagina), pagina).toMatch(/canPay\s*=\s*\{?podeDarBaixa\(ctx\)/)
    }
  })

  // A ficha da cliente recebe a parcela pela MESMA action (markTransactionPaid,
  // `AcoesDoLancamentoDaFicha`): o botão aparece a quem a action aceita.
  it('a ficha da cliente (rede e unidade) mostra o "Receber" a quem dá baixa', () => {
    for (const pagina of ['app/admin/clients/[id]/page.tsx', 'app/[slug]/clients/[id]/page.tsx']) {
      expect(fonte(pagina), pagina).toMatch(/podeReceberParcela=\{podeDarBaixa\(ctx\)\}/)
    }
  })

  it('quem não dá baixa lê quem dá', () => {
    for (const f of ['components/admin/admin-financial-view.tsx', 'components/branch/financial-hub.tsx']) {
      const corpo = fonte(f)
      expect(corpo, f).toContain('Receber é de quem tem o PDV ou o Financeiro em Gerenciar.')
      expect(corpo, f).not.toContain('Receber é de quem tem o PDV no cargo.')
    }
  })
})
