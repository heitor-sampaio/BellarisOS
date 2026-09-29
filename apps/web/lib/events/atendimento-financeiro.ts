import { createAdminClient } from '@/lib/supabase/admin'
import { emitirEvento, atorDoContexto, ATOR_SISTEMA } from './emitir'
import { EVENTOS } from '@estetica-os/types'
import type { DadosDePacote, DadosDeComissao } from '@estetica-os/types'
import { ler } from '@/lib/db'

type Ctx = { tenantId?: string | null; internalUserId?: string | null; userName?: string | null }

/**
 * Sessão de pacote consumida no atendimento.
 *
 * `restantes` é o campo que justifica o evento existir: **zero é o gatilho de
 * "acabou, hora de renovar"**, que é a automação comercial mais óbvia em cima
 * de pacote. Calcular isso no motor exigiria que ele conhecesse
 * `client_packages` e a diferença entre total e usadas.
 */
export async function emitirSessaoDePacoteUsada(
  clientPackageId: string,
  appointmentId: string,
  ctx: Ctx,
): Promise<void> {
  try {
    if (!ctx.tenantId) return
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('client_packages')
      .select(`
        id, branch_id, client_id, total_sessions, used_sessions,
        clients(name), service_packages(name)
      `)
      .eq('id', clientPackageId)
      .maybeSingle()

    if (error) console.error('[eventoDePacote] retrato:', error.message)

    const cli = data?.clients as unknown as { name?: string } | null
    const pac = data?.service_packages as unknown as { name?: string } | null

    const total = Number(data?.total_sessions ?? 0)
    const usadas = Number(data?.used_sessions ?? 0)

    const dados: DadosDePacote = {
      clienteId:     (data?.client_id as string) ?? null,
      clienteNome:   cli?.name ?? null,
      pacoteNome:    pac?.name ?? null,
      agendamentoId: appointmentId,
      restantes:     data ? Math.max(0, total - usadas) : null,
    }

    await emitirEvento(EVENTOS.PACOTE_SESSAO_USADA, {
      tenantId:   ctx.tenantId,
      branchId:   (data?.branch_id as string) ?? null,
      entidadeId: clientPackageId,
      dados,
      ator:       ctx.internalUserId ? atorDoContexto(ctx) : ATOR_SISTEMA,
      // A dedup é pelo ATENDIMENTO, não pelo pacote: o mesmo pacote gasta
      // várias sessões, e cada uma é um fato novo — mas concluir duas vezes o
      // mesmo atendimento não pode virar dois consumos.
      chave: `pacote.sessao_usada:${appointmentId}`,
    })
  } catch (e) {
    console.error('[eventoDePacote]', (e as Error).message)
  }
}

/**
 * Comissão gerada na conclusão do atendimento.
 *
 * Serve à automação que avisa o profissional do que ele ganhou no dia — e ao
 * fechamento de período, que é quando a clínica confere.
 */
export async function emitirComissaoGerada(
  appointmentId: string,
  linhaId: string,
  procedureId: string | null,
  professionalId: string | null,
  valor: number,
  periodo: string,
  branchId: string | null,
  ctx: Ctx,
): Promise<void> {
  try {
    if (!ctx.tenantId) return

    const admin = createAdminClient()
    const [prof, proc] = await Promise.all([
      professionalId ? ler(admin.from('users').select('name').eq('id', professionalId).maybeSingle(), 'buscar o usuário') : null,
      procedureId ? ler(admin.from('procedures').select('name').eq('id', procedureId).maybeSingle(), 'buscar o procedimento') : null,
    ])

    const dados: DadosDeComissao = {
      profissionalId:   professionalId,
      profissionalNome: (prof?.name as string | undefined) ?? null,
      agendamentoId:    appointmentId,
      linhaId,
      procedimentoNome: (proc?.name as string | undefined) ?? null,
      valor,
      periodo,
    }

    await emitirEvento(EVENTOS.COMISSAO_GERADA, {
      tenantId:   ctx.tenantId,
      branchId,
      entidadeId: appointmentId,
      dados,
      ator:       ctx.internalUserId ? atorDoContexto(ctx) : ATOR_SISTEMA,
      // Por LINHA: a sessão de plano gera uma por procedimento, e a chave por
      // atendimento deixava só a primeira entrar na corrente.
      chave:      `comissao.gerada:${linhaId}`,
    })
  } catch (e) {
    console.error('[eventoDeComissao]', (e as Error).message)
  }
}
