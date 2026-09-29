'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { configDaRede } from '@/lib/fidelidade/leitura'
import { voucherEmitido } from '@/lib/events/fidelidade'

/**
 * Fidelidade — o que o CLIENTE faz pelo portal. Endpoint público como todo
 * export de 'use server': confere que a sessão é de cliente e usa só o
 * `clientId` da sessão — nunca um id que venha do navegador.
 *
 * A troca pelo portal é OPCIONAL da rede (`client_redeem`, desligada de
 * fábrica). Desligada, só a equipe troca, na ficha.
 */
export async function trocarPontosNoPortal(entrada: { slug: string; rewardId: string }): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  if (!ctx.isClient || !ctx.clientId) return { error: 'Sem acesso.' }
  if (typeof entrada?.slug !== 'string' || typeof entrada?.rewardId !== 'string') return { error: 'Dados inválidos.' }

  const admin = createAdminClient()
  const cliente = await ler(admin.from('clients').select('tenant_id').eq('id', ctx.clientId).maybeSingle(),
    'buscar o cliente') as { tenant_id: string | null } | null
  if (!cliente?.tenant_id) return { error: 'Sem acesso.' }

  const cfg = await configDaRede(cliente.tenant_id, admin)
  if (!cfg.enabled || !cfg.client_redeem) return { error: 'A troca pelo portal não está disponível. Fale com a recepção.' }

  // A unidade é a do portal em que o cliente está, procurada DENTRO da rede
  // dele (o slug não é único entre redes). Com abrangência por unidade, é o
  // saldo dela que paga a troca.
  const unidade = await ler(admin.from('branches').select('id')
    .eq('slug', entrada.slug).eq('tenant_id', cliente.tenant_id).eq('is_active', true).maybeSingle(),
    'buscar a unidade') as { id: string } | null
  if (!unidade) return { error: 'Unidade não encontrada.' }

  let voucherId: string
  try {
    voucherId = await gravar(admin.rpc('resgatar_recompensa', {
      p_tenant: cliente.tenant_id, p_cliente: ctx.clientId, p_recompensa: entrada.rewardId,
      p_unidade: unidade.id, p_ator: 'cliente',
    }), 'trocar os pontos pela recompensa') as string
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }

  await voucherEmitido(voucherId, { tenantId: cliente.tenant_id, ator: { tipo: 'cliente', id: ctx.clientId } })
  revalidatePath(`/${entrada.slug}/cliente/fidelidade`)
  return {}
}
