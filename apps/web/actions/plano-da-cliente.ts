'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, mensagemDoErro } from '@/lib/db'
import { ehUuid } from '@/lib/id-da-rota'
import { clienteArquivadaNoApp } from '@/lib/clients/arquivada'
import { falaDaRedeDoId } from '@/lib/clientes/nome-da-rede'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'
import { bloqueioDoSuporte } from '@/lib/suporte/travas'
import { emitirEventoDePlano } from '@/lib/events/plano'
import { EVENTOS } from '@estetica-os/types'
import { interessadosNoFato } from '@/lib/notifications/interessados'
import { notifyUser } from '@/lib/notifications/notify'
import { avisoDoPlanoAceitoPeloApp } from '@/lib/plano-de-tratamento/textos'
import { combinadoDoPlano, totalComOCombinado } from '@/lib/plano-de-tratamento/desconto-combinado'
import { RECUSA_DO_PLANO_CANCELADO_NO_APP } from '@/lib/plano-de-tratamento/cancelar-proposto'

/**
 * O aceite do plano PELO APP (PT1b, a revisão do Heitor de 2026-11-13: "a
 * cliente recebe o plano no app, analisa e aceita"). O mesmo aceite da
 * equipe (`plano_aceitar`): o plano vira aceito, os termos e os outros
 * documentos ficam prontos (o contrato de plano não — ele nasce no PDV, com a
 * forma de pagamento), o desconto combinado no editor se aplica aos preços
 * (22ª A20) e a comanda do plano nasce no PDV com o valor do plano.
 * Sem pergunta de dinheiro.
 *
 * A cliente só aceita o plano DELA (a ficha da rede do endereço,
 * `ctx.clientId`), e só o PROPOSTO — o rascunho é da equipe; o vencido, a tela
 * avisa e aceita (a validade é só informação). Quem é avisado é quem
 * responde pelo que vem a seguir, pela PERMISSÃO: quem agenda (Agenda em
 * Gerenciar), quem recebe (o PDV em Gerenciar, PV-04 — e o Financeiro em Gerenciar, que
 * cuida do dinheiro), na unidade do
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
    // CA1: as recusas dizem o nome da rede da ficha.
    const fala = await falaDaRedeDoId(cliente.tenant_id)
    if (cliente.is_active === false) return { error: clienteArquivadaNoApp(fala) }

    const plano = await ler(admin.from('treatment_plans')
      .select('id, status, created_at, branch_id, professional_id, desconto_combinado_tipo, desconto_combinado_valor, branches!inner(tenant_id, slug), treatment_plan_sessions(treatment_plan_session_procedures(price))')
      .eq('id', planId).eq('client_id', ctx.clientId!).eq('branches.tenant_id', cliente.tenant_id)
      .maybeSingle(), 'buscar o plano') as {
        id: string; status: string; created_at: string; branch_id: string; professional_id: string | null
        desconto_combinado_tipo: string | null; desconto_combinado_valor: number | string | null
        branches: { tenant_id: string; slug: string }
        treatment_plan_sessions: { treatment_plan_session_procedures: { price: number | null }[] }[]
      } | null
    if (!plano) return { error: 'Plano não encontrado.' }
    if (plano.status === 'ACCEPTED' || plano.status === 'COMPLETED') return { error: 'Este plano já foi aceito.' }
    // A1a da 25ª: o plano que a unidade cancelou (com a página aberta no app) recusa com a frase clara.
    if (plano.status === 'CANCELLED' || plano.status === 'REJECTED') return { error: `${RECUSA_DO_PLANO_CANCELADO_NO_APP} ${fala.FaleCom} se quiser retomar o tratamento.` }
    if (plano.status !== 'PROPOSED') return { error: 'Plano não encontrado.' }
    if (!(await redeTemRecurso(cliente.tenant_id, 'planos_de_tratamento'))) return { error: 'Plano não encontrado.' }

    // A validade da proposta é só informação (decisão do Claude pelo princípio 2,
    // 2026-11-18): o app avisa do plano vencido e aceita, como o checkout na unidade.

    const { error } = await admin.rpc('plano_aceitar', { p_tenant: cliente.tenant_id, p_plano: planId })
    if (error) return { error: error.message }

    await emitirEventoDePlano(EVENTOS.PLANO_ACEITO, planId, { tenantId: cliente.tenant_id },
      { ator: { tipo: 'cliente', id: ctx.clientId!, nome: cliente.name }, origem: 'app' })

    const sessoes = plano.treatment_plan_sessions ?? []
    // O valor com o desconto combinado (22ª A20): o que o aceite acabou de aplicar.
    const total = totalComOCombinado(sessoes.reduce((t, s) => t + (s.treatment_plan_session_procedures ?? [])
      .reduce((x, p) => x + Math.round(Number(p.price ?? 0) * 100), 0), 0) / 100, combinadoDoPlano(plano)).total
    after(async () => {
      try {
        const admin = createAdminClient()
        const listas = await Promise.all((['agenda', 'cashier', 'financial'] as const).map(modulo =>
          interessadosNoFato(admin, { modulo, branchId: plano.branch_id, envolvidos: [plano.professional_id] })))
        const ids = [...new Set(listas.flat())]
        // A4 da 35ª: a frase do PDV só a quem recebe (o PDV em Gerenciar, sem o envolvido).
        const recebem = new Set(await interessadosNoFato(admin, { modulo: 'cashier', branchId: plano.branch_id }))
        await Promise.allSettled(ids.map(id => notifyUser(admin, id, {
          type: 'plano_aceito',
          title: 'Plano aceito pelo app',
          body: avisoDoPlanoAceitoPeloApp({ nome: cliente.name, sessoes: sessoes.length, total, recebe: recebem.has(id) }),
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
