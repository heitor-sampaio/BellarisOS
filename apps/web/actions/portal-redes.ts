'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getTenantContext, assertClient } from '@/lib/auth'
import { getCachedFichasDoLogin } from '@/lib/cached-queries'
import { registrarEntradaNoPortal } from '@/lib/clientes/destino'
import { registrarEntradaNaAuditoriaDaFicha } from '@/lib/clientes/entrada-na-auditoria'
import { redeAbreParaCliente } from '@/lib/clientes/disponibilidade'

/**
 * A cliente escolhe a clínica no seletor (`/auth/clinicas`, 2026-10-19).
 *
 * Só entre as fichas DELA (as do login da sessão): um id de outra pessoa não é
 * achado e nada muda. Anota a entrada (é a "última clínica usada" do próximo
 * login) e leva ao portal — o endereço da unidade é único, e decide a ficha.
 */
export async function entrarNaRede(clientId: unknown): Promise<{ error: string }> {
  const ctx = await getTenantContext()
  assertClient(ctx)
  const id = z.string().uuid().safeParse(clientId)
  const ficha = id.success ? (await getCachedFichasDoLogin(ctx.userId)).find(f => f.clientId === id.data) : undefined
  if (!ficha?.slug) return { error: 'Rede não encontrada.' }
  if (!(await redeAbreParaCliente(ficha.tenantId))) return { error: 'Esta rede está indisponível no momento.' }

  await registrarEntradaNoPortal(ficha.clientId, { escolheuAgora: true })
  // A entrada na Auditoria, na rede escolhida (AD-04; com o seletor o login não a registrou).
  await registrarEntradaNaAuditoriaDaFicha(ficha.clientId)
  redirect(`/${ficha.slug}/cliente`)
}
