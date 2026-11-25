import { notFound } from 'next/navigation'
import { getTenantContext, podeReceber, podeVerFechamento, alcancaUnidade } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { Pdv } from '@/app/_shared/pdv'
import { FechamentoDoDia } from '@/app/_shared/fechamento-do-dia'

/**
 * O PDV, no portal da unidade (PDV1): de quem recebe — o PDV em Gerenciar
 * (PV-04). Com `?fechar=1`, o Fechamento do dia dentro dele (CX4): quem
 * recebe fecha; o Financeiro de todos em Ver também vê, sem fechar (D6).
 */
export default async function PdvDaUnidadePage({ params, searchParams }: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ ver?: string; comanda?: string; nova?: string; cliente?: string; recebida?: string; fechar?: string; dia?: string }>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()
  const sp = await searchParams
  const fechar = sp.fechar === '1'
  if (fechar ? !podeVerFechamento(ctx) : !podeReceber(ctx)) throw semAcesso()

  const unidade = await ler(createAdminClient().from('branches').select('id, name, is_active')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
  if (!unidade || !alcancaUnidade(ctx, unidade.id as string)) notFound()
  // D4 da 30ª (UN-14): a desativada recebe o que ficou, mas não vende.
  const unidades = [{ id: unidade.id as string, name: unidade.name as string, ativa: unidade.is_active !== false }]

  if (fechar) {
    return <FechamentoDoDia ctx={ctx} unidades={unidades} unidadeId={unidade.id as string} diaPedido={sp.dia} basePath={`/${slug}/pdv`} />
  }
  return (
    <Pdv ctx={ctx} unidades={unidades}
      unidadeId={unidade.id as string} slugDaUnidade={slug} basePath={`/${slug}/pdv`}
      ver={sp.ver} comandaId={sp.comanda} nova={sp.nova} clienteId={sp.cliente} recebidaId={sp.recebida} />
  )
}
