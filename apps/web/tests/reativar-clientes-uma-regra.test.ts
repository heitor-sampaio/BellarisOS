import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * r3-f13-10 (o Heitor, revisão de 2026-11-03: "os dois têm de dar a mesma
 * resposta"): o "Reativar clientes" do dashboard (os dois portais) e o do
 * Copilot ("quem eu devo reativar?") são UMA regra — na clínica de uma
 * unidade, todas as clientes ativas, com ou sem a tag da unidade; com várias,
 * a unidade escolhida pela tag dela, ou a clínica inteira (sem visita em
 * nenhuma unidade). A regra mora em `getClientesParaReativarDoRecorte`
 * (`lib/metrics/unidade.ts`), e ninguém fora de lá escolhe entre a conta da
 * unidade e a da rede — era assim que o Copilot ficou de fora do r2-ind-03.
 */

const RAIZ = join(__dirname, '..')

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) { if (nome !== 'node_modules' && nome !== '.next') arquivos(caminho, saida) }
    else if (/\.(ts|tsx)$/.test(nome)) saida.push(caminho)
  }
  return saida
}

const codigo = ['app', 'actions', 'lib', 'components'].flatMap(d => arquivos(join(RAIZ, d)))
  .map(f => ({ arquivo: relative(RAIZ, f).split(sep).join('/'), texto: readFileSync(f, 'utf8') }))

describe('"Reativar clientes": uma regra só para o dashboard e o Copilot (r3-f13-10)', () => {
  it('fora de lib/metrics/unidade.ts, ninguém chama a conta da unidade ou a da rede direto', () => {
    const diretos = codigo
      .filter(c => c.arquivo !== 'lib/metrics/unidade.ts')
      .filter(c => /\bgetClientesParaReativar(DaRede)?\s*\(/.test(c.texto))
      .map(c => c.arquivo)
    expect(diretos).toEqual([])
  })

  it('os dois dashboards e o Copilot passam pela regra do recorte', () => {
    for (const arquivo of ['app/admin/dashboard/page.tsx', 'app/[slug]/dashboard/page.tsx', 'lib/copilot/ferramentas/clientes.ts']) {
      const c = codigo.find(x => x.arquivo === arquivo)
      expect(c?.texto, arquivo).toMatch(/\bgetClientesParaReativarDoRecorte\s*\(/)
    }
  })
})
