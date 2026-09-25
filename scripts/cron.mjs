/**
 * Disparador dos jobs agendados.
 *
 * Roda no serviço de cron do Railway, que compartilha a imagem principal (o
 * `railway.toml` da raiz fixa o dockerfilePath e o serviço só sobrescreve o
 * CMD). O antigo `Dockerfile.cron` não existe mais — ver CLAUDE.md §14.1.
 * Chama as rotas `/api/cron/*` do app com o CRON_SECRET. É um script, e não um
 * start command com curl, porque o Railway não aplica start command a serviços
 * baseados em imagem pública: o container subia o shell padrão e saía sem
 * executar nada — o cron parecia rodar e não fazia coisa alguma.
 *
 * Sai com código 1 se algum job falhar, para o Railway marcar a execução como
 * falha em vez de engolir o erro.
 */

/**
 * Quais rotas chamar.
 *
 * Configurável por env porque agora há **dois serviços de cron** com ritmos
 * diferentes: o de hora em hora (o padrão abaixo) e o das automações, a cada
 * cinco minutos. O segundo define `CRON_JOBS=automacoes` e usa o mesmo script e
 * a mesma imagem — criar um script por serviço faria o Dockerfile crescer a
 * cada ritmo novo, e o `railway.toml` da raiz fixa o Dockerfile para todos.
 *
 * Por que não juntar tudo num cron de cinco minutos: as campanhas de
 * notificação e a exportação de LGPD varrem a base inteira. De hora em hora é
 * de propósito.
 */
const PADRAO = ['notification-campaigns', 'lgpd-exports', 'meta-capi', 'eventos-expirados', 'estoque-minimo']

const JOBS = (process.env.CRON_JOBS ?? '')
  .split(',')
  .map(j => j.trim())
  .filter(Boolean)

if (JOBS.length === 0) JOBS.push(...PADRAO)

const APP_URL     = process.env.APP_URL
const CRON_SECRET = process.env.CRON_SECRET

if (!APP_URL || !CRON_SECRET) {
  console.error('APP_URL e CRON_SECRET são obrigatórios.')
  process.exit(1)
}

const TIMEOUT_MS = 120_000

let failed = 0

for (const job of JOBS) {
  const url = `${APP_URL.replace(/\/$/, '')}/api/cron/${job}`
  const started = Date.now()

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      signal:  AbortSignal.timeout(TIMEOUT_MS),
    })
    const body = (await res.text()).slice(0, 500)
    const ms   = Date.now() - started

    if (res.ok) {
      console.log(`[ok]   ${job} (${res.status}, ${ms}ms) ${body}`)
    } else {
      console.error(`[erro] ${job} (${res.status}, ${ms}ms) ${body}`)
      failed++
    }
  } catch (e) {
    console.error(`[erro] ${job}: ${e instanceof Error ? e.message : e}`)
    failed++
  }
}

console.log(failed === 0 ? 'todos os jobs concluídos' : `${failed} job(s) falharam`)
process.exit(failed === 0 ? 0 : 1)
