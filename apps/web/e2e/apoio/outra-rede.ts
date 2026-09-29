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
  /** Plano PROPOSTO de um cliente da outra rede — pronto para checkout —, com
   *  o prontuário do cliente e um termo PENDENTE. Alvo dos reenvios do checkout. */
  criarPlanoProposto(rotulo: string, opcoes?: { semTermo?: boolean }): Promise<{ planId: string; recordId: string; termId: string | null; clientId: string }>
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

    async criarPlanoProposto(rotulo, opcoes = {}) {
      const clientId = await rede.criarCliente(`Cliente ${rotulo}`)
      const { data: rec, error: eRec } = await db.from('medical_records')
        .upsert({ client_id: clientId }, { onConflict: 'client_id' }).select('id').single<{ id: string }>()
      expect(eRec, 'prontuário do cliente da outra rede').toBeNull()
      const { data: plano, error: ePl } = await db.from('treatment_plans')
        .insert({ branch_id: b!.id, professional_id: prof!.id, client_id: clientId, status: 'PROPOSED', name: `${PREFIXO} Plano ${rotulo} ${marca}` })
        .select('id').single<{ id: string }>()
      expect(ePl, 'plano da outra rede').toBeNull()
      const { data: sessao } = await db.from('treatment_plan_sessions')
        .insert({ plan_id: plano!.id, sort_order: 0 }).select('id').single<{ id: string }>()
      await db.from('treatment_plan_session_procedures')
        .insert({ session_id: sessao!.id, procedure_id: pr!.id, price: 50 })
      // Sem termo: é o alvo de "criar termos", que REAPROVEITA os existentes —
      // com um termo já lá, o reenvio não criaria nada nem com o furo aberto.
      if (opcoes.semTermo) return { planId: plano!.id, recordId: rec!.id, termId: null, clientId }
      const { data: termo, error: eT } = await db.from('consent_terms')
        .insert({ medical_record_id: rec!.id, treatment_plan_id: plano!.id, title: `${PREFIXO} termo alheio`, content: 'e2e', status: 'PENDING' })
        .select('id').single<{ id: string }>()
      expect(eT, 'termo da outra rede').toBeNull()
      return { planId: plano!.id, recordId: rec!.id, termId: termo!.id, clientId }
    },

    async limpar() {
      if (clientes.length) {
        const falhas = await apagarClientes(clientes)
        for (const f of falhas) console.warn(`[e2e] outra rede: não apagou ${f.o_que}: ${f.erro}`)
      }
      // Recompensas apontam procedimento e produto da rede: saem antes deles (e
      // depois dos clientes, cujos vouchers apontam a recompensa).
      await db.from('loyalty_rewards').delete().eq('tenant_id', t!.id)
      if (produtos.length) {
        await db.from('product_batches').delete().in('product_id', produtos)
        await db.from('stock_movements').delete().in('product_id', produtos)
        await db.from('branch_product_stock').delete().in('product_id', produtos)
        await db.from('domain_events').delete().in('entidade_id', produtos)
        await db.from('products').delete().in('id', produtos)
      }
      await db.from('users').delete().eq('id', prof!.id)
      await db.auth.admin.deleteUser(auth.user!.id)
      // Todos os procedimentos da rede — o teste pode ter criado outros além do padrão.
      await db.from('procedures').delete().eq('tenant_id', t!.id)
      // Os modelos de documento: o procedimento aponta para eles, e a versão para o modelo.
      await db.from('document_template_versions').delete().eq('tenant_id', t!.id)
      await db.from('document_templates').delete().eq('tenant_id', t!.id)
      await db.from('branches').delete().eq('id', b!.id)
      await db.from('role_permissions').delete().eq('tenant_id', t!.id)
      await db.from('tenant_roles').delete().eq('tenant_id', t!.id)
      await db.from('domain_events').delete().eq('tenant_id', t!.id)
      await db.from('loyalty_configs').delete().eq('tenant_id', t!.id)
      // Rede que não sai é, quase sempre, unidade que o teste criou nela e ainda
      // não apagou: quem criou apaga, e apaga a rede de novo depois.
      const { error: eRede } = await db.from('tenants').delete().eq('id', t!.id)
      if (eRede) console.warn(`[e2e] outra rede: a rede ficou (${eRede.message}) — ainda há algo dela no banco`)
    },
  }
  return rede
}
