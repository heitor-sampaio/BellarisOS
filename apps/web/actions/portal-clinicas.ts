'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getTenantContext, assertClient } from '@/lib/auth'
import { getCachedFichasDoLogin } from '@/lib/cached-queries'
import { registrarEntradaNoPortal } from '@/lib/clientes/destino'
import { COOKIE_DA_FICHA } from '@/lib/clientes/ficha-da-requisicao'

/**
 * A cliente escolhe a clínica no seletor (`/auth/clinicas`, 2026-10-19).
 *
 * Só entre as fichas DELA (as do login da sessão): um id de outra pessoa não é
 * achado e nada muda. Anota a entrada (é a "última clínica usada" do próximo
 * login) e guarda a escolha no cookie que desempata slug de unidade repetido
 * entre duas clínicas dela.
 */
export async function entrarNaClinica(clientId: unknown): Promise<{ error: string }> {
  const ctx = await getTenantContext()
  assertClient(ctx)
  const id = z.string().uuid().safeParse(clientId)
  const ficha = id.success ? (await getCachedFichasDoLogin(ctx.userId)).find(f => f.clientId === id.data) : undefined
  if (!ficha?.slug) return { error: 'Clínica não encontrada.' }

  await registrarEntradaNoPortal(ficha.clientId, { escolheuAgora: true })
  ;(await cookies()).set(COOKIE_DA_FICHA, ficha.clientId, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_DE_SESSAO_SEM_SECURE !== '1',
  })
  redirect(`/${ficha.slug}/cliente`)
}
