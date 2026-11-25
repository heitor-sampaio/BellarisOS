import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O "Quem receberia hoje" do detalhe da campanha é só leitura: pede o
 * Marketing em Ver (CLAUDE.md §11, o Heitor, 23/11: "Quem tem o módulo em Ver
 * vê tudo"; PU-07 do catálogo das Automações, revisão de 24/11). Pedia o
 * Gerenciar — na tela e na contagem (`previewAudienceCount`), que não grava nada.
 */
const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')

describe('"Quem receberia hoje" com o Marketing em Ver', () => {
  it('a tela mostra a quem tem o Marketing em Ver', () => {
    const t = fonte('app/admin/notificacoes/[id]/page.tsx')
    expect(t).toMatch(/const mostraQuemReceberia = can\(ctx, 'marketing', 'VIEW'\)/)
  })
  it('a contagem do público (só lê) pede o Ver', () => {
    const t = fonte('actions/notification-campaigns.ts')
    const ini = t.indexOf('export async function previewAudienceCount(')
    const corpo = t.slice(ini, t.indexOf('\n}\n', ini))
    expect(corpo).toMatch(/assertPermission\(ctx, 'marketing', 'VIEW'\)/)
    expect(corpo).not.toMatch(/'MANAGE'/)
  })
})
