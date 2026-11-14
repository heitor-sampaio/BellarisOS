'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, mensagemDoErro } from '@/lib/db'
import { ehUuid } from '@/lib/id-da-rota'
import { CLIENTE_ARQUIVADA_NO_APP } from '@/lib/clients/arquivada'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'
import { bloqueioDoSuporte } from '@/lib/suporte/travas'
import { emitirEventoDePlano } from '@/lib/events/plano'
import { EVENTOS } from '@estetica-os/types'
import { interessadosNoFato } from '@/lib/notifications/interessados'
import { notifyUser } from '@/lib/notifications/notify'
import { formatBRL } from '@estetica-os/utils'
import { propostaVencida } from '@/lib/plano-de-tratamento/validade'

/**
 * O aceite do plano PELO APP (PT1b, a revisão do Heitor de 2026-11-13: "a
 * cliente recebe o plano no app, analisa e aceita"). O mesmo aceite da
 * equipe (`plano_aceitar`): o plano vira aceito, os termos e os outros
 * documentos ficam prontos (o contrato de plano não — ele nasce no PDV, com a
 * forma de pagamento) e a comanda do plano nasce no PDV com o valor inteiro.
 * Sem pergunta de dinheiro.
 *
 * A cliente só aceita o plano DELA (a ficha da rede do endereço,
 * `ctx.clientId`), e só o PROPOSTO dentro da validade — o rascunho é da
 * equipe, e o vencido a tela manda falar com a rede. Quem é avisado é quem
 * responde pelo que vem a seguir, pela PERMISSÃO: quem agenda (Agenda em
 * Gerenciar), quem recebe (Caixa ou Financeiro em Gerenciar), na unidade do
 * plano ou na rede inteira, e quem atende o plano.
 */
export async function aceitarPlanoPelaCliente(planId: string): Promise<{ error?: string; ok?: true }> {
  try {
    const ctx = await getTenantContext()
    assertClient(ctx)
    const travado = bloqueioDoSuporte(ctx, 'aceitar um plano pela cliente')
    if (travado) return { error: travado }
    if (!ehUuid(planId)) return { error: 'Plano não encontrado.' }
    const admin = createAdminClient()

    const cliente = await ler(admin.from('clients').select('tenant_id, is_active, name')
      .eq('id', ctx.clientId!).maybeSingle(), 'buscar o cadastro') as { tenant_id: string; is_active: boolean | null; name: string | null } | null
    if (!cliente) return { error: 'Cadastro não encontrado.' }
    if (cliente.is_active === false) return { error: CLIENTE_ARQUIVADA_NO_APP }

    const plano = await ler(admin.from('treatment_plans')
      .select('id, status, created_at, branch_id, professional_id, branches!inner(tenant_id, slug), treatment_plan_sessions(treatment_plan_session_procedures(price))')
      .eq('id', planId).eq('client_id', ctx.clientId!).eq('branches.tenant_id', cliente.tenant_id)
      .maybeSingle(), 'buscar o plano') as {
        id: string; status: string; created_at: string; branch_id: string; professional_id: string | null
        branches: { tenant_id: string; slug: string }
        treatment_plan_sessions: { treatment_plan_session_procedures: { price: number | null }[] }[]
      } | null
    if (!plano) return { error: 'Plano não encontrado.' }
    if (plano.status === 'ACCEPTED' || plano.status === 'COMPLETED') return { error: 'Este plano já foi aceito.' }
    if (plano.status !== 'PROPOSED') return { error: 'Plano não encontrado.' }
    if (!(await redeTemRecurso(cliente.tenant_id, 'planos_de_tratamento'))) return { error: 'Plano não encontrado.' }

    const validade = await ler(admin.from('tenants').select('plano_validade_dias').eq('id', cliente.tenant_id).maybeSingle(),
      'ler a validade do plano proposto') as { plano_validade_dias: number | null } | null
    if (propostaVencida(plano.created_at, validade?.plano_validade_dias ?? 30)) {
      return { error: 'Esta proposta venceu. Fale com a equipe para atualizar o plano.' }
    }

    const { error } = await admin.rpc('plano_aceitar', { p_tenant: cliente.tenant_id, p_plano: planId })
    if (error) return { error: error.message }

    await emitirEventoDePlano(EVENTOS.PLANO_ACEITO, planId, { tenantId: cliente.tenant_id },
      { ator: { tipo: 'cliente', id: ctx.clientId!, nome: cliente.name }, origem: 'app' })

    const sessoes = plano.treatment_plan_sessions ?? []
    const total = sessoes.reduce((t, s) => t + (s.treatment_plan_session_procedures ?? [])
      .reduce((x, p) => x + Math.round(Number(p.price ?? 0) * 100), 0), 0) / 100
    after(async () => {
      try {
        const admin = createAdminClient()
        const listas = await Promise.all((['agenda', 'cashier', 'financial'] as const).map(modulo =>
          interessadosNoFato(admin, { modulo, branchId: plano.branch_id, envolvidos: [plano.professional_id] })))
        const ids = [...new Set(listas.flat())]
        await Promise.allSettled(ids.map(id => notifyUser(admin, id, {
          type: 'plano_aceito',
          title: 'Plano aceito pelo app',
          body: `${cliente.name ?? 'A cliente'} aceitou o plano de tratamento (${sessoes.length} ${sessoes.length === 1 ? 'sessão' : 'sessões'}, ${formatBRL(total)}). A comanda está no PDV.`,
          data: { treatment_plan_id: planId },
        })))
      } catch (e) {
        console.error('[aceitarPlanoPelaCliente] aviso à equipe', e)
      }
    })

    const slug = plano.branches.slug
    revalidatePath(`/${slug}/pdv`)
    revalidatePath('/admin/pdv')
    revalidatePath(`/${slug}/planejamentos/${planId}`)
    revalidatePath(`/admin/planejamentos/${planId}`)
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
