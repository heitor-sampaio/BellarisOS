'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTenantContext, can, alcancaOAgendamento } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { ehUuid } from '@/lib/id-da-rota'
import { clienteNoEscopo } from '@/lib/clientes/atendida-por'

const SEM_ACESSO = 'A anotação é prontuário: é preciso o Prontuário em Gerenciar — e, com "só os meus", ser cliente que você atende.'
const NAO_ENCONTRADO = 'Atendimento não encontrado.'

const Texto = z.string().trim().min(1, 'Escreva a anotação.').max(5000, 'A anotação tem no máximo 5.000 caracteres.')

/**
 * "Acrescentar anotação" (bloco Prontuário, PR2a — a revisão do Heitor,
 * 2026-11-13): no atendimento CONCLUÍDO, o que se escreve depois vira um
 * texto datado, com quem escreveu, que não se edita nem se apaga (o gatilho
 * do banco recusa). Pode quem tem o Prontuário em Gerenciar, com o alcance de
 * hoje: o atendimento da rede, numa unidade ao alcance (ou dela, onde só
 * atende) e, no "só os meus" do prontuário, de cliente que ela atende. O nome
 * é o do ctx — com a marca "via suporte".
 */
export async function acrescentarAnotacao(appointmentId: string, texto: string): Promise<{ error?: string; ok?: true }> {
  try {
    const ctx = await getTenantContext()
    if (!can(ctx, 'medical_records', 'MANAGE')) return { error: SEM_ACESSO }
    if (!ehUuid(appointmentId)) return { error: NAO_ENCONTRADO }
    const lido = Texto.safeParse(texto)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Escreva a anotação.' }

    const admin = createAdminClient()
    const ag = await ler(admin.from('appointments')
      .select('id, status, client_id, branch_id, professional_id, branches!inner(tenant_id, slug)')
      .eq('id', appointmentId).maybeSingle(), 'buscar o atendimento')
    const unidade = ag?.branches as unknown as { tenant_id: string; slug: string } | null
    if (!ag || unidade?.tenant_id !== ctx.tenantId || !alcancaOAgendamento(ctx, ag.branch_id as string, ag.professional_id as string | null)) {
      return { error: NAO_ENCONTRADO }
    }
    if (!(await clienteNoEscopo(admin, ctx, 'medical_records', ag.client_id as string))) return { error: SEM_ACESSO }
    if (ag.status !== 'COMPLETED') return { error: 'A anotação é do atendimento concluído. Antes de concluir, escreva na evolução.' }

    await gravar(admin.from('prontuario_anotacoes').insert({
      tenant_id: ctx.tenantId, client_id: ag.client_id, appointment_id: appointmentId,
      texto: lido.data, autor_id: ctx.internalUserId ?? null, autor_nome: ctx.userName || ctx.roleLabel || 'Alguém da equipe',
    }).select('id'), 'gravar a anotação do prontuário')

    revalidatePath(`/${unidade.slug}/agenda/${appointmentId}`)
    revalidatePath(`/admin/agenda/${appointmentId}`)
    revalidatePath(`/${unidade.slug}/clients/${ag.client_id}`)
    revalidatePath(`/admin/clients/${ag.client_id}`)
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
