'use server'

import { enderecoComNumero } from '@/lib/unidades/endereco-com-numero'
import { conferirLimite, limiteDoPlano } from '@estetica-os/nucleo/lib/planos/limites'
import { lerHorarioDoForm } from '@/lib/agenda/horario'
import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertPermission, assertUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { semAcesso } from '@/lib/sem-acesso'
import { bloqueioDoSuporte } from '@/lib/suporte/travas'
import { slugDoTexto, candidatosDeEndereco, escolherEndereco } from '@/lib/unidades/endereco'
import { maskCPF, maskCNPJ } from '@estetica-os/utils'
import { umaVez, chaveDoEnvio } from '@/lib/envio-unico'
import { FUSOS } from '@/lib/unidades/fuso'

/**
 * O fuso do formulário (F62): sem o campo, nada muda (undefined); fora da
 * lista, é impossível — recusado.
 */
function lerFusoDoForm(formData: FormData): string | undefined | { erro: string } {
  const v = formData.get('fuso')
  if (typeof v !== 'string' || !v) return undefined
  return FUSOS.some(f => f.valor === v) ? v : { erro: 'Fuso horário inválido.' }
}

/**
 * A unidade nova SEM CNPJ pergunta antes (cfg-01, revisão do Heitor de
 * 2026-11-02: "se em branco, avisa e confirma decisão. Talvez uma clínica
 * possa ter 2 unidades físicas operando no mesmo CNPJ. Uma unidade física não
 * precisa necessariamente de um novo CNPJ. Flexibilidade é a palavra").
 * Nada se grava; a tela mostra o aviso com o CNPJ da rede para usar
 * (`cnpjDaRede`, já formatado; nulo se a rede não tem) e "Criar sem CNPJ".
 */
export type RespostaDeCriarUnidade =
  | { error: string }
  | { success: boolean }
  | { perguntaCnpj: { cnpjDaRede: string | null } }

/** A resposta da pessoa ao "sem CNPJ": `rede` usa o da rede, `sem` cria sem. */
const RESPOSTAS_DO_CNPJ = ['rede', 'sem'] as const

function documentoLegivel(doc: string | null): string | null {
  if (!doc) return null
  const d = doc.replace(/\D/g, '')
  return d.length === 14 ? maskCNPJ(d) : d.length === 11 ? maskCPF(d) : doc
}

export async function createBranch(
  _prev: RespostaDeCriarUnidade | undefined,
  formData: FormData,
): Promise<RespostaDeCriarUnidade> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  // Abrir unidade nova é decisão da REDE, não de quem tem unidade fixa (§11).
  if (ctx.branchId !== null) throw semAcesso()

  const name     = (formData.get('name') as string)?.trim()
  const slugRaw  = (formData.get('slug') as string)?.trim()
  // O CNPJ NUNCA vem da rede calado (cfg-01): vazio (ou sem o campo) pergunta,
  // e só a resposta (`_cnpj`) decide — o da rede ou nenhum. Duas unidades
  // com o mesmo CNPJ podem existir.
  const documentoDoForm = (formData.get('document') as string | null)?.trim() || null
  const respostaDoCnpj = RESPOSTAS_DO_CNPJ.find(r => r === formData.get('_cnpj')) ?? null
  const stateRegistration = (formData.get('state_registration') as string)?.trim() || null
  const email    = (formData.get('email') as string)?.trim().toLowerCase() || null
  const phone    = (formData.get('phone') as string)?.trim() || null
  // O número entra no endereço, depois do logradouro (A7 da 9ª).
  const address  = enderecoComNumero(formData.get('address') as string | null, formData.get('address_number') as string | null)
  const city     = (formData.get('city') as string)?.trim() || null
  const state    = (formData.get('state') as string)?.trim().toUpperCase() || null
  const zipCode  = (formData.get('zip_code') as string)?.trim() || null
  // O horário de funcionamento (o setup pergunta; a criação avulsa não manda = o padrão).
  const horarioLido = lerHorarioDoForm(formData)
  if (horarioLido && 'erro' in horarioLido) return { error: horarioLido.erro }
  const horario = horarioLido ?? undefined
  const fuso = lerFusoDoForm(formData)
  if (typeof fuso === 'object') return { error: fuso.erro }

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
  const rede = await ler(supabase.from('tenants').select('name, document').eq('id', ctx.tenantId!).single(), 'buscar a rede')
  const nomeDaClinica = (rede?.name as string | undefined) ?? ''
  const documentoDaRede = documentoLegivel((rede?.document as string | null) ?? null)
  if (!documentoDoForm && !respostaDoCnpj) return { perguntaCnpj: { cnpjDaRede: documentoDaRede } }
  const document = documentoDoForm ?? (respostaDoCnpj === 'rede' ? documentoDaRede : null)

  // O mesmo envio (duplo clique) cria UMA unidade (D10, `lib/envio-unico.ts`).
  return umaVez(ctx.tenantId!, 'createBranch', chaveDoEnvio(formData),
    () => inserirUnidade(ctx.tenantId!, base, nomeDaClinica, {
      name, document, state_registration: stateRegistration, email, phone, address, city, state, zip_code: zipCode,
      ...(horario ? { horario } : {}),
      ...(fuso ? { fuso } : {}),
    }),
    { gravou: r => 'success' in r })
}

/** Grava a unidade com um endereço livre (lib/unidades/endereco.ts). */
async function inserirUnidade(
  tenantId: string, base: string, nomeDaClinica: string, campos: Record<string, unknown>,
): Promise<RespostaDeCriarUnidade> {
  const supabase = createAdminClient()
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const candidatos = candidatosDeEndereco(base, nomeDaClinica)
    const ocupados = await ler(supabase.from('branches').select('slug').in('slug', candidatos), 'conferir os endereços') as { slug: string }[] | null
    const slug = escolherEndereco(base, nomeDaClinica, new Set((ocupados ?? []).map(o => o.slug)))
    if (!slug) return { error: 'Não achei um endereço livre para esta unidade. Tente outro nome.' }

    const { error: insertError } = await supabase.from('branches').insert({ tenant_id: tenantId, slug, ...campos })
    if (insertError?.code === '23505') continue
    if (insertError) return { error: 'Erro ao criar unidade. Tente novamente.' }

    revalidatePath('/admin/branches')
    revalidateTag(`branches:${tenantId}`, { expire: 0 })
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
  // O Número à parte, como na unidade nova (D9 da 13ª, F70); sem o campo, o endereço como veio.
  const address           = formData.has('address_number')
    ? enderecoComNumero(formData.get('address') as string | null, formData.get('address_number') as string | null)
    : (formData.get('address') as string)?.trim() || null
  const city              = (formData.get('city') as string)?.trim() || null
  const state             = (formData.get('state') as string)?.trim().toUpperCase() || null
  const zipCode           = (formData.get('zip_code') as string)?.trim() || null
  // O horário de funcionamento (2026-10-21): vazio = sem cadastro (o padrão).
  const horarioLido = lerHorarioDoForm(formData)
  if (horarioLido && 'erro' in horarioLido) return { error: horarioLido.erro }
  const horario = horarioLido
  const fuso = lerFusoDoForm(formData)
  if (typeof fuso === 'object') return { error: fuso.erro }

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
      ...(horario !== undefined ? { horario } : {}),
      ...(fuso ? { fuso } : {}),
    })
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)

  if (updateError) return { error: 'Erro ao salvar. Tente novamente.' }

  revalidatePath('/admin/branches')
  revalidatePath(`/admin/branches/${branchId}`)
  // A aba Unidade do portal da unidade (H7): é por ela que a gerente edita a dela.
  revalidatePath('/[slug]/settings', 'page')
  revalidateTag(`branches:${ctx.tenantId!}`, { expire: 0 })
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
  revalidateTag(`branches:${ctx.tenantId!}`, { expire: 0 })
}

/**
 * Muda a equipe FIXA de uma unidade para outra (C67 do levantamento das
 * regras, F70; H6 = a): é o que a janela de desativar oferece antes de tirar a
 * unidade do ar. Só quem é da rede, com Configurações e Equipe em Gerenciar.
 * Move a abrangência (a unidade de quem entra só nela) e reemite os claims; o
 * "Atende" de cada pessoa não muda (é uma decisão por pessoa, em Equipe).
 */
export async function moverEquipeDaUnidade(
  origemId: string, destinoId: string,
): Promise<{ error: string } | { ok: true; movidos: number }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  assertPermission(ctx, 'team', 'MANAGE')
  if (ctx.branchId !== null) return { error: 'Mudar a equipe de unidade é de quem é da rede.' }
  const travado = bloqueioDoSuporte(ctx, 'mudar a equipe de unidade')
  if (travado) return { error: travado }
  if (!origemId || !destinoId || origemId === destinoId) return { error: 'Escolha outra unidade.' }

  const admin = createAdminClient()
  const unidades = await ler(admin.from('branches').select('id, is_active')
    .eq('tenant_id', ctx.tenantId!).in('id', [origemId, destinoId]), 'conferir as unidades') as { id: string; is_active: boolean }[] | null
  const destino = (unidades ?? []).find(u => u.id === destinoId)
  if (!(unidades ?? []).some(u => u.id === origemId) || !destino) return { error: 'Unidade não encontrada.' }
  if (!destino.is_active) return { error: 'A unidade escolhida está desativada.' }

  const fixos = await ler(admin.from('users').select('id, auth_id, role_id')
    .eq('tenant_id', ctx.tenantId!).eq('branch_id', origemId).eq('is_active', true), 'carregar a equipe da unidade') as
    { id: string; auth_id: string | null; role_id: string | null }[] | null
  for (const m of fixos ?? []) {
    await gravar(admin.from('users').update({ branch_id: destinoId })
      .eq('id', m.id).eq('tenant_id', ctx.tenantId!).eq('branch_id', origemId), 'mudar a pessoa de unidade')
    if (m.auth_id) {
      await gravar(admin.rpc('set_user_claims', {
        p_auth_id: m.auth_id, p_tenant_id: ctx.tenantId!, p_branch_id: destinoId, p_role_id: m.role_id,
      }), 'atualizar o acesso da pessoa')
      revalidateTag(`user:${m.auth_id}`, { expire: 0 })
    }
  }
  revalidateTag(`professionals:${ctx.tenantId!}`, { expire: 0 })
  revalidatePath('/admin/team')
  revalidatePath('/admin/settings')
  return { ok: true, movidos: (fixos ?? []).length }
}
