import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ALL_PERMISSIONS, NO_PERMISSIONS } from '@/lib/permissions'
import type { ResolvedPermissions } from '@/lib/permissions'
import { menuDaUnidadeFor, menuDaRedeFor } from '@/lib/menu'
import { paginasDaBusca } from '@/lib/busca/paginas'
import { ABAS_DA_UNIDADE, motivoDaAbaFechada, rotuloDasAbasAlcancadas, ABAS_DA_REDE } from '@/lib/configuracoes/abas'
import { CONFIG_DA_REDE } from '@/lib/configuracao-da-rede'
import { modulosAcimaDoMeu } from '@/lib/equipe/cargo-acima'
import { caminhoDaAbaLgpd } from '@/lib/lgpd/caminho-da-aba'

/**
 * As sobras da "configuração da rede toda só pela conta admin" (o Heitor,
 * 18/11; CLAUDE.md §11) que a 25ª simulação achou, e a LGPD na unidade (D8).
 * Regra da tela: "Botão que a pessoa não pode usar: a tela esconde" (§14).
 */
const WEB = join(__dirname, '..')
const ler = (rel: string) => readFileSync(join(WEB, rel), 'utf8')
const com = (p: Partial<ResolvedPermissions>): ResolvedPermissions => ({ ...NO_PERMISSIONS, ...p })

describe('A-CONF1: quem não é a Admin da rede e só chegaria às abas da rede toda não vê Configurações', () => {
  const soClientesECrm = com({ clients: 'MANAGE', crm: 'MANAGE' })
  const naUnidade = (p: ResolvedPermissions, adminDaRede: boolean) =>
    menuDaUnidadeFor(p, null, undefined, { base: '/centro', daRede: true, adminDaRede }).flatMap(s => s.entries).some(e => e.key === 'settings')
  const naRede = (p: ResolvedPermissions, adminDaRede: boolean) =>
    menuDaRedeFor(p, null, undefined, { adminDaRede }).flatMap(s => s.entries).some(e => e.key === 'settings')

  it('o menu da unidade e o da rede escondem o item de quem tem "A rede inteira" sem ser a Admin', () => {
    expect(naUnidade(soClientesECrm, false)).toBe(false)
    expect(naRede(soClientesECrm, false)).toBe(false)
    expect(naRede(com({ financial: 'MANAGE' }), false), 'Comissões e taxas é da rede toda').toBe(false)
    expect(naRede(com({ roles: 'MANAGE', forms: 'MANAGE', documents: 'MANAGE' }), false)).toBe(false)
  })
  it('a Admin da rede segue vendo; quem tem Configurações em Gerenciar também (a aba Unidade, a LGPD)', () => {
    expect(naUnidade(ALL_PERMISSIONS, true)).toBe(true)
    expect(naRede(ALL_PERMISSIONS, true)).toBe(true)
    expect(naUnidade(com({ settings: 'MANAGE' }), false)).toBe(true)
  })
  it('a busca não oferece a tela a quem só chegaria a recusas, nos dois portais', () => {
    const rede = paginasDaBusca(null, soClientesECrm, null, { adminDaRede: false }).map(p => p.key)
    expect(rede).not.toContain('settings')
    expect(rede).not.toContain('settings:tags')
    const unidade = paginasDaBusca('centro', soClientesECrm, null, { daRede: true, adminDaRede: false }).map(p => p.key)
    expect(unidade).not.toContain('settings')
    expect(paginasDaBusca(null, soClientesECrm, null, { adminDaRede: true }).map(p => p.key)).toContain('settings')
  })
  it('a barra da rede e a da unidade passam o cargo de sistema, não a abrangência', () => {
    expect(ler('components/admin/sidebar.tsx')).toMatch(/menuDaRedeFor\(/)
    expect(ler('app/admin/layout.tsx')).toMatch(/<AdminSidebar[^>]*adminDaRede=\{mexeNaConfigDaRede\(ctx\)\}/)
    expect(ler('app/[slug]/layout.tsx')).toMatch(/adminDaRede=\{mexeNaConfigDaRede\(ctx\)\}[\s\S]*?\/>/)
    expect(ler('components/branch/sidebar.tsx')).toMatch(/menuDaUnidadeFor\([^)]*adminDaRede/)
  })
  it('o resumo do cargo ("O que essa pessoa vai ver") não lista Configurações nem "Tags e importações"', () => {
    const editor = ler('components/admin/roles-editor.tsx')
    expect(editor).toMatch(/soLeriaAsConfiguracoes\(permissions, false\)/)
    expect(rotuloDasAbasAlcancadas(ABAS_DA_REDE, m => m === 'clients' || m === 'medical_records', { soAsDela: true }))
      .toBe('Configurações (só LGPD)')
  })
})

describe('A-CONF2: a aba da rede toda diz que é só da Admin da rede, não "pede X em Gerenciar"', () => {
  const base = {
    noPortal: ABAS_DA_UNIDADE, gerencia: (m: string) => m === 'settings', noPlano: () => true, unidadeFixa: false,
    nomeDoModulo: (m: string) => m, abriu: 'Unidade',
  } as Parameters<typeof motivoDaAbaFechada>[1]
  it('quem não é a Admin lê a frase da regra e quem muda', () => {
    const motivo = motivoDaAbaFechada('tags', { ...base, souAdmin: false, quemMuda: ['Ana', 'Bia'] })!
    expect(motivo).toContain(CONFIG_DA_REDE)
    expect(motivo).toContain('Quem muda: Ana e Bia.')
    expect(motivo).not.toContain('Gerenciar')
  })
  it('a Admin (que tem tudo) e a aba da unidade seguem a regra de antes', () => {
    expect(motivoDaAbaFechada('tags', { ...base, souAdmin: true })).toContain('em Gerenciar')
  })
  it('a tela passa o cargo de sistema', () => {
    expect(ler('app/_shared/configuracoes.tsx')).toMatch(/motivoDaAbaFechada\(requested, \{[\s\S]*?souAdmin: mexeNaConfigDaRede\(ctx\)/)
  })
})

describe('A-CONF3: Automações, Templates e as dicas de tag dizem que é da Admin da rede', () => {
  it('a lista de automações recebe o aviso da rede, como as campanhas', () => {
    const pagina = ler('app/admin/automacoes/page.tsx')
    expect(pagina).toMatch(/avisoDaRede/)
    expect(pagina).toMatch(/CONFIG_DA_REDE/)
    expect(ler('components/admin/automacoes/lista.tsx')).toMatch(/avisoDaRede/)
  })
  it('o editor não diz "pronto para ligar" a quem não liga', () => {
    const editor = ler('components/admin/automacoes/editor.tsx')
    expect(editor).toMatch(/<ListaDeProblemas[^>]*podeLigar=/)
    expect(editor).toContain('ligar é da Admin da rede')
  })
  it('Templates: editar pede a Admin da rede, e o link de Integrações também', () => {
    const pagina = ler('app/admin/templates/page.tsx')
    expect(pagina).toMatch(/podeEditar=\{[^}]*mexeNaConfigDaRede\(ctx\)/)
    expect(pagina).toMatch(/avisoDaRede/)
    expect(ler('components/admin/templates-manager.tsx')).toContain('peça à Admin da rede')
    expect(ler('components/admin/automacoes/painel-do-no.tsx')).toContain('Quem conecta é a Admin da rede')
  })
  it('as dicas de tag dizem quem cria', () => {
    for (const arq of ['components/shared/tag-picker.tsx', 'components/branch/crm-lead-modal.tsx']) {
      expect(ler(arq), arq).toContain('a Admin da rede cria em Configurações → Tags')
    }
  })
})

describe('A-CONF5: o cargo acima não conta módulo fora do plano da rede', () => {
  it('Copilot fora do plano não entra na lista', () => {
    const ctx = {
      permissions: { ...ALL_PERMISSIONS, copilot: 'NONE' } as ResolvedPermissions,
      reportTabs: [],
      plano: { funcionalidades: [], limites: { unidades: null, membros: null, whatsapp: null } },
    }
    expect(modulosAcimaDoMeu(ctx as never, [{ module: 'copilot', level: 'VIEW' }], [])).toEqual([])
  })
  it('dentro do plano, segue contando', () => {
    const ctx = { permissions: { ...ALL_PERMISSIONS, copilot: 'NONE' } as ResolvedPermissions, reportTabs: [], plano: null }
    expect(modulosAcimaDoMeu(ctx as never, [{ module: 'copilot', level: 'VIEW' }], [])).toEqual(['Copilot'])
  })
})

describe('D8: quem tem o Prontuário em Gerenciar chega à aba LGPD na unidade', () => {
  it('a unidade oferece a aba LGPD', () => {
    expect(ABAS_DA_UNIDADE).toContain('lgpd')
  })
  it('o menu da unidade mostra Configurações só com o Prontuário em Gerenciar', () => {
    const entradas = menuDaUnidadeFor(com({ medical_records: 'MANAGE' }), null, undefined, { base: '/centro', daRede: false, adminDaRede: false })
      .flatMap(s => s.entries)
    expect(entradas.find(e => e.key === 'settings')?.label).toBe('Configurações')
  })
  it('o aviso do pedido leva quem responde à aba do portal dela', () => {
    expect(caminhoDaAbaLgpd({ branchId: 'b1', permissions: com({ medical_records: 'MANAGE' }) }, 'centro'), 'quem libera, na unidade')
      .toBe('/centro/settings?tab=lgpd')
    expect(caminhoDaAbaLgpd({ branchId: null, permissions: com({ medical_records: 'MANAGE' }) }, null)).toBe('/admin/settings?tab=lgpd')
    expect(caminhoDaAbaLgpd({ branchId: 'b1', permissions: com({ clients: 'VIEW' }) }, 'centro'), 'quem não responde').toBeNull()
  })
  it('o aviso do pedido chega também a quem responde na unidade (não só a quem tem "A rede inteira")', () => {
    const fonte = ler('lib/lgpd/aviso-do-pedido.ts')
    expect(fonte).not.toMatch(/\.is\('branch_id', null\)/)
    expect(ler('app/[slug]/clients/[id]/page.tsx')).toMatch(/pedidoLgpdDaFicha\(ctx, id, slug\)/)
  })
})
