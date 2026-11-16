#!/usr/bin/env node
/**
 * O BANCO DE TESTES LOCAL (o Heitor, 2026-11-16: "vamos subir um banco separado
 * pra testes usando supabase self hosted… local aqui na maquina").
 *
 * A suíte e as simulações usavam o MESMO banco da produção, e o Postgres da
 * instância Small reiniciava sob a carga. Este é um Supabase na máquina
 * (Docker), com a ESTRUTURA do banco da nuvem — nunca os dados:
 *
 *  - a base é `infra/banco-de-teste/supabase/migrations/20261116000000_base_do_cloud.sql`,
 *    o dump só de esquema da nuvem em 16/11 (as migrations do repositório não
 *    reconstroem o banco: ele nasceu de clones e de SQL aplicado direto). Ela
 *    fica fora do git (`infra/banco-de-teste/.gitignore`): para refazê-la,
 *    `node scripts/banco-local.mjs base` (pede `apps/web/.env.banco-cloud`).
 *  - por cima, as migrations do repositório que a base ainda não tem: as que
 *    não estão em `infra/banco-de-teste/base-inclui.txt` (a lista das que já
 *    existiam quando a base foi tirada).
 *  - a semente (`supabase/seed.sql` de lá): os planos e a configuração da
 *    plataforma — sem rede e sem pessoa.
 *  - a rede de teste da suíte, criada por `scripts/rede-de-teste.mjs`.
 *
 * Uso (de apps/web, com o Docker aberto):
 *   node scripts/banco-local.mjs preparar   # sobe, refaz do zero, cria a rede de teste
 *   node scripts/banco-local.mjs conferir   # a estrutura daqui é a da produção? (antes do commit)
 *   node scripts/banco-local.mjs env        # só regrava apps/web/.env.banco-local
 *   node scripts/banco-local.mjs parar
 * Depois, qualquer comando contra ele: `node scripts/com-banco-local.mjs <comando>`.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAIZ = path.resolve(WEB, '..', '..')
const INFRA = path.join(RAIZ, 'infra', 'banco-de-teste')
const MIG_LOCAL = path.join(INFRA, 'supabase', 'migrations')
const MIG_REPO = path.join(RAIZ, 'supabase', 'migrations')
const BASE = '20261116000000_base_do_cloud.sql'
const ENV_LOCAL = path.join(WEB, '.env.banco-local')

// O Docker Desktop instala o cliente fora do PATH de quem já estava aberto.
const DOCKER_BIN = 'C:\\Program Files\\Docker\\Docker\\resources\\bin'
const env = { ...process.env }
if (process.platform === 'win32' && fs.existsSync(DOCKER_BIN) && !(env.PATH ?? env.Path ?? '').includes(DOCKER_BIN)) {
  const chave = 'Path' in env ? 'Path' : 'PATH'
  env[chave] = `${DOCKER_BIN};${env[chave] ?? ''}`
}

function rodar(cmd, args, { capturar = false, cwd = INFRA } = {}) {
  const r = spawnSync(cmd, args, { cwd, env, shell: process.platform === 'win32', encoding: 'utf8', stdio: capturar ? 'pipe' : 'inherit' })
  if (r.status !== 0) {
    if (capturar) process.stderr.write(r.stderr ?? '')
    throw new Error(`${cmd} ${args.join(' ')} saiu com ${r.status}`)
  }
  return r.stdout ?? ''
}
const supabase = (args, opts) => rodar('npx', ['--yes', 'supabase', ...args], opts)

/** As migrations do repositório que a base não tem vão para o projeto local. */
function sincronizarMigrations() {
  const naBase = new Set(fs.readFileSync(path.join(INFRA, 'base-inclui.txt'), 'utf8').split(/\r?\n/).filter(Boolean))
  for (const f of fs.readdirSync(MIG_LOCAL)) if (f !== BASE) fs.rmSync(path.join(MIG_LOCAL, f))
  const novas = fs.readdirSync(MIG_REPO).filter(f => f.endsWith('.sql') && !naBase.has(f)).sort()
  for (const f of novas) fs.copyFileSync(path.join(MIG_REPO, f), path.join(MIG_LOCAL, f))
  console.log(novas.length ? `[banco-local] migrations por cima da base: ${novas.join(', ')}` : '[banco-local] nenhuma migration nova por cima da base')
}

/** As chaves do Supabase LOCAL (as de desenvolvimento, iguais em toda máquina) — nunca as da nuvem. */
function gravarEnv() {
  const vars = Object.fromEntries(supabase(['status', '-o', 'env'], { capturar: true })
    .split(/\r?\n/).map(l => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]))
  const linhas = [
    '# Gerado por scripts/banco-local.mjs — o Supabase LOCAL (Docker). Não vai para o git.',
    `NEXT_PUBLIC_SUPABASE_URL=${vars.API_URL}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${vars.ANON_KEY}`,
    `SUPABASE_SERVICE_ROLE_KEY=${vars.SERVICE_ROLE_KEY}`,
    `DATABASE_URL=${vars.DB_URL}`,
    // Outra porta: um `next dev` aberto na 3000 contra a nuvem seria reaproveitado.
    'E2E_BASE_URL=http://localhost:3010',
    'E2E_BANCO=local',
  ]
  fs.writeFileSync(ENV_LOCAL, linhas.join('\n') + '\n')
  console.log(`[banco-local] ${path.relative(RAIZ, ENV_LOCAL)} gravado (API ${vars.API_URL})`)
}

/** Refaz a base a partir da nuvem: só esquema, mais o que o dump não leva. */
function tirarBase() {
  const arq = path.join(WEB, '.env.banco-cloud')
  const url = fs.existsSync(arq) && fs.readFileSync(arq, 'utf8').match(/^SUPABASE_DB_URL=(.+)$/m)?.[1].trim().replace(/^"|"$/g, '')
  if (!url) throw new Error('Falta SUPABASE_DB_URL em apps/web/.env.banco-cloud (a URI do Session pooler).')
  fs.mkdirSync(path.join(INFRA, 'dump'), { recursive: true })
  supabase(['db', 'dump', '--db-url', url, '-f', 'dump/esquema.sql'])
  // prévia (desliga as permissões padrão) + o dump + o que ele não leva + o fim (religa)
  const parte = f => fs.readFileSync(path.join(INFRA, f), 'utf8')
  fs.writeFileSync(path.join(MIG_LOCAL, BASE), [parte('previa.sql'), parte('dump/esquema.sql'), parte('extras.sql'), parte('fim.sql')].join('\n'))
  fs.writeFileSync(path.join(INFRA, 'base-inclui.txt'), fs.readdirSync(MIG_REPO).filter(f => f.endsWith('.sql')).sort().join('\n') + '\n')
  console.log('[banco-local] base refeita; confira se não há migration aplicada na nuvem DEPOIS do dump fora da lista')
}

/**
 * O banco local é igual ao da PRODUÇÃO? A garantia de "passou aqui, funciona
 * lá" depende disto: a suíte prova o código contra o banco local, e o local
 * nasce dos ARQUIVOS de migration — a produção, do que foi aplicado nela.
 * Compara objeto por objeto (funções com o corpo e as permissões, políticas,
 * colunas, tabelas, gatilhos, índices, restrições, tipos, Realtime, buckets)
 * e sai com erro dizendo o que difere. Só leitura nos dois. Pede
 * `apps/web/.env.banco-cloud` e o IP liberado na restrição de rede da nuvem.
 */
function conferir() {
  const arq = path.join(WEB, '.env.banco-cloud')
  const url = fs.existsSync(arq) && fs.readFileSync(arq, 'utf8').match(/^SUPABASE_DB_URL=(.+)$/m)?.[1].trim().replace(/^"|"$/g, '')
  if (!url) throw new Error('Falta SUPABASE_DB_URL em apps/web/.env.banco-cloud.')
  const sql = fs.readFileSync(path.join(INFRA, 'estrutura.sql'), 'utf8')
  const ler = (alvo) => {
    const r = spawnSync('docker', ['exec', '-i', '-e', `U=${alvo}`, '-e', 'PGSSLMODE=' + (alvo.includes('127.0.0.1') || alvo === 'local' ? 'disable' : 'require'),
      'supabase_db_banco-de-teste', 'sh', '-c', alvo === 'local' ? 'psql -U postgres -At -v ON_ERROR_STOP=1' : 'psql "$U" -At -v ON_ERROR_STOP=1'],
      { env, input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    if (r.status !== 0) throw new Error(`não consegui ler o banco ${alvo === 'local' ? 'local' : 'da nuvem'}: ${(r.stderr ?? '').replace(/postgres(ql)?:\/\/\S+/g, '<url>').trim()}`)
    return new Map(r.stdout.split(/\r?\n/).filter(Boolean).map(l => { const i = l.lastIndexOf(' '); return [l.slice(0, i), l.slice(i + 1)] }))
  }
  const local = ler('local')
  const nuvem = ler(url)
  const so = (a, b) => [...a.keys()].filter(k => !b.has(k))
  const diferentes = [...local.keys()].filter(k => nuvem.has(k) && nuvem.get(k) !== local.get(k))
  const soLocal = so(local, nuvem)
  const soNuvem = so(nuvem, local)
  console.log(`[banco-local] ${local.size} objetos aqui, ${nuvem.size} na produção`)
  if (!diferentes.length && !soLocal.length && !soNuvem.length) {
    console.log('[banco-local] a estrutura do banco local é IGUAL à da produção')
    return
  }
  for (const k of diferentes) console.log(`  diferente: ${k}`)
  for (const k of soLocal) console.log(`  só no local (o arquivo não foi aplicado na produção?): ${k}`)
  for (const k of soNuvem) console.log(`  só na produção (aplicado sem arquivo?): ${k}`)
  throw new Error(`${diferentes.length + soLocal.length + soNuvem.length} diferença(s) entre o banco local e o da produção`)
}

const comando = process.argv[2]
try {
  if (comando === 'preparar') {
    if (!fs.existsSync(path.join(MIG_LOCAL, BASE))) throw new Error(`Falta a base (${BASE}): rode \`node scripts/banco-local.mjs base\` primeiro.`)
    sincronizarMigrations()
    supabase(['start'])
    supabase(['db', 'reset'])
    gravarEnv()
    rodar('node', [path.join(WEB, 'scripts', 'com-banco-local.mjs'), 'node', 'scripts/rede-de-teste.mjs'], { cwd: WEB })
    console.log('[banco-local] pronto. Rode a suíte com: node scripts/com-banco-local.mjs pnpm exec playwright test <specs>')
  } else if (comando === 'env') {
    gravarEnv()
  } else if (comando === 'base') {
    tirarBase()
  } else if (comando === 'conferir') {
    conferir()
  } else if (comando === 'parar') {
    supabase(['stop'])
  } else {
    console.log('Uso: node scripts/banco-local.mjs preparar | conferir | env | base | parar')
    process.exit(1)
  }
} catch (e) {
  console.error(`[banco-local] ${e.message}`)
  process.exit(1)
}
