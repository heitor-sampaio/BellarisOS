import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  ABAS_DE_CONFIGURACAO, ABAS_DA_UNIDADE, motivoDaAbaFechada, linkDaAbaNaRede, abasSoDaRede,
} from '@/lib/configuracoes/abas'
import { PROXIMOS_PASSOS } from '@/lib/setup/proximos-passos'
import { ADMIN_MENU, BRANCH_MENU, menuDaUnidadeFor, SO_NO_MENU_DA_REDE } from '@/lib/menu'
import { paginasDaBusca } from '@/lib/busca/paginas'
import { ALL_PERMISSIONS, NO_PERMISSIONS } from '@/lib/permissions'
import { minimoEhDoCadastro, rotuloDoMinimo } from '@/lib/estoque/situacao'

/**
 * A 14ª simulação (2026-11-12/13), F74 — Configurações, menu e estoque.
 *
 * A1 (princípio 7 e CLAUDE.md §1, "otimize para a clínica única"): a dona da
 * clínica, no portal da unidade, lia "A aba Comissões fica nas Configurações
 * da clínica. Abrimos Unidade." sem link, e Automações, Campanhas, Anúncios e
 * Templates só existiam no menu de /admin. A REGRA é uma — "quem é da rede, no
 * portal da unidade, chega ao que só a rede tem" — e mora em três lugares: o
 * menu da unidade, a busca e a tela de Configurações. Os três leem a mesma
 * lista (o que a rede tem e a unidade não).
 */
const gerenciaTudo = () => true

describe('A1: quem é da rede chega, pelo portal da unidade, ao que só a rede tem', () => {
  it('a aba que só existe na rede leva a /admin para quem é da rede, e não para quem tem unidade fixa', () => {
    expect(linkDaAbaNaRede('comissoes', { noPortal: ABAS_DA_UNIDADE, unidadeFixa: false }))
      .toEqual({ href: '/admin/settings?tab=comissoes', rotulo: 'Abrir Comissões e taxas nas Configurações da rede' })
    expect(linkDaAbaNaRede('commissions', { noPortal: ABAS_DA_UNIDADE, unidadeFixa: false })?.href, 'o apelido é a mesma aba')
      .toBe('/admin/settings?tab=comissoes')
    expect(linkDaAbaNaRede('comissoes', { noPortal: ABAS_DA_UNIDADE, unidadeFixa: true }), 'unidade fixa não entra em /admin').toBeNull()
    expect(linkDaAbaNaRede('tags', { noPortal: ABAS_DA_UNIDADE, unidadeFixa: false }), 'a aba da unidade abre aqui mesmo').toBeNull()
  })

  it('o aviso da aba fechada não promete o que o link já faz: diz onde fica', () => {
    const motivo = motivoDaAbaFechada('comissoes', {
      noPortal: ABAS_DA_UNIDADE, gerencia: gerenciaTudo, noPlano: () => true, unidadeFixa: false,
      nomeDoModulo: m => m, abriu: 'Unidade',
    })
    expect(motivo).toBe('A aba Comissões e taxas fica nas Configurações da rede. Abrimos Unidade.')
  })

  it('as abas que só a rede tem, para a lista "Na clínica toda" da unidade — com a permissão e o plano de cada uma', () => {
    const todas = abasSoDaRede(gerenciaTudo, null).map(a => a.key)
    expect(todas).toEqual(expect.arrayContaining(['comissoes', 'fidelidade', 'lgpd', 'assinatura']))
    expect(todas.some(k => ABAS_DA_UNIDADE.includes(k)), 'nenhuma aba que a unidade já tem').toBe(false)
    expect(abasSoDaRede(m => m === 'financial', null).map(a => a.key)).toEqual(['comissoes'])
    expect(abasSoDaRede(gerenciaTudo, { funcionalidades: [] }).map(a => a.key)).not.toContain('fidelidade')
    for (const a of abasSoDaRede(gerenciaTudo, null)) expect(a.href).toBe(`/admin/settings?tab=${a.key}`)
  })

  it('o menu da unidade de quem é da rede traz as entradas que só a rede tem, levando a /admin', () => {
    const daRede = menuDaUnidadeFor(ALL_PERMISSIONS, null, {}, { base: '/centro', daRede: true })
    const todas = daRede.flatMap(s => s.entries)
    expect(todas.find(e => e.key === 'automations')?.href).toBe('/admin/automacoes')
    expect(todas.find(e => e.key === 'notificacoes')?.href).toBe('/admin/notificacoes')
    expect(todas.find(e => e.key === 'agenda')?.href, 'as da unidade seguem na unidade').toBe('/centro/agenda')
    expect(daRede.find(s => s.key === 'marketing')?.entries.map(e => e.key)).toEqual(['notificacoes', 'marketing', 'templates'])

    const fixa = menuDaUnidadeFor(ALL_PERMISSIONS, null, {}, { base: '/centro', daRede: false }).flatMap(s => s.entries)
    expect(fixa.some(e => e.href.startsWith('/admin')), 'quem tem unidade fixa não entra em /admin').toBe(false)
    expect(menuDaUnidadeFor(NO_PERMISSIONS, null, {}, { base: '/centro', daRede: true }).flatMap(s => s.entries).map(e => e.key))
      .toEqual(['dashboard'])
  })

  it('a trava: TODA entrada do menu da rede chega ao menu da unidade de quem é da rede (pela unidade ou por /admin)', () => {
    const chaves = new Set(menuDaUnidadeFor(ALL_PERMISSIONS, null, {}, { base: '/x', daRede: true }).flatMap(s => s.entries).map(e => e.key))
    for (const e of ADMIN_MENU) expect(chaves.has(e.key), e.key).toBe(true)
    expect(SO_NO_MENU_DA_REDE.every(e => !BRANCH_MENU.some(b => b.key === e.key))).toBe(true)
  })

  it('a busca da unidade acha as mesmas entradas de quem é da rede', () => {
    const paginas = paginasDaBusca('centro', ALL_PERMISSIONS, null, {}, { daRede: true })
    expect(paginas.find(p => p.key === 'automations')?.href).toBe('/admin/automacoes')
    const fixa = paginasDaBusca('centro', ALL_PERMISSIONS, null, {}, { daRede: false })
    expect(fixa.find(p => p.key === 'automations')).toBeUndefined()
  })

  it('as sidebars montam o menu da unidade por menuDaUnidadeFor (ninguém refaz a regra à mão)', () => {
    const sidebar = readFileSync(join(__dirname, '../components/branch/sidebar.tsx'), 'utf8')
    expect(sidebar).toContain('menuDaUnidadeFor(')
    expect(sidebar).not.toMatch(/menuSectionsFor\(BRANCH_MENU/)
  })
})

describe('A2: as taxas moram numa aba que diz que tem taxa', () => {
  it('a aba das comissões se chama "Comissões e taxas"', () => {
    expect(ABAS_DE_CONFIGURACAO.find(a => a.key === 'comissoes')?.label).toBe('Comissões e taxas')
  })
  it('o próximo passo do setup diz o nome da aba a que leva', () => {
    const passo = PROXIMOS_PASSOS.find(p => p.href === '/admin/settings?tab=comissoes')!
    expect(passo.titulo).toBe('Taxas da maquininha')
    expect(passo.porque).toContain('Comissões e taxas')
  })
  it('nenhum texto da tela manda a "Configurações → Comissões" sem o "e taxas"', () => {
    const achados: string[] = []
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome)
        if (statSync(caminho).isDirectory()) { varrer(caminho); continue }
        if (!/\.tsx$/.test(nome)) continue
        readFileSync(caminho, 'utf8').split('\n').forEach((linha, i) => {
          const semComentario = linha.replace(/\/\/.*$/, '').replace(/\{\/\*.*?\*\/\}/g, '')
          if (/^\s*\*/.test(linha)) return
          if (/Configurações → Comissões(?! e taxas)/.test(semComentario)) achados.push(`${caminho}:${i + 1}`)
        })
      }
    }
    varrer(join(__dirname, '../components'))
    varrer(join(__dirname, '../app'))
    expect(achados).toEqual([])
  })
})

describe('A15: o mínimo diz quando é o do cadastro', () => {
  it('a unidade com o mínimo igual ao do cadastro diz "(do cadastro)"; o dela, não', () => {
    expect(minimoEhDoCadastro(5, 5)).toBe(true)
    expect(minimoEhDoCadastro(3, 5)).toBe(false)
    expect(minimoEhDoCadastro(5, null)).toBe(false)
    expect(minimoEhDoCadastro(0, 0), 'sem mínimo, não há o que dizer').toBe(false)
    expect(rotuloDoMinimo({ quantidade: 5, unidade: 'seringa' }, true)).toBe('5 seringas (do cadastro)')
    expect(rotuloDoMinimo({ quantidade: 3, unidade: 'un' }, false)).toBe('3 un')
  })

  it('a trava: todo lugar que escreve o mínimo (minimoParaMostrar) o escreve por rotuloDoMinimo', () => {
    const achados: string[] = []
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome)
        if (statSync(caminho).isDirectory()) { varrer(caminho); continue }
        if (!/\.tsx?$/.test(nome) || caminho.endsWith(join('estoque', 'situacao.ts'))) continue
        const texto = readFileSync(caminho, 'utf8')
        if (/formatarQuantidadeComUnidade\(minimoParaMostrar\(/.test(texto)) achados.push(caminho)
      }
    }
    for (const d of ['../components', '../app', '../lib']) varrer(join(__dirname, d))
    expect(achados).toEqual([])
  })
})
