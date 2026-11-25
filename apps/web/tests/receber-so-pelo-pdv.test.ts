import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'

/**
 * Receber é só do PDV (PV-04 do catálogo de Vendas e financeiro, 24/11). O
 * Heitor, 2026-11-23, à proposta "cada passo pertence a UM módulo, e nenhuma
 * ação pede dois … PDV: receber, a comanda": "concordo, pode anotar, marcar as
 * questões e ajustar o codigo". O Financeiro em Gerenciar deixava receber,
 * vender e fechar o dia — e a tela de Cargos dizia que o PDV vinha também dele.
 * A baixa no Financeiro (CX2, `podeDarBaixa`) é outra ação e não muda.
 */

const raiz = path.join(__dirname, '..')
const fonte = (f: string) => readFileSync(path.join(raiz, f), 'utf8')
const com = (p: Partial<ResolvedPermissions>) => ({ ...NO_PERMISSIONS, ...p }) as ResolvedPermissions
function ctx(p: Partial<ResolvedPermissions>): TenantContext {
  return {
    userId: 'a', internalUserId: 'u', userName: 'Ana', roleLabel: 'Cargo', tenantId: 't', branchId: null,
    role: 'BRANCH_ADMIN', roleId: 'r', clientId: null, permissions: com(p), reportTabs: [],
    providesServices: false, isNetworkAdmin: false, isClient: false,
  } as TenantContext
}

describe('quem recebe', () => {
  it('o PDV em Gerenciar recebe; o Financeiro em Gerenciar, sem o PDV, não', async () => {
    const { podeReceber } = await import('@/lib/auth')
    expect(podeReceber(ctx({ cashier: 'MANAGE' }))).toBe(true)
    expect(podeReceber(ctx({ financial: 'MANAGE' }))).toBe(false)
    expect(podeReceber(ctx({ financial: 'MANAGE', cashier: 'MANAGE' }))).toBe(true)
  })

  it('o menu segue a mesma régua: o PDV só a quem tem o PDV', async () => {
    const { recebe } = await import('@/lib/menu')
    expect(recebe(com({ cashier: 'MANAGE' }))).toBe(true)
    expect(recebe(com({ financial: 'MANAGE' }))).toBe(false)
  })

  it('a baixa no Financeiro (CX2) não muda', async () => {
    const { podeDarBaixa } = await import('@/lib/financeiro/so-os-meus')
    expect(podeDarBaixa(ctx({ financial: 'MANAGE' }))).toBe(true)
  })

  it('as listas de quem recebe e de quem vende leem só o PDV', () => {
    expect(fonte('lib/equipe/quem-desfaz.ts')).toMatch(/quemRecebeNoPdv[\s\S]{0,200}quemTemEmGerenciar\(tenantId, branchId, 'cashier'\)/)
    expect(fonte('lib/vendas/equipe-da-venda.ts')).toMatch(/\.eq\('module', 'cashier'\)\.eq\('level', 'MANAGE'\)/)
    expect(fonte('lib/vendas/equipe-da-venda.ts')).not.toMatch(/in\('module', \['cashier', 'financial'\]\)/)
  })
})

describe('a tela de Cargos diz que o PDV vem só do PDV', () => {
  it('o PDV em Sem acesso não promete o PDV pelo Financeiro', async () => {
    const { LEVEL_COPY } = await import('@/lib/permissions-copy')
    expect(LEVEL_COPY.cashier.NONE).not.toMatch(/Financeiro/)
  })

  it('o resumo: só o PDV vende e faz o Fechamento do dia', async () => {
    const { quemVendeNoResumo, TEXTO_DA_VENDA_DO_PACOTE } = await import('@/lib/permissions-copy')
    expect(quemVendeNoResumo({ cashier: 'MANAGE' })).toBe('Vende no PDV (procedimento, pacote, produto e crédito) e faz o Fechamento do dia: os dois vêm do PDV.')
    expect(quemVendeNoResumo({ cashier: 'NONE', financial: 'MANAGE' })).toBe('Não vende no PDV: vender é de quem tem o PDV.')
    expect(quemVendeNoResumo({ procedures: 'MANAGE' })).toBe('Não vende no PDV: vender é de quem tem o PDV.')
    expect(TEXTO_DA_VENDA_DO_PACOTE).not.toMatch(/Financeiro/)
  })

  it('a linha do PDV na matriz não fica "Aberto pelo Financeiro" nem travada nele', () => {
    const copia = fonte('lib/permissions-copy.ts')
    expect(copia).not.toMatch(/pdvAbertoPeloFinanceiro|nivelDoPdvPeloFinanceiro/)
    expect(fonte('components/admin/roles-editor.tsx')).not.toMatch(/pdvAbertoPeloFinanceiro|nivelDoPdvPeloFinanceiro/)
  })

  it('o texto de quem recebe (a Equipe e o atendimento) fala só no PDV', async () => {
    const { textoDeQuemRecebe } = await import('@/lib/equipe/textos-de-quem-pode')
    expect(textoDeQuemRecebe(['Sabrina'])).toBe('Quem recebe é quem tem o PDV em Gerenciar: Sabrina.')
    expect(textoDeQuemRecebe(['Fábio'], { soDaRede: true })).toBe('Ninguém desta unidade tem o PDV em Gerenciar; quem recebe, pela rede: Fábio.')
  })
})

/**
 * As sobras do PV-04 (o agente S, catálogo de 24/11): os textos que ainda
 * diziam "o PDV ou o Financeiro em Gerenciar" sobre RECEBER. A frase da BAIXA
 * no Financeiro ("Receber é de quem tem o PDV ou o Financeiro em Gerenciar.",
 * `podeDarBaixa`, CX2) continua — é outra ação.
 */
describe('os textos de quem RECEBE falam só no PDV', () => {
  it('o rodapé do plano fechado', async () => {
    const { rodapeDoPlanoFechado } = await import('@/lib/plano-de-tratamento/textos')
    expect(rodapeDoPlanoFechado(414, ['Lúcia'])).toContain('com quem tem o PDV em Gerenciar: Lúcia.')
    expect(rodapeDoPlanoFechado(414, [])).toContain('com quem tem o PDV em Gerenciar.')
    expect(rodapeDoPlanoFechado(414, ['Lúcia'])).not.toMatch(/Financeiro em Gerenciar/)
  })

  it('as comandas abertas na ficha', () => {
    const f = fonte('components/shared/comandas-abertas-da-ficha.tsx')
    expect(f).toContain('Recebe-se no PDV, com quem tem o PDV em Gerenciar.')
    expect(f).not.toMatch(/PDV ou o Financeiro/)
  })

  it('o Copilot: quem recebe é quem tem o PDV; a baixa, a régua da baixa', () => {
    const f = fonte('lib/copilot/prompt.ts')
    expect(f).not.toMatch(/quem tem o PDV \(ou o Financeiro em Gerenciar\)/)
    // A linha do marcar_pago acompanha a ferramenta (`podeDarBaixa`), não o PDV.
    expect(f).toMatch(/podeDarBaixa\(ctx\)\s*\?\s*'- Dar baixa num lançamento avulso/)
  })

  it('nenhum comentário do recebimento promete o Financeiro', () => {
    for (const f of [
      'actions/a-receber.ts', 'actions/appointments.ts', 'actions/pdv.ts', 'actions/treatment-plans.ts',
      'app/[slug]/pdv/page.tsx', 'components/branch/client-profile.tsx', 'components/branch/appointment-session.tsx',
      'components/shared/aviso-do-pacote-em-aberto.tsx', 'lib/appointments/vencidas-na-chegada.ts',
      'lib/plano-de-tratamento/textos.ts', 'lib/documentos/acesso.ts',
    ]) expect(fonte(f), f).not.toMatch(/(recebe|receber|Caixa)[^\n]{0,40}\(?o (PDV|Caixa) ou o Financeiro/)
  })
})
