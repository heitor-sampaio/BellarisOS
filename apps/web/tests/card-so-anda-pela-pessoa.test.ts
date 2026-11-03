import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * r2-cfg-04 (o Heitor, 2026-11-03): "nenhum card se movimenta sozinho, toda e
 * qualquer automação deve ser feita através dos módulos de automações".
 *
 * A etapa de uma oportunidade (`leads.crm_stage_id`) só muda por:
 * - a PESSOA: `moverEtapaCore` (lib/crm/oportunidade.ts — o arraste, o painel
 *   do inbox, o modal, o Copilot a pedido dela) e `updateLead` (actions/leads.ts,
 *   o modal do card);
 * - uma AUTOMAÇÃO da clínica: `moverDeEtapa`/`marcarDesfecho`
 *   (lib/automacoes/acoes-crm.ts).
 * Gravar a etapa em qualquer outro arquivo é o card andando sozinho por um
 * fato do sistema (agendar, concluir, pagar, a conversa nova) — o crm-05 de
 * volta. Criar a oportunidade (o insert, com a etapa inicial) não é mover.
 */

const RAIZ = join(__dirname, '..')
const PERMITIDOS = new Set(['actions/leads.ts', 'lib/automacoes/acoes-crm.ts', 'lib/crm/oportunidade.ts'])
const GRAVA_A_ETAPA = [
  /\.update\(\s*\{[^)]*?\bcrm_stage_id\b/,      // .update({ crm_stage_id: … }) — o [^)] já atravessa as linhas
  /\b\w+\.crm_stage_id\s*=(?!=)/,               // patch.crm_stage_id = …
  /\bconst\s+\w+\s*=\s*\{\s*crm_stage_id\s*:|\?\s*\{\s*crm_stage_id\s*:/, // const patch = { crm_stage_id: … } (ou num ternário)
]

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) { if (nome !== 'node_modules' && nome !== '.next') arquivos(caminho, saida) }
    else if (/\.(ts|tsx)$/.test(nome)) saida.push(caminho)
  }
  return saida
}

describe('o card só anda pela pessoa ou por uma automação da clínica (r2-cfg-04)', () => {
  it('nenhum outro arquivo grava a etapa da oportunidade', () => {
    const gravam = ['app', 'actions', 'lib', 'components']
      .flatMap(d => arquivos(join(RAIZ, d)))
      .filter(f => GRAVA_A_ETAPA.some(r => r.test(readFileSync(f, 'utf8'))))
      .map(f => relative(RAIZ, f).split(sep).join('/'))
    expect(gravam.filter(f => !PERMITIDOS.has(f))).toEqual([])
    // E os três de sempre continuam achados (a trava não ficou cega).
    expect(gravam.sort()).toEqual([...PERMITIDOS].sort())
  })
})
