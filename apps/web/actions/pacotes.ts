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
import { sessoesDoPacote } from '@/lib/pacotes/rateio'
import { itensParaRateio } from '@/lib/pacotes/leitura'

type Resultado = { error?: string; ok?: true }

/** Um pacote é um conjunto de procedimentos, iguais ou não (decisão do Heitor). */
const EntradaDoPacote = z.object({
  id:            z.string().uuid().optional(),
  name:          z.string().trim().min(2, 'Dê um nome ao pacote.').max(120),
  itens:         z.array(z.object({
    procedure_id: z.string().uuid('Escolha o procedimento.'),
    quantity:     z.number().int().min(1, 'Cada procedimento entra pelo menos uma vez.').max(100),
  })).min(1, 'Adicione pelo menos um procedimento ao pacote.').max(30),
  price:         z.number().min(0).max(1_000_000),
  validity_days: z.number().int().min(1).max(3650).nullable(),
  is_active:     z.boolean(),
}).refine(p => p.itens.reduce((s, i) => s + i.quantity, 0) >= 2, 'Um pacote tem pelo menos 2 sessões.')
  .refine(p => p.itens.reduce((s, i) => s + i.quantity, 0) <= 100, 'No máximo 100 sessões num pacote.')

/** Catálogo da REDE: procedimento e configuração são dados da rede (§ Decisões). */
export async function salvarPacote(entrada: unknown): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'procedures', 'MANAGE')
    if (ctx.branchId !== null) return { error: 'O catálogo de pacotes é da rede: quem muda é quem administra a rede.' }
    const lido = EntradaDoPacote.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    const p = lido.data

    // O mesmo procedimento em duas linhas vira uma só, somada.
    const porProcedimento = new Map<string, number>()
    for (const i of p.itens) porProcedimento.set(i.procedure_id, (porProcedimento.get(i.procedure_id) ?? 0) + i.quantity)
    const itens = [...porProcedimento].map(([procedure_id, quantity]) => ({ procedure_id, quantity }))

    // Pacote e itens numa transação; o banco confere que os procedimentos são
    // da rede. Vendido já tem o retrato (preço, sessões e procedimento de cada
    // uma): mudar o catálogo vale para as próximas vendas.
    await gravar(createAdminClient().rpc('pacote_salvar', {
      p_tenant: ctx.tenantId!, p_id: p.id ?? null, p_nome: p.name, p_preco: Math.round(p.price * 100) / 100,
      p_validade: p.validity_days, p_ativo: p.is_active, p_itens: itens,
    }), 'salvar o pacote')
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
    // Cada sessão com o seu procedimento e a sua parte do preço (rateio pelo
    // preço de tabela): é a base da comissão dela. O banco confere a soma.
    const sessoes = sessoesDoPacote(await itensParaRateio(ctx.tenantId!, pacoteId), Number(pacote.price))
    const clientPackageId = await gravar(admin.rpc('pacote_vender', {
      p_tenant: ctx.tenantId!, p_cliente: clienteId, p_pacote: pacoteId, p_unidade: branchId,
      p_ator: ctx.internalUserId ?? null, p_lancamentos: lancamentos, p_sessoes: sessoes,
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
