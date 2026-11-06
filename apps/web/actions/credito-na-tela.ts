'use server'

/**
 * O saldo do crédito na clínica da cliente, para a tela de cobrança dizer
 * antes (A36 da 8ª simulação). Endpoint público: quem RECEBE (o caixa ou o
 * financeiro em Gerenciar), e a ficha da rede da sessão.
 */

import { getTenantContext, podeReceber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, mensagemDoErro } from '@/lib/db'
import { getCreditoInternoDoCliente } from '@/lib/metrics/unidade'

const UUID = /^[0-9a-f-]{36}$/i

export async function saldoDoCreditoDaCliente(clienteId: string): Promise<{ saldo?: number; error?: string }> {
  try {
    const ctx = await getTenantContext()
    if (!podeReceber(ctx)) return { error: 'Seu cargo não recebe pagamentos.' }
    if (typeof clienteId !== 'string' || !UUID.test(clienteId)) return { error: 'Cliente não encontrada.' }
    const ficha = await ler(createAdminClient().from('clients').select('id')
      .eq('id', clienteId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a cliente')
    if (!ficha) return { error: 'Cliente não encontrada.' }
    return { saldo: await getCreditoInternoDoCliente(ctx.tenantId!, clienteId) }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
