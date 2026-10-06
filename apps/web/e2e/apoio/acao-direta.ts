import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'

/**
 * Chamar uma server action DIRETAMENTE, como a pessoa logada naquela página —
 * sem a tela.
 *
 * É o teste de autorização que a tela não dá: todo export de `'use server'` é
 * endpoint público, e o que protege de verdade é o `assertPermission` DENTRO
 * da action, não o botão escondido. `apoio/acao.ts` reenvia uma chamada
 * capturada; este dispensa a captura, e por isso serve para percorrer uma
 * matriz de actions × cargos sem montar a tela de cada uma.
 *
 * - O id da action sai do manifesto que o `next dev` grava por página
 *   (`.next/dev/server/app/<rota>/page/server-reference-manifest.json` — no
 *   build, `.next/server/app/...` —, com
 *   `filename` e `exportedName`). A página precisa ter sido compilada: por
 *   isso a `rota` é visitada antes, se o id ainda não estiver lá.
 * - **Só argumentos JSON** (o corpo é o JSON do array de argumentos). Action
 *   que recebe `FormData` não funciona por aqui — o formato multipart que o
 *   React usa não foi reproduzido (testado em 2026-09-27: a action recebia o
 *   FormData vazio). Para essas, `apoio/acao.ts` (capturar e reenviar).
 */

// No build (`playwright.build.config.ts`) os manifestos moram em `.next/server`;
// no `next dev`, em `.next/dev/server`. O formato é o mesmo. Cada app (a
// clínica, o sistema, o suporte) tem os seus: `apps/<app>/.next/…`.
type App = 'web' | 'sistema' | 'suporte'
function raizDo(app: App): string {
  const base = path.resolve(__dirname, '..', '..', '..', app, '.next')
  return process.env.E2E_BUILD ? path.join(base, 'server', 'app') : path.join(base, 'dev', 'server', 'app')
}

/** De qual app é a rota: URL absoluta no host do sistema ou do suporte; o resto é a clínica. */
export function appDaRota(rota: string): App {
  if (process.env.E2E_SISTEMA_URL && rota.startsWith(process.env.E2E_SISTEMA_URL)) return 'sistema'
  if (process.env.E2E_SUPORTE_URL && rota.startsWith(process.env.E2E_SUPORTE_URL)) return 'suporte'
  return 'web'
}

function manifestos(dir: string, achados: string[] = []): string[] {
  if (!fs.existsSync(dir)) return achados
  for (const nome of fs.readdirSync(dir)) {
    const cheio = path.join(dir, nome)
    if (fs.statSync(cheio).isDirectory()) manifestos(cheio, achados)
    else if (nome === 'server-reference-manifest.json') achados.push(cheio)
  }
  return achados
}

function idDa(arquivo: string, funcao: string, app: App): string | null {
  for (const m of manifestos(raizDo(app))) {
    const json = JSON.parse(fs.readFileSync(m, 'utf8')) as { node?: Record<string, { exportedName?: string; filename?: string }> }
    for (const [id, e] of Object.entries(json.node ?? {})) {
      if (e.exportedName === funcao && e.filename?.split(path.sep).join('/').endsWith(arquivo)) return id
    }
  }
  return null
}

export interface RespostaDeAcao { status: number; texto: string }

/**
 * @param arquivo  caminho da action a partir da raiz do app (ex.: `actions/procedures.ts`)
 * @param rota     URL de uma página que USA a action (é para ela que se posta).
 *                 Absoluta no host do sistema ou do suporte para as actions de lá.
 */
export async function chamarAcao(
  page: Page, arquivo: string, funcao: string, rota: string, args: unknown[],
): Promise<RespostaDeAcao> {
  const app = appDaRota(rota)
  let id = idDa(arquivo, funcao, app)
  if (!id) {
    await page.goto(rota)
    await page.waitForLoadState('networkidle')
    id = idDa(arquivo, funcao, app)
  }
  if (!id) throw new Error(`action ${arquivo}#${funcao} não está em manifesto nenhum depois de abrir ${rota}`)

  const corpo = JSON.stringify(args.map(a => (a === undefined ? '$undefined' : a)))
  const destino = app === 'web' ? new URL(rota, 'http://localhost').pathname : rota
  const r = await page.request.post(destino, {
    headers: { 'next-action': id, accept: 'text/x-component', 'content-type': 'text/plain;charset=UTF-8' },
    data: corpo,
  })
  const texto = await r.text()
  // O Next responde 200 com este texto quando a rota não tem a action (ela só
  // existe nas rotas cujas PÁGINAS a usam). Uma recusa testada assim "passa"
  // sem ter chegado à action — o teste precisa quebrar, não concordar.
  if (texto.includes('Server action not found')) {
    throw new Error(`${arquivo}#${funcao} não existe em ${rota}: poste numa página que usa a action`)
  }
  return { status: r.status(), texto }
}
