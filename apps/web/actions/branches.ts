'use server'

import { conferirLimite, limiteDoPlano } from '@estetica-os/nucleo/lib/planos/limites'
import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertPermission, assertUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { semAcesso } from '@/lib/sem-acesso'
import { slugDoTexto, candidatosDeEndereco, escolherEndereco } from '@/lib/unidades/endereco'

export async function createBranch(
  _prev: { error: string } | { success: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  // Abrir unidade nova é decisão da REDE, não de quem tem unidade fixa (§11).
  if (ctx.branchId !== null) throw semAcesso()

  const name     = (formData.get('name') as string)?.trim()
  const slugRaw  = (formData.get('slug') as string)?.trim()
  const document = (formData.get('document') as string)?.trim() || null
  const email    = (formData.get('email') as string)?.trim().toLowerCase() || null
  const phone    = (formData.get('phone') as string)?.trim() || null
  const address  = (formData.get('address') as string)?.trim() || null
  const city     = (formData.get('city') as string)?.trim() || null
  const state    = (formData.get('state') as string)?.trim().toUpperCase() || null
  const zipCode  = (formData.get('zip_code') as string)?.trim() || null

  if (!name) return { error: 'Nome é obrigatório.' }
  // O LIMITE de unidades do plano da rede (lib/planos/limites.ts).
  const limite = await conferirLimite(ctx.tenantId!, 'unidades')
  if (limite) return { error: limite }

  const base = slugDoTexto(slugRaw || name)
  if (!base) return { error: 'Endereço inválido.' }

  const supabase = createAdminClient()

  // O endereço é ÚNICO no sistema inteiro (lib/unidades/endereco.ts): o nome;
  // ocupado — por outra clínica ou por uma rota do sistema —, o nome com a
  // clínica no fim; depois, numerado. Sem erro na tela. Dois cadastros ao mesmo
  // tempo batem no índice (23505): procura de novo.
  const rede = await ler(supabase.from('tenants').select('name').eq('id', ctx.tenantId!).single(), 'buscar a rede')
  const nomeDaClinica = (rede?.name as string | undefined) ?? ''
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const candidatos = candidatosDeEndereco(base, nomeDaClinica)
    const ocupados = await ler(supabase.from('branches').select('slug').in('slug', candidatos), 'conferir os endereços') as { slug: string }[] | null
    const slug = escolherEndereco(base, nomeDaClinica, new Set((ocupados ?? []).map(o => o.slug)))
    if (!slug) return { error: 'Não achei um endereço livre para esta unidade. Tente outro nome.' }

    const { error: insertError } = await supabase.from('branches').insert({
      tenant_id: ctx.tenantId!,
      name,
      slug,
      document,
      email,
      phone,
      address,
      city,
      state,
      zip_code: zipCode,
    })
    if (insertError?.code === '23505') continue
    if (insertError) return { error: 'Erro ao criar unidade. Tente novamente.' }

    revalidatePath('/admin/branches')
    revalidateTag(`branches:${ctx.tenantId!}`, 'max')
    return { success: true }
  }
  return { error: 'Erro ao criar unidade. Tente novamente.' }
}

export async function updateBranch(
  branchId: string,
  _prev: { error: string } | { success: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const name              = (formData.get('name') as string)?.trim()
  const document          = (formData.get('document') as string)?.trim() || null
  const stateRegistration = (formData.get('state_registration') as string)?.trim() || null
  const email             = (formData.get('email') as string)?.trim().toLowerCase() || null
  const phone             = (formData.get('phone') as string)?.trim() || null
  const address           = (formData.get('address') as string)?.trim() || null
  const city              = (formData.get('city') as string)?.trim() || null
  const state             = (formData.get('state') as string)?.trim().toUpperCase() || null
  const zipCode           = (formData.get('zip_code') as string)?.trim() || null

  if (!name) return { error: 'Nome é obrigatório.' }
  // Quem tem unidade fixa edita a dela; a da rede, todas (§11). Até 2026-09-28
  // a gerente da unidade A reescrevia os dados da B.
  assertUnidade(ctx, branchId)

  const supabase = createAdminClient()

  const { error: updateError } = await supabase
    .from('branches')
    .update({
      name,
      document,
      state_registration: stateRegistration,
      email,
      phone,
      address,
      city,
      state,
      zip_code: zipCode,
    })
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)

  if (updateError) return { error: 'Erro ao salvar. Tente novamente.' }

  revalidatePath('/admin/branches')
  revalidatePath(`/admin/branches/${branchId}`)
  revalidateTag(`branches:${ctx.tenantId!}`, 'max')
  return { success: true }
}

export async function toggleBranchStatus(branchId: string, isActive: boolean) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  // Desativar uma unidade tira a agenda dela do ar: decisão da REDE (§11). A
  // gerente da A desativava a B.
  if (ctx.branchId !== null) throw semAcesso()

  const supabase = createAdminClient()
  // Reativar conta para o LIMITE de unidades do plano (lib/planos/limites.ts).
  if (isActive) {
    const atual = await ler(supabase.from('branches').select('is_active').eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
    if (atual && !atual.is_active) {
      const limite = await conferirLimite(ctx.tenantId!, 'unidades')
      if (limite) throw limiteDoPlano(limite)
    }
  }
  await gravar(supabase
    .from('branches')
    .update({ is_active: isActive })
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!), 'salvar a unidade')

  revalidatePath('/admin/branches')
  revalidatePath(`/admin/branches/${branchId}`)
  revalidateTag(`branches:${ctx.tenantId!}`, 'max')
}
