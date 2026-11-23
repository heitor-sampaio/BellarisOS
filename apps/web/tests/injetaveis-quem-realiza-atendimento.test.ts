import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Os injetáveis são de quem realiza o atendimento (o Heitor, 2026-11-23: "o
 * mapa de injetaveis é pra quem realiza atendimento"; à proposta "criar e
 * editar o plano (planejamento) de injetáveis e registrar a aplicação:
 * Atendimento em Gerenciar; ver os planos e mapas: Prontuário em Ver",
 * respondeu "ok"). Revê o UM4 de 23/11, que punha os injetáveis no Prontuário
 * em Gerenciar. "Quem realiza atendimento" é a PERMISSÃO — o Atendimento em
 * Gerenciar —, não o "Atende" da Equipe (UM5).
 */

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

const ACOES = fonte('actions/injectable-map.ts')
function corpo(nome: string): string {
  const ini = ACOES.indexOf(`export async function ${nome}`)
  expect(ini, `a action ${nome} existe`).toBeGreaterThan(-1)
  const prox = ACOES.indexOf('\nexport async function ', ini + 1)
  return ACOES.slice(ini, prox === -1 ? undefined : prox)
}

describe('as actions que GRAVAM os injetáveis pedem o Atendimento em Gerenciar', () => {
  for (const nome of [
    'criarPlanejamentoInjetavel',
    'salvarPlanejamentoInjetavel',
    'renomearPlanejamentoInjetavel',
    'vincularClienteAoPlanejamento',
    'registrarAplicacao',
  ]) {
    it(nome, () => {
      const c = corpo(nome)
      expect(c).toContain("assertPermission(ctx, 'atendimento', 'MANAGE')")
      expect(c).not.toContain("'medical_records', 'MANAGE'")
      expect(c).toContain("assertRecurso(ctx, 'injetaveis')")
    })
  }
})

describe('as que só LEEM seguem o Prontuário em Ver', () => {
  for (const nome of [
    'getPlanejamentoInjetavel',
    'listarPlanejamentosDoCliente',
    'listarMapasDeInjetaveis',
    'dosesDoMapaDoAtendimento',
  ]) {
    it(nome, () => {
      const c = corpo(nome)
      expect(c).toContain("assertPermission(ctx, 'medical_records', 'VIEW')")
      expect(c).not.toContain("'atendimento', 'MANAGE'")
    })
  }
})

describe('a tela oferece criar, editar e registrar a quem tem o Atendimento em Gerenciar', () => {
  it('o detalhe e a lista de Injetáveis', () => {
    for (const arq of ['app/_shared/detalhe-de-injetavel.tsx', 'app/_shared/lista-de-injetaveis.tsx']) {
      const f = fonte(arq)
      expect(f, arq).toContain("podeEditar={can(ctx, 'atendimento', 'MANAGE')}")
      expect(f, arq).not.toContain("'medical_records', 'MANAGE'")
      // E a tela continua abrindo com o Prontuário em Ver.
      expect(f, arq).toContain("'medical_records', 'VIEW'")
    }
  })
  it('a ficha da cliente: o planejamento de injetáveis pelo Atendimento em Gerenciar', () => {
    for (const arq of ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']) {
      expect(fonte(arq), arq).toContain("podeEditarInjetaveis={can(ctx, 'atendimento', 'MANAGE')}")
    }
    expect(fonte('components/branch/client-profile.tsx')).toContain('podeEditarInjetaveis={podeEditarInjetaveis}')
  })
  it('o atendimento: o painel e o campo do planejador da ficha', () => {
    const s = fonte('components/branch/appointment-session.tsx')
    expect(s).toContain('podeEditarInjetaveis={canManage}')
    expect(s).not.toMatch(/<PainelPlanejamento[\s\S]{0,400}podeEditar=\{canEditRecords\}/)
    expect(s.match(/injetaveis=\{\{ clientId: client\.id, branchId, produtos: produtosDoMapa, podeEditar: canManage \}\}/g)).toHaveLength(2)
    const r = fonte('components/branch/anamnesis-form-renderer.tsx')
    expect(r).toContain('podeEditar={injetaveis.podeEditar === true}')
  })
  it('o painel do planejamento separa o mapa do plano', () => {
    const p = fonte('components/branch/painel-planejamento.tsx')
    expect(p).toContain('podeEditar={podeEditarInjetaveis}')
  })
})

describe('a matriz de Cargos diz isso', () => {
  it('Atendimento em Gerenciar: os injetáveis; Prontuário em Ver: os mapas', async () => {
    const { LEVEL_COPY } = await import('@/lib/permissions-copy')
    expect(LEVEL_COPY.atendimento.MANAGE).toMatch(/injetáveis/)
    expect(LEVEL_COPY.medical_records.VIEW).toMatch(/injetáveis/)
    expect(LEVEL_COPY.medical_records.MANAGE).not.toMatch(/injetáveis/)
  })
})
