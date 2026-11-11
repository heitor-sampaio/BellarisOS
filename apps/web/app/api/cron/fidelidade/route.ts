import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { notifyClient } from '@/lib/notifications/notify'
import { formatarPontos } from '@/lib/fidelidade/formato'
import { diasDoBonusDeAniversario, textoDoAvisoDeVencimento } from '@/lib/fidelidade/rotina'
import { fusoDaRede } from '@/lib/unidades/fuso-da-unidade'
import { fusoValido } from '@/lib/unidades/fuso'

/**
 * A rotina da fidelidade, de hora em hora (Notification Cron):
 *
 * 1. baixa dos pontos vencidos (`expirar_pontos` — FIFO em forma fechada);
 * 2. bônus de aniversário, nas redes que o ligaram (`fidelidade_bonus_aniversario`);
 * 3. aviso de vencimento por push, nas redes que o ligaram (`avisos_de_vencimento`).
 *
 * Os três são idempotentes no BANCO: expiração conta o que já venceu, o bônus
 * tem `bonus_ref` única por ano, e o aviso é reivindicado (a conta guarda até
 * onde já avisou) antes de o push sair. Rodar de hora em hora, ou duas passagens
 * ao mesmo tempo, não repete nada.
 *
 * A ordem importa: expirar antes de avisar, senão o aviso contaria pontos que
 * acabaram de vencer.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth   = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const agora = new Date()
  try {
    const contas = await ler(admin.rpc('expirar_pontos', { p_ate: agora.toISOString() }),
      'dar baixa nos pontos vencidos')

    // O "hoje" do aniversário é o de cada rede, no fuso dela (F62b): uma
    // chamada por rede que ligou o bônus — com uma chamada só, no "hoje" de
    // Brasília, a cliente de Manaus ganhava às 23:00 da véspera.
    const redesDoBonus = ((await ler(admin.from('loyalty_configs').select('tenant_id')
      .eq('enabled', true).gt('birthday_bonus', 0), 'listar as redes com bônus de aniversário')) ?? []) as { tenant_id: string }[]
    const dias = diasDoBonusDeAniversario(
      await Promise.all(redesDoBonus.map(async r => ({ tenantId: r.tenant_id, fuso: await fusoDaRede(r.tenant_id) }))), agora)
    const aniversariantes: { client_id: string; pontos: number }[] = []
    for (const d of dias) {
      aniversariantes.push(...((await ler(admin.rpc('fidelidade_bonus_aniversario', d),
        'dar o bônus de aniversário') ?? []) as { client_id: string; pontos: number }[]))
    }
    await Promise.allSettled(aniversariantes.map(a => notifyClient(admin, a.client_id, {
      type:  'fidelidade_bonus',
      title: 'Feliz aniversário!',
      body:  `Você ganhou ${formatarPontos(Number(a.pontos))} de presente.`,
    })))

    const avisos = (await ler(admin.rpc('avisos_de_vencimento', { p_agora: agora.toISOString() }),
      'separar os avisos de vencimento') ?? []) as { client_id: string; pontos: number; ate: string; slug: string | null }[]
    // O dia do "vencem até" no fuso da unidade da cliente (F62b).
    const slugs = [...new Set(avisos.map(a => a.slug).filter((s): s is string => !!s))]
    const fusoDoSlug = new Map((slugs.length ? ((await ler(admin.from('branches').select('slug, fuso').in('slug', slugs),
      'buscar o fuso das unidades dos avisos')) ?? []) as { slug: string; fuso: string | null }[] : [])
      .map(b => [b.slug, fusoValido(b.fuso)]))
    await Promise.allSettled(avisos.map(a => notifyClient(admin, a.client_id, {
      type:  'fidelidade_vencimento',
      title: 'Seus pontos vão vencer',
      body:  textoDoAvisoDeVencimento(Number(a.pontos), a.ate, a.slug ? fusoDoSlug.get(a.slug) : undefined),
      data:  a.slug ? { url: `/${a.slug}/cliente/fidelidade` } : undefined,
    })))

    return NextResponse.json({
      ok: true, contas: Number(contas ?? 0), aniversarios: aniversariantes.length, avisos: avisos.length,
    })
  } catch (e) {
    console.error('[cron/fidelidade]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Falha na rotina da fidelidade.' }, { status: 500 })
  }
}
