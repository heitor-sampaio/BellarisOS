import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Apaga eventos de domínio com mais de 30 dias.
 *
 * `domain_events` é append-only e recebe uma linha por ação relevante — numa
 * clínica ativa, dezenas de milhares por ano. Sem expiração ela cresce para
 * sempre carregando dado que ninguém mais consulta.
 *
 * **30 dias é decisão do Heitor (2026-09-23), e tem uma consequência que vale
 * lembrar ao construir automação:** a corrente é uma janela, não um arquivo.
 * Automação que precise olhar para trás além de 30 dias — "cliente que não
 * volta há 90" — não pode se apoiar nesta tabela; tem de consultar o dado de
 * negócio direto (`appointments`, `clients`). O histórico duradouro continua
 * onde sempre esteve: `lead_events` e `appointment_history` têm retenção
 * própria e não são tocados aqui.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DIAS = 30

export async function GET(req: NextRequest) {
  const auth   = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const limite = new Date(Date.now() - DIAS * 24 * 3600 * 1000).toISOString()
    const admin  = createAdminClient()

    // `count: 'exact'` para o log dizer quanto saiu: sem isso a execução
    // aparece verde no painel sem nenhuma pista de estar funcionando.
    const { count, error } = await admin
      .from('domain_events')
      .delete({ count: 'exact' })
      .lt('ocorrido_em', limite)

    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true, apagados: count ?? 0, anteriores_a: limite })
  } catch (e) {
    // Sai com erro de propósito: o script do cron marca a execução como
    // vermelha no painel do Railway em vez de falhar em silêncio.
    console.error('[cron eventos-expirados]', (e as Error).message)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
