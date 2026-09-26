import { test, expect } from '@playwright/test'
import { banco, tenantId, nomeDeTeste } from './apoio/banco'

/**
 * Duas passagens do cron ao mesmo tempo não executam o fluxo duas vezes.
 *
 * `retomarPendentes` selecionava os runs prontos e executava, sem reivindicar a
 * linha. Duas passagens concorrentes pegavam o MESMO run e rodavam os passos
 * dele duas vezes — num `notificar_equipe` é um aviso duplicado; numa ação de
 * mensagem, é o cliente recebendo a mesma coisa duas vezes.
 *
 * Concorrer é normal: o serviço roda de 5 em 5 minutos, e uma passagem com fila
 * grande passa disso. Foi assim que o defeito apareceu — `automacoes-tempo`
 * reprovou dentro da suíte com `acao.notificar_equipe` no traço duas vezes, e
 * passava sozinho.
 *
 * A trava é um compare-and-swap em `tentativas`, que já era incrementado antes
 * de executar: quem escreve primeiro leva. Mesmo idioma de
 * `ultimo_disparo_agenda` (CLAUDE.md §9.9).
 */

const TITULO = nomeDeTeste('aviso do cron concorrente')

test('duas passagens simultâneas do cron retomam o run UMA vez', async ({ request }) => {
  const db     = banco()
  const tenant = await tenantId()
  const nome   = nomeDeTeste('anti-duplo')

  let automationId: string | null = null

  try {
    // Um destinatário só, escolhido: `notificar_equipe` com alvo de equipe cria
    // uma notificação por interessado, e contar avisos deixaria de medir
    // execução. Aqui o que se conta é o TRAÇO, mas o alvo fixo mantém o efeito
    // pequeno e previsível.
    const { data: usuario } = await db.from('users')
      .select('id').eq('tenant_id', tenant).eq('is_active', true)
      .limit(1).single<{ id: string }>()
    const usuarioId = usuario!.id

    // Um fluxo mínimo: gatilho manual, espera, avisa a equipe. O que interessa é
    // existir um run PARADO em `esperando` com a volta já vencida.
    // O formato é `nos` + `ligacoes` — não `proximos`. Errei isso na primeira
    // versão e o motor quebrou em `ligacaoSaindo`; o teste passou mesmo assim,
    // medindo um motor que não andava. Vale a pena o registro: um grafo à mão
    // que não casa com o formato dá verde por acidente.
    const grafo = {
      nos: [
        { id: 'g1', tipo: 'gatilho.evento', pos: { x: 0, y: 0 },
          config: { evento: 'cliente.criado' } },
        { id: 'e1', tipo: 'espera.duracao', pos: { x: 260, y: 0 },
          config: { quantidade: 1, unidade: 'minutos' } },
        { id: 'a1', tipo: 'acao.notificar_equipe', pos: { x: 520, y: 0 },
          config: { alvo: 'usuario', alvoId: usuarioId, titulo: TITULO, corpo: 'corpo' } },
      ],
      ligacoes: [
        { id: 'l1', de: 'g1', para: 'e1' },
        { id: 'l2', de: 'e1', para: 'a1' },
      ],
    }

    const { data: auto, error: erroAuto } = await db.from('automations')
      .insert({
        tenant_id: tenant, nome, status: 'ATIVA',
        gatilhos: ['cliente.criado'], grafo,
      })
      .select('id').single<{ id: string }>()
    expect(erroAuto, erroAuto?.message).toBeNull()
    automationId = auto!.id

    // Um run já parado na espera, com a volta no passado — exatamente o estado
    // que o cron procura.
    const { error: erroRun } = await db.from('automation_runs').insert({
      tenant_id:     tenant,
      automation_id: automationId,
      status:        'esperando',
      no_atual:      'a1',
      rodar_apos:    new Date(Date.now() - 60_000).toISOString(),
      tentativas:    0,
      contexto:      {},
      profundidade:  0,
    })
    expect(erroRun, erroRun?.message).toBeNull()

    // As duas passagens saem juntas, sem esperar uma pela outra.
    const [a, b] = await Promise.all([
      request.get('/api/cron/automacoes', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
      request.get('/api/cron/automacoes', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    ])
    expect(a.ok() && b.ok(), 'as duas passagens deveriam responder').toBe(true)

    const { data: run } = await db.from('automation_runs')
      .select('id').eq('automation_id', automationId).single<{ id: string }>()
    expect(run, 'o run deveria existir').not.toBeNull()
    const runId = run!.id

    // O TRAÇO é a medida certa, e não a contagem de notificações:
    // `notificar_equipe` cria uma por destinatário, então oito avisos podem ser
    // uma execução com oito interessados. O que diz se o fluxo rodou duas vezes
    // é o passo aparecer duas vezes.
    const passosDoAviso = async () => {
      const { data } = await db.from('automation_run_steps')
        .select('tipo').eq('run_id', runId)
      return (data ?? []).filter(p => p.tipo === 'acao.notificar_equipe').length
    }

    await expect.poll(passosDoAviso, {
      message: 'a retomada deveria ter executado a ação',
      timeout: 20_000,
    }).toBeGreaterThan(0)

    // Sossega antes de medir: a segunda passagem, se fosse executar, executaria
    // logo depois. Medir na hora acusaria "uma vez" num duplo em andamento.
    await new Promise(r => setTimeout(r, 4000))

    expect(await passosDoAviso(),
      'duas passagens do cron não podem executar o mesmo passo duas vezes',
    ).toBe(1)
  } finally {
    await db.from('user_notifications').delete().eq('title', TITULO)
    if (automationId) {
      const { data: runs } = await db.from('automation_runs')
        .select('id').eq('automation_id', automationId)
      const ids = (runs ?? []).map(r => r.id as string)
      if (ids.length) await db.from('automation_run_steps').delete().in('run_id', ids)
      await db.from('automation_runs').delete().eq('automation_id', automationId)
      await db.from('automations').delete().eq('id', automationId)
    }
  }
})
