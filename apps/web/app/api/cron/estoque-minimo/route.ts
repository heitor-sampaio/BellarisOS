import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificarInteressados } from '@/lib/notifications/interessados'

/**
 * Avisa quem cuida do estoque que um produto cruzou o mínimo.
 *
 * O fato já existia: `estoque.abaixo_do_minimo` é emitido por GATILHO no banco
 * desde 2026-09-23, na TRAVESSIA do mínimo. O que não existia era alguém
 * recebendo o aviso — o CLAUDE.md §9.8 prometia "notificações operacionais:
 * novo agendamento, cancelamento, **estoque mínimo**" e essa última nunca saiu
 * do papel. Corrigido em 2026-09-25, com a regra de partes interessadas.
 *
 * **Por que um cron e não a ação que mexe no estoque:** o saldo cai em cinco ou
 * seis lugares (atendimento, entrada, ajuste, transferência, código de barras),
 * e foi exatamente por isso que o evento virou gatilho no banco. Instrumentar
 * cada caminho de novo seria repetir o erro que o gatilho resolveu.
 *
 * **Sem estado próprio para saber onde parou:** a janela é a do ritmo do cron
 * com folga, e a repetição é evitada perguntando se JÁ EXISTE notificação com
 * o id daquele evento. Guardar um "último processado" seria mais uma coisa a
 * dessincronizar quando o job falhasse no meio.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Ritmo do job (1h) mais folga, para nada cair no vão entre duas execuções. */
const JANELA_MIN = 90

export async function GET(req: NextRequest) {
  const auth   = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin  = createAdminClient()
    const desde  = new Date(Date.now() - JANELA_MIN * 60_000).toISOString()

    const { data: eventos, error } = await admin
      .from('domain_events')
      .select('id, branch_id, dados')
      .eq('nome', 'estoque.abaixo_do_minimo')
      .gte('ocorrido_em', desde)
      .order('ocorrido_em', { ascending: true })
    if (error) throw new Error(error.message)

    let avisados = 0
    let repetidos = 0

    for (const ev of eventos ?? []) {
      const eventoId = ev.id as string

      // Já avisamos deste? A execução anterior pode ter pegado o mesmo evento
      // pela folga da janela.
      const { count } = await admin
        .from('user_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'stock_below_minimum')
        .filter('data->>evento_id', 'eq', eventoId)
      if ((count ?? 0) > 0) { repetidos++; continue }

      const d = (ev.dados ?? {}) as Record<string, unknown>
      const produto = String(d.produtoNome ?? 'Produto')
      const saldo   = Number(d.saldo ?? 0)
      const minimo  = Number(d.minimo ?? 0)
      const unidade = String(d.unidade ?? '')

      await notificarInteressados(admin,
        // Sem envolvido direto: estoque não é "de" ninguém. Quem tem interesse
        // é quem responde pelo módulo na unidade. E sem ator: o gatilho é do
        // banco, e o saldo pode ter caído por um atendimento de terceiros.
        { modulo: 'stock', branchId: (ev.branch_id ?? null) as string | null },
        {
          type:  'stock_below_minimum',
          title: 'Estoque abaixo do mínimo',
          body:  `${produto}: ${saldo.toLocaleString('pt-BR')} ${unidade} em estoque, mínimo ${minimo.toLocaleString('pt-BR')}.`,
          data:  { evento_id: eventoId, produto_id: d.produtoId ?? null, branch_id: ev.branch_id ?? null },
        })
      avisados++
    }

    return NextResponse.json({ ok: true, eventos: eventos?.length ?? 0, avisados, repetidos })
  } catch (e) {
    // Sai com erro de propósito: o script do cron marca a execução como
    // vermelha no painel do Railway em vez de falhar em silêncio.
    console.error('[cron estoque-minimo]', (e as Error).message)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
