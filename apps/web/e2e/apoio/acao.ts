import type { Page, Request, APIResponse } from '@playwright/test'

/**
 * Capturar uma chamada de server action feita pela tela e REENVIÁ-LA mudada.
 *
 * É o ataque de verdade contra uma action: todo export de um arquivo
 * `'use server'` é endpoint público, e a tela só mostra o que a pessoa pode ver
 * — não o que ela pode PEDIR. Quem abre o DevTools pega a chamada legítima,
 * troca o id e manda de novo. Nenhuma tela oferece isso, então o furo só
 * aparece num teste que faça o mesmo (`e2e/crm-alcance-por-id.spec.ts` foi o
 * primeiro).
 *
 * O corpo é tratado como BYTES lidos em latin1, não como texto: com arquivo
 * anexado (`multipart/form-data`) o `postData()` do Playwright pode vir vazio,
 * e um binário convertido para UTF-8 e de volta se corromperia. Em latin1 cada
 * byte vira um caractere e volta igual; os ids trocados são ASCII.
 *
 * Uso:
 *   const chamada = capturarAcao(page, corpo => corpo.includes(meuId))
 *   await page.getByRole('button', { name: 'Ganha' }).click()
 *   await reenviarAcao(page, await chamada, [[meuId, idAlheio]])
 */

function corpoDe(req: Request): string {
  return req.postDataBuffer()?.toString('latin1') ?? ''
}

/** Espera a próxima server action cujo corpo satisfaça `casa`. Chame ANTES do clique. */
export function capturarAcao(page: Page, casa: (corpo: string) => boolean): Promise<Request> {
  return page.waitForRequest(r =>
    r.method() === 'POST' && !!r.headers()['next-action'] && casa(corpoDe(r)))
}

/** Reenvia a chamada com as trocas de texto no corpo (ids, valores). */
export async function reenviarAcao(
  page: Page,
  req: Request,
  trocas: [de: string, para: string][],
): Promise<APIResponse> {
  let corpo = corpoDe(req)
  for (const [de, para] of trocas) corpo = corpo.replaceAll(de, para)
  const h = req.headers()
  return page.request.post(req.url(), {
    headers: {
      'next-action': h['next-action']!,
      'next-router-state-tree': h['next-router-state-tree'] ?? '',
      'content-type': h['content-type'] ?? 'text/plain;charset=UTF-8',
      accept: h['accept'] ?? 'text/x-component',
    },
    data: Buffer.from(corpo, 'latin1'),
  })
}
