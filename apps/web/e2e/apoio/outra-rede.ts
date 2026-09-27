import { expect } from '@playwright/test'
import { banco, PREFIXO } from './banco'
import { apagarClientes } from './limpeza'

/**
 * Uma SEGUNDA rede `[e2e]`, inteira, só para ser alvo.
 *
 * O banco de dev tem uma rede só, e sem uma segunda nenhum teste prova que uma
 * rede não mexe na outra — que é justamente o furo mais comum desta base (todo
 * export de `'use server'` é endpoint público, e a conferência de rede era
 * esquecida action por action). Nasceu no teste de RLS e virou apoio quando a
 * varredura de 2026-09-27 achou o mesmo furo no checkout, no financeiro, no
 * estoque e no crédito interno.
 *
 * Tudo nasce com `[e2e]`: se `limpar()` não rodar, `varrerSobras` recolhe.
 */
export interface OutraRede {
  tenantId: string
  branchId: string
  procedureId: string
  professionalId: string
  /** Cliente da outra rede, com conta de fidelidade (nasce junto, como no app). */
  criarCliente(rotulo: string): Promise<string>
  /** Produto da outra rede, com saldo na unidade dela. */
  criarProduto(rotulo: string, saldo?: number): Promise<string>
  limpar(): Promise<void>
}

export async function criarOutraRede(marca: string): Promise<OutraRede> {
  const db = banco()
  const clientes: string[] = []
  const produtos: string[] = []

  const { data: t, error: eT } = await db.from('tenants')
    .insert({ name: `${PREFIXO} Outra rede ${marca}`, slug: `e2e-outra-${marca}`, email: `e2e-outra-${marca}@bellaris.invalid` })
    .select('id').single<{ id: string }>()
  expect(eT, 'criar a outra rede').toBeNull()
  const { data: b, error: eB } = await db.from('branches')
    .insert({ tenant_id: t!.id, name: `${PREFIXO} Unidade ${marca}`, slug: `e2e-un-${marca}` })
    .select('id').single<{ id: string }>()
  expect(eB, 'criar a unidade da outra rede').toBeNull()
  const { data: pr, error: ePr } = await db.from('procedures')
    .insert({ tenant_id: t!.id, name: `${PREFIXO} Proc ${marca}`, category: 'e2e', duration_min: 30, price: 0 })
    .select('id').single<{ id: string }>()
  expect(ePr, 'criar o procedimento da outra rede').toBeNull()
  const { data: auth } = await db.auth.admin.createUser({ email: `e2e-prof-${marca}@bellaris.invalid`, email_confirm: true })
  const { data: prof, error: eP } = await db.from('users')
    .insert({ tenant_id: t!.id, auth_id: auth.user!.id, name: `${PREFIXO} Prof ${marca}`, email: `e2e-prof-${marca}@bellaris.invalid` })
    .select('id').single<{ id: string }>()
  expect(eP, 'criar o profissional da outra rede').toBeNull()

  const rede: OutraRede = {
    tenantId: t!.id, branchId: b!.id, procedureId: pr!.id, professionalId: prof!.id,

    async criarCliente(rotulo) {
      const { data, error } = await db.from('clients')
        .insert({ tenant_id: t!.id, branch_id: b!.id, name: `${PREFIXO} ${rotulo} ${marca}`, phone: '5548' + String(Date.now()).slice(-9) })
        .select('id').single<{ id: string }>()
      expect(error, `criar o cliente ${rotulo} na outra rede`).toBeNull()
      await db.from('loyalty_accounts').upsert({ client_id: data!.id }, { onConflict: 'client_id' })
      clientes.push(data!.id)
      return data!.id
    },

    async criarProduto(rotulo, saldo = 10) {
      const { data, error } = await db.from('products')
        .insert({ tenant_id: t!.id, name: `${PREFIXO} ${rotulo} ${marca}`, unit: 'un' })
        .select('id').single<{ id: string }>()
      expect(error, `criar o produto ${rotulo} na outra rede`).toBeNull()
      await db.from('branch_product_stock').insert({ product_id: data!.id, branch_id: b!.id, current_stock: saldo, min_stock: 0 })
      produtos.push(data!.id)
      return data!.id
    },

    async limpar() {
      if (clientes.length) {
        const falhas = await apagarClientes(clientes)
        for (const f of falhas) console.warn(`[e2e] outra rede: não apagou ${f.o_que}: ${f.erro}`)
      }
      if (produtos.length) {
        await db.from('product_batches').delete().in('product_id', produtos)
        await db.from('stock_movements').delete().in('product_id', produtos)
        await db.from('branch_product_stock').delete().in('product_id', produtos)
        await db.from('domain_events').delete().in('entidade_id', produtos)
        await db.from('products').delete().in('id', produtos)
      }
      await db.from('users').delete().eq('id', prof!.id)
      await db.auth.admin.deleteUser(auth.user!.id)
      await db.from('procedures').delete().eq('id', pr!.id)
      await db.from('branches').delete().eq('id', b!.id)
      await db.from('role_permissions').delete().eq('tenant_id', t!.id)
      await db.from('tenant_roles').delete().eq('tenant_id', t!.id)
      await db.from('domain_events').delete().eq('tenant_id', t!.id)
      await db.from('tenants').delete().eq('id', t!.id)
    },
  }
  return rede
}
