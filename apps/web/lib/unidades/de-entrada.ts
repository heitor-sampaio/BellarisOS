import 'server-only'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getCachedMember } from '@/lib/cached-queries'
import { COOKIE_DA_ULTIMA_UNIDADE, unidadesDoMembro } from '@/lib/unidades/do-membro'
import { escolherUnidadeDeEntrada } from '@/lib/unidades/desativada-no-endereco'

/**
 * A unidade em que a pessoa da EQUIPE entra (PO1 do Bloco Portais,
 * 2026-11-14): a ÚLTIMA usada (o cookie `bellaris-unidade`, que o seletor do
 * topo grava), se ainda é uma das DELA e está ativa; senão a principal
 * (`users.branch_id`). Devolve o slug; nulo quando não acha nenhuma.
 * D5 da 30ª: a principal desativada cede à primeira ATIVA das dela; sem
 * nenhuma ativa, a principal (o layout leva à tela da unidade desativada).
 *
 * O cookie não é confiável (o navegador o escreve): só escolhe ENTRE as
 * unidades da pessoa, lidas do banco. Quem tem uma unidade só vai à dela.
 */
export async function slugDaUnidadeDeEntrada(authId: string, principalDosClaims: string): Promise<string | null> {
  const membro = await getCachedMember(authId).catch(() => null)
  const minhas = (membro
    ? unidadesDoMembro({ branchId: membro.branchId, outrasUnidades: membro.outrasUnidades })
    : null) ?? [principalDosClaims]
  const principal = minhas[0] ?? principalDosClaims
  const linhas = (await ler(createAdminClient().from('branches').select('id, slug, is_active')
    .in('id', minhas.length ? minhas : [principal]), 'buscar as unidades de entrada')) ?? []
  let ultima: string | null = null
  if (minhas.length > 1) {
    try { ultima = decodeURIComponent((await cookies()).get(COOKIE_DA_ULTIMA_UNIDADE)?.value ?? '') || null } catch { ultima = null }
  }
  return escolherUnidadeDeEntrada({
    minhas: minhas.length ? minhas : [principal],
    linhas: linhas as { id: string; slug: string; is_active: boolean }[],
    ultima,
  })
}
