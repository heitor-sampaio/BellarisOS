import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InjetavelVazio } from '@/app/_shared/injetavel-vazio'

/**
 * O que a ficha da cliente e a tela do atendimento OFERECEM, pela permissão de
 * quem está nelas (CLAUDE.md §11, "Cada passo do atendimento, um módulo", e
 * §14: "Botão que a pessoa não pode usar (…): a tela esconde"), e o que mostram
 * (princípio 3: o que a tela mostra é o que vale).
 */

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const FICHAS = ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']

describe('a ficha de saúde na ficha da cliente: responde quem tem o Prontuário em Gerenciar (UM4)', () => {
  it('a action pede o Prontuário em Gerenciar', () => {
    const a = fonte('actions/pre-atendimento.ts')
    const ini = a.indexOf('export async function salvarAnamneseGeral')
    expect(a.slice(ini, ini + 400)).toContain("assertPermission(ctx, 'medical_records', 'MANAGE')")
  })
  it('as duas fichas passam a permissão e a ficha de saúde ATUAL da rede', () => {
    for (const arq of FICHAS) {
      const f = fonte(arq)
      expect(f, arq).toContain("podeEditarFichaDeSaude={can(ctx, 'medical_records', 'MANAGE') && canViewRecords}")
      expect(f, arq).toContain('fichaDeSaudeAtual={')
    }
  })
  it('a aba Prontuário deixa responder (não é sempre canEdit={false})', () => {
    const p = fonte('components/branch/client-profile.tsx')
    const aba = p.slice(p.indexOf("{tab === 'fichas' && ("), p.indexOf("{tab === 'fichas' && (") + 3000)
    expect(aba).toContain('canEdit={!!fichaDeSaudeParaEditar}')
  })
})

describe('o editor do plano: monta quem tem o Atendimento em Gerenciar (UM3)', () => {
  it('o editor tem o modo só leitura pela permissão', () => {
    const e = fonte('components/branch/treatment-plan-editor.tsx')
    expect(e).toMatch(/const isPlanLocked = !podeEditar \|\|/)
  })
  it('na tela do atendimento, todo editor do plano recebe a permissão de montar', () => {
    const s = fonte('components/branch/appointment-session.tsx')
    const editores = s.split(/<TreatmentPlanEditor\s/).slice(1).map(t => t.slice(0, 900))
    expect(editores.length).toBeGreaterThan(0)
    for (const e of editores) expect(e).toContain('podeEditar={montaPlanoNaUnidade}')
  })
  it('na janela Planejamento (ficha e atendimento), o editor recebe quem monta', () => {
    const t = fonte('components/branch/planejamento-tratamento.tsx')
    const ini = t.search(/<TreatmentPlanEditor\s/)
    const e = t.slice(ini, ini + 900)
    expect(e).toContain('podeEditar={podeEditar}')
  })
})

describe('os injetáveis: "ou comece um novo" só a quem grava o mapa', () => {
  it('quem não grava não é convidado a começar', () => {
    const html = renderToStaticMarkup(createElement(InjetavelVazio, { podeEditar: false }))
    expect(html).not.toContain('comece um novo')
    expect(html).toContain('Escolha um planejamento ao lado')
  })
  it('quem grava é', () => {
    expect(renderToStaticMarkup(createElement(InjetavelVazio, { podeEditar: true }))).toContain('ou comece um novo')
  })
  it('as duas páginas passam o Atendimento em Gerenciar com o Prontuário em Ver', () => {
    for (const arq of ['app/[slug]/injetaveis/page.tsx', 'app/admin/injetaveis/page.tsx']) {
      expect(fonte(arq), arq).toContain("podeEditar={can(ctx, 'atendimento', 'MANAGE') && can(ctx, 'medical_records', 'VIEW')}")
    }
  })
})

describe('"Editar o cadastro" na janela da ficha de saúde: só com Clientes em Gerenciar', () => {
  it('a situação diz se edita, e a tela só mostra o atalho a quem edita', () => {
    expect(fonte('actions/pre-atendimento.ts')).toContain("podeEditarCadastro: can(ctx, 'clients', 'MANAGE')")
    const c = fonte('components/branch/pre-atendimento-do-agendamento.tsx')
    expect(c).toMatch(/situacao\.podeEditarCadastro && situacao\.clienteId && \(\s*<Link/)
  })
})

describe('a evolução do atendimento concluído se LÊ (A30; PR2a/PR2b)', () => {
  it('os campos da avaliação travada têm a cara do só leitura', () => {
    const s = fonte('components/branch/appointment-session.tsx')
    for (const id of ['avaliacao-evolucao', 'avaliacao-intercorrencias']) {
      const t = s.slice(s.indexOf(`id="${id}"`), s.indexOf(`id="${id}"`) + 500)
      expect(t, id).toContain('editLocked ? CAMPO_SO_LEITURA')
    }
  })
})

describe('a tag mostra o nome que a rede deu (CLAUDE.md §1, Tags)', () => {
  it('nada de "VIP · Ouro" nem tag tratada pelo nome no código', () => {
    const p = fonte('components/branch/client-profile.tsx')
    expect(p).not.toContain('VIP · Ouro')
    expect(p).not.toMatch(/tag === 'VIP'/)
  })
})

describe('a ficha de id de outra rede ou inexistente é 404, não "Algo deu errado"', () => {
  it('a ficha da unidade lê a cliente com maybeSingle', () => {
    const f = fonte('app/[slug]/clients/[id]/page.tsx')
    const q = f.slice(f.indexOf(".from('clients')"), f.indexOf(".from('clients')") + 200)
    expect(q).toContain('.maybeSingle()')
    expect(q).not.toContain('.single()')
  })
})

describe('a linha do tempo diz a hora do aceite gravada (princípio 3)', () => {
  it('o plano aceito usa aceito_em, não o updated_at', () => {
    for (const arq of FICHAS) {
      const f = fonte(arq)
      expect(f, arq).toMatch(/date: plan\.aceito_em \?\? plan\.updated_at \?\? plan\.created_at[\s\S]{0,80}type: 'PLAN_ACCEPTED'/)
    }
    expect(fonte('lib/cached-queries.ts')).toContain("select('id, status, created_at, updated_at, aceito_em, name, cancelado_em")
  })
})
