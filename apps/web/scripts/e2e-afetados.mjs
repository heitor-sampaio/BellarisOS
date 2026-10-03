#!/usr/bin/env node
/**
 * Roda só os testes da área que mudou — o E2E de cada etapa de trabalho.
 *
 * A suíte inteira passa de 290 testes e, com um worker só (eles dividem o
 * banco), leva de 15 a 30 minutos. Rodá-la a cada alteração tornava o
 * desenvolvimento lento demais (Heitor, 2026-09-28). A completa agora roda no
 * GitHub Actions a cada push na main (`.github/workflows/e2e.yml`) e, à mão,
 * por `pnpm test:e2e:completa`.
 *
 * O que muda entra por `git`: o que está alterado e ainda não foi commitado
 * (inclusive arquivo novo), ou, com `--desde <ref>`, tudo desde aquele commit.
 * Cada arquivo alterado casa com ÁREAS (lista abaixo), e cada área diz quais
 * specs a cobrem. Spec alterado roda sempre.
 *
 * Arquivo COMPARTILHADO (auth, banco, layouts, proxy, apoio do E2E…) afeta
 * tudo: aí o script avisa e não escolhe — use a completa.
 *
 *   pnpm test:e2e:afetados               # o que não foi commitado
 *   pnpm test:e2e:afetados --desde HEAD~3
 *   pnpm test:e2e:afetados --listar      # só mostra o que rodaria
 */
import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAIZ = path.resolve(WEB, '..', '..')

// ─── Áreas: o que no caminho do arquivo liga a área, e os specs dela ────────
// Ao criar um spec, ele precisa cair em alguma área (ou ter no nome uma
// palavra do arquivo que testa) — senão só a completa o roda. O script avisa
// no fim quais specs nenhuma área cobre.
const AREAS = [
  { nome: 'inbox e WhatsApp',
    chaves: ['inbox', 'conversa', 'conversation', 'mensag', 'message', 'whatsapp', 'uazapi', 'contato', 'contact', 'templat', 'messaging', 'webhook'],
    specs: /^(inbox|contato|mensagens|whatsapp|templates|oportunidade-da-pessoa|eventos-webhook|crm-alcance)/ },
  { nome: 'CRM',
    chaves: ['crm', 'lead', 'oportunidade', 'funil', 'funnel', 'quadro'],
    specs: /^(crm|lead|oportunidade|quadro|inbox-visibilidade|contato-propaga)/ },
  { nome: 'agenda e atendimento',
    chaves: ['agenda', 'appointment', 'agendamento', 'atendimento', 'sessao-de', 'pacote', 'package'],
    specs: /^(agenda|agendamento|agendar|atendimento|conclusao|fase2|pacote|abrangencia|portal-cliente|plano|pre-pago)/ },
  { nome: 'financeiro',
    chaves: ['financ', 'cashier', 'transac', 'pagamento', 'payment', 'credito', 'credit', 'estorno', 'checkout', 'plano', 'plan'],
    specs: /^(financeiro|credito|fase1|checkout|plano|indicadores|relatorios|comissoes|vendas|pre-pago)/ },
  { nome: 'comissões',
    chaves: ['comiss', 'commission'],
    specs: /^(comissoes|atendimento-fechamento|conclusao|indicadores|relatorios)/ },
  { nome: 'fidelidade',
    chaves: ['fidelidade', 'loyalty', 'voucher', 'recompensa', 'reward', 'pontos'],
    specs: /^(fidelidade|credito|financeiro-estorno|portal-cliente|lgpd)/ },
  { nome: 'procedimentos',
    chaves: ['procedure', 'procedimento'],
    specs: /^(procedimento|eventos-cadastro|ficha-unica|documentos)/ },
  { nome: 'termos e contratos',
    chaves: ['documento', 'document', 'termo', 'consent', 'contrato', 'assinatura', 'assinar', 'signature', 'pdf'],
    specs: /^(documentos|checkout|permissoes-acoes|rls)/ },
  { nome: 'estoque',
    chaves: ['estoque', 'stock', 'lote', 'batch', 'produto', 'product', 'insumo', 'injetav'],
    specs: /^(estoque|lotes|fase3|injetaveis|conclusao)/ },
  { nome: 'indicadores',
    chaves: ['metric', 'relatorio', 'report', 'dashboard', 'indicador'],
    specs: /^(indicadores|relatorios|fase1)/ },
  { nome: 'automações e eventos',
    chaves: ['automac', 'evento', 'events', 'domain_event'],
    specs: /^(automacoes|eventos|campanha|mensagens-saida)/ },
  { nome: 'campanhas e notificações',
    chaves: ['notific', 'campanha', 'campaign', 'push'],
    specs: /^(campanha|notificacoes|funcionalidades)/ },
  { nome: 'clientes, prontuário e LGPD',
    chaves: ['client', 'prontuario', 'medical', 'record', 'lgpd', 'ficha', 'anamnes', 'forms', 'planejamento'],
    specs: /^(prontuario|ficha|lgpd|portal-cliente|fase5|planejamentos|permissoes-acoes)/ },
  { nome: 'autorização e equipe',
    chaves: ['permiss', 'cargo', 'role', 'team', 'equipe', 'membro', 'login', 'register', 'password', 'senha'],
    specs: /^(autenticacao|permissoes|fase4|membro|equipe|portais|abrangencia|rls|api-sem|privacidade|acoes-entre-redes)/ },
  { nome: 'configurações e rede',
    chaves: ['settings', 'configurac', 'branch', 'unidade', 'tenant', 'rede', 'integrac', 'integration'],
    specs: /^(configuracoes|estrutura|equipe|anuncios|abrangencia|credenciais|acoes-entre-redes)/ },
  { nome: 'anúncios',
    chaves: ['ads', 'anuncio', 'capi', 'oauth'],
    specs: /^(anuncios|mensagens-meta)/ },
  { nome: 'rotas de API',
    chaves: ['app/api/'],
    specs: /^(api-sem-credencial)/ },
  { nome: 'menu lateral',
    chaves: ['sidebar', 'secao-do-menu', 'nav-item', 'lib/menu'],
    specs: /^(menu|busca-universal)/ },
  { nome: 'busca universal',
    chaves: ['busca', 'topbar', 'lib/configuracoes/', 'inbox/pagina'],
    specs: /^(busca-universal|inbox-paginado|inbox-nome-da-pessoa)/ },
  { nome: 'visual',
    chaves: ['globals.css', 'components/ui/', 'seg-select', 'seletor'],
    specs: /^(seletores|render-limpo|smoke)/ },
]

// Mexer nestes muda o chão de todas as telas: nenhuma área basta.
const COMPARTILHADOS = [
  /apps\/web\/lib\/auth\.ts$/, /apps\/web\/lib\/db\.ts$/, /apps\/web\/lib\/supabase\//,
  /apps\/web\/proxy\.ts$/, /apps\/web\/middleware\.ts$/,
  /apps\/web\/app\/layout\.tsx$/, /apps\/web\/app\/admin\/layout\.tsx$/, /apps\/web\/app\/\[slug\]\/layout\.tsx$/,
  /apps\/web\/lib\/permissions\.ts$/, /apps\/web\/lib\/rotas\.ts$/,
  /apps\/web\/package\.json$/, /pnpm-lock\.yaml$/, /apps\/web\/next\.config\./,
  /apps\/web\/playwright(\.build)?\.config\.ts$/, /apps\/web\/e2e\/global-setup\.ts$/, /apps\/web\/e2e\/apoio\//,
]

// O que não é código do app não pede teste nenhum.
const IGNORADOS = [/\.md$/, /^\.github\//, /apps\/web\/scripts\/e2e-afetados\.mjs$/, /apps\/native\//, /\.claude\//]

// ─── Argumentos ─────────────────────────────────────────────────────────────
const args   = process.argv.slice(2)
const listar = args.includes('--listar')
const iDesde = args.indexOf('--desde')
const desde  = iDesde >= 0 ? args[iDesde + 1] : null

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: RAIZ, encoding: 'utf8' }).split('\n').map(l => l.trim()).filter(Boolean)
}

const alterados = [...new Set(desde
  ? git(`diff --name-only ${desde}`)
  : [...git('diff --name-only HEAD'), ...git('ls-files --others --exclude-standard')],
)].filter(a => !IGNORADOS.some(r => r.test(a)))

if (alterados.length === 0) {
  console.log('Nada alterado — nenhum teste a rodar.')
  process.exit(0)
}

const compartilhados = alterados.filter(a => COMPARTILHADOS.some(r => r.test(a)))
if (compartilhados.length > 0) {
  console.log('Arquivo compartilhado alterado — ele afeta todas as telas:')
  for (const a of compartilhados) console.log(`  ${a}`)
  console.log('\nRode a completa: pnpm test:e2e:completa')
  process.exit(listar ? 0 : 2)
}

// ─── Casamento ──────────────────────────────────────────────────────────────
const specs = fs.readdirSync(path.join(WEB, 'e2e'))
  .filter(f => f.endsWith('.spec.ts')).map(f => f.replace(/\.spec\.ts$/, ''))

const escolhidos = new Set()
const semArea = []

// Palavras do nome do arquivo (5+ letras), para o spec que leva o nome do que
// testa (`lotes-baixa` ↔ `..._lotes_por_unidade.sql`).
const palavras = a => path.basename(a).toLowerCase().replace(/\.[a-z]+$/, '')
  .split(/[^a-z]+/).filter(p => p.length >= 5)

for (const a of alterados) {
  const caminho = a.toLowerCase()
  const spec = caminho.match(/apps\/web\/e2e\/(.+)\.spec\.ts$/)
  if (spec) { escolhidos.add(spec[1]); continue }

  let casou = false
  for (const area of AREAS) {
    if (!area.chaves.some(c => caminho.includes(c))) continue
    for (const s of specs) if (area.specs.test(s)) escolhidos.add(s)
    casou = true
  }
  for (const p of palavras(a)) {
    for (const s of specs) if (s.split('-').some(t => t.length >= 5 && (t.startsWith(p) || p.startsWith(t)))) {
      escolhidos.add(s); casou = true
    }
  }
  if (!casou) semArea.push(a)
}

// Os testes de unidade da área, pelo grafo de imports do Vitest.
const fontes = alterados.filter(a => /^apps\/web\/.+\.(ts|tsx)$/.test(a) && !a.includes('/e2e/'))
  .map(a => path.relative(WEB, path.join(RAIZ, a)))

const lista = [...escolhidos].sort()
console.log(`Alterados (${alterados.length}):`)
for (const a of alterados) console.log(`  ${a}`)
console.log(`\nE2E (${lista.length}): ${lista.join(', ') || '—'}`)
if (semArea.length) {
  console.log('\n⚠ Sem área conhecida (só a completa os cobre):')
  for (const a of semArea) console.log(`  ${a}`)
}
if (listar) {
  const orfaos = specs.filter(s => !AREAS.some(ar => ar.specs.test(s)))
  if (orfaos.length) console.log(`\nSpecs que nenhuma área cobre: ${orfaos.join(', ')}`)
  process.exit(0)
}

let falhou = false
if (fontes.length) {
  console.log('\n— Vitest (relacionados) —')
  const v = spawnSync('pnpm', ['exec', 'vitest', 'related', '--run', '--passWithNoTests', ...fontes], { cwd: WEB, stdio: 'inherit', shell: true })
  falhou ||= v.status !== 0
}
if (lista.length) {
  console.log('\n— Playwright —')
  const p = spawnSync('pnpm', ['exec', 'playwright', 'test', ...lista.map(s => `e2e/${s}.spec.ts`)], { cwd: WEB, stdio: 'inherit', shell: true })
  falhou ||= p.status !== 0
}
process.exit(falhou ? 1 : 0)
