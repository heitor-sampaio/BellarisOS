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
const PADRAO = ['notification-campaigns', 'lgpd-exports', 'meta-capi', 'eventos-expirados', 'estoque-minimo', 'fidelidade', 'documentos-pdf', 'suporte-sessoes', 'assinaturas']

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

/**
 * Nova tentativa só quando a chamada NÃO chegou ao app: falha de rede antes da
 * resposta, ou erro da borda do Railway (502/503/504, ou o 404 "Application not
 * found" que derrubou uma passagem do Automations Cron na madrugada de
 * 2026-09-30, enquanto o serviço era redistribuído). Tempo esgotado NÃO
 * repete: o job pode estar rodando do lado de lá, e repetir o executaria duas
 * vezes.
 */
const ESPERAS_MS = [15_000, 30_000]
const daBorda = (status, body) => [502, 503, 504].includes(status) || (status === 404 && /application not found/i.test(body))
const espera = ms => new Promise(ok => setTimeout(ok, ms))

async function chamar(job) {
  const url = `${APP_URL.replace(/\/$/, '')}/api/cron/${job}`
  for (let tentativa = 0; ; tentativa++) {
    const started = Date.now()
    let res, body
    try {
      res  = await fetch(url, { headers: { Authorization: `Bearer ${CRON_SECRET}` }, signal: AbortSignal.timeout(TIMEOUT_MS) })
      body = (await res.text()).slice(0, 500)
    } catch (e) {
      const esgotou = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
      if (!esgotou && tentativa < ESPERAS_MS.length) {
        console.warn(`[repete] ${job}: ${e instanceof Error ? e.message : e} — de novo em ${ESPERAS_MS[tentativa] / 1000}s`)
        await espera(ESPERAS_MS[tentativa])
        continue
      }
      console.error(`[erro] ${job}: ${e instanceof Error ? e.message : e}`)
      return false
    }
    const ms = Date.now() - started
    if (res.ok) {
      console.log(`[ok]   ${job} (${res.status}, ${ms}ms) ${body}`)
      return true
    }
    if (daBorda(res.status, body) && tentativa < ESPERAS_MS.length) {
      console.warn(`[repete] ${job} (${res.status}, borda) — de novo em ${ESPERAS_MS[tentativa] / 1000}s`)
      await espera(ESPERAS_MS[tentativa])
      continue
    }
    console.error(`[erro] ${job} (${res.status}, ${ms}ms) ${body}`)
    return false
  }
}

for (const job of JOBS) {
  if (!(await chamar(job))) failed++
}

console.log(failed === 0 ? 'todos os jobs concluídos' : `${failed} job(s) falharam`)
process.exit(failed === 0 ? 0 : 1)
