'use server'

/**
 * Pacotes (decisão do Heitor, 2026-09-30): o catálogo, em Procedimentos, e a
 * venda, na ficha do cliente. Até aqui `service_packages` e `client_packages`
 * só existiam no banco de demonstração.
 *
 * Todo export é endpoint público: cada um confere permissão, rede e alcance.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTenantContext, assertPermission, alcancaUnidade, podeReceber } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { EntradaDoPagamento, lancamentosDoPagamento } from '@/lib/checkout/lancamentos'

type Resultado = { error?: string; ok?: true }

const EntradaDoPacote = z.object({
  id:             z.string().uuid().optional(),
  name:           z.string().trim().min(2, 'Dê um nome ao pacote.').max(120),
  procedure_id:   z.string().uuid('Escolha o procedimento.'),
  total_sessions: z.number().int().min(2, 'Um pacote tem pelo menos 2 sessões.').max(100),
  price:          z.number().min(0).max(1_000_000),
  validity_days:  z.number().int().min(1).max(3650).nullable(),
  is_active:      z.boolean(),
})

/** Catálogo da REDE: procedimento e configuração são dados da rede (§ Decisões). */
export async function salvarPacote(entrada: unknown): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'procedures', 'MANAGE')
    if (ctx.branchId !== null) return { error: 'O catálogo de pacotes é da rede: quem muda é quem administra a rede.' }
    const lido = EntradaDoPacote.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    const p = lido.data

    const admin = createAdminClient()
    const proc = await ler(admin.from('procedures').select('id')
      .eq('id', p.procedure_id).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o procedimento')
    if (!proc) return { error: 'Procedimento não encontrado.' }

    const campos = {
      name: p.name, procedure_id: p.procedure_id, total_sessions: p.total_sessions,
      price: Math.round(p.price * 100) / 100, validity_days: p.validity_days, is_active: p.is_active,
    }
    if (p.id) {
      // Vendido já tem o retrato do preço e das sessões (client_packages):
      // mudar o catálogo vale para as próximas vendas.
      await gravar(admin.from('service_packages').update(campos)
        .eq('id', p.id).eq('tenant_id', ctx.tenantId!).select('id').single(), 'salvar o pacote')
    } else {
      await gravar(admin.from('service_packages').insert({ ...campos, tenant_id: ctx.tenantId!, branch_id: null })
        .select('id').single(), 'criar o pacote')
    }
    revalidatePath('/admin/pacotes')
    revalidatePath('/[slug]/pacotes', 'page')
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * Vende um pacote ao cliente: o pacote do cliente (com o retrato do preço), as
 * sessões e o dinheiro, numa transação (`pacote_vender`). Quem recebe dinheiro
 * vende (caixa ou financeiro), como no plano.
 */
export async function venderPacote(
  clienteId: string, pacoteId: string, branchId: string, pagamento: unknown,
): Promise<{ error?: string; clientPackageId?: string }> {
  try {
    const ctx = await getTenantContext()
    if (!podeReceber(ctx)) throw semAcesso()
    const uuid = /^[0-9a-f-]{36}$/i
    if (![clienteId, pacoteId, branchId].every(v => typeof v === 'string' && uuid.test(v))) return { error: 'Dados inválidos.' }
    const lido = EntradaDoPagamento.safeParse(pagamento)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Pagamento inválido.' }

    const admin = createAdminClient()
    const [unidade, cliente, pacote] = await Promise.all([
      ler(admin.from('branches').select('id').eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade'),
      ler(admin.from('clients').select('id').eq('id', clienteId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente'),
      ler(admin.from('service_packages').select('id, name, price, is_active')
        .eq('id', pacoteId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o pacote'),
    ])
    if (!unidade || !alcancaUnidade(ctx, branchId)) return { error: 'Unidade não encontrada.' }
    if (!cliente) return { error: 'Cliente não encontrado.' }
    if (!pacote) return { error: 'Pacote não encontrado.' }
    if (!pacote.is_active) return { error: 'Este pacote está desativado.' }

    const lancamentos = lancamentosDoPagamento(Number(pacote.price), lido.data, `Pacote ${pacote.name as string}`)
    const clientPackageId = await gravar(admin.rpc('pacote_vender', {
      p_tenant: ctx.tenantId!, p_cliente: clienteId, p_pacote: pacoteId, p_unidade: branchId,
      p_ator: ctx.internalUserId ?? null, p_lancamentos: lancamentos,
    }), 'vender o pacote') as string

    revalidatePath('/admin/clients/[id]', 'page')
    revalidatePath('/[slug]/clients/[id]', 'page')
    revalidatePath('/admin/financeiro')
    revalidatePath('/[slug]/financeiro', 'page')
    return { clientPackageId }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
