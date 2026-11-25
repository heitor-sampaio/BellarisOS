import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Automações e Marketing ficam só com "Sem acesso" e "Ver" (Q02 do catálogo de
 * Automações, resolvida na revisão de 24/11: desde 18/11 mexer em automação,
 * campanha e template é só da Admin da rede — o Heitor: "só pela conta admin" —,
 * e o Gerenciar desses dois módulos não dava nada além do Ver; um nível que não
 * dá nada contraria os princípios 3 e 7). O que está gravado como Gerenciar
 * continua valendo como Ver (MANAGE ≥ VIEW), e a tela mostra e grava "Ver".
 *
 * E a linha de Configurações não promete o WhatsApp nem as contas de anúncio
 * (IG-02 do catálogo de WhatsApp e push): as integrações são só da Admin da rede.
 */

const raiz = path.join(__dirname, '..')
const fonte = (f: string) => readFileSync(path.join(raiz, f), 'utf8')

describe('os níveis das Automações e do Marketing', () => {
  it('só Sem acesso e Ver', async () => {
    const { MODULE_LEVELS } = await import('@/lib/permissions')
    expect(MODULE_LEVELS.automations).toEqual(['NONE', 'VIEW'])
    expect(MODULE_LEVELS.marketing).toEqual(['NONE', 'VIEW'])
  })

  it('a tela de Cargos não descreve um Gerenciar que não existe', async () => {
    const { LEVEL_COPY } = await import('@/lib/permissions-copy')
    expect(LEVEL_COPY.automations.MANAGE).toBeUndefined()
    expect(LEVEL_COPY.marketing.MANAGE).toBeUndefined()
  })

  it('o Gerenciar gravado vale como Ver — na tela, ao salvar e no "cargo acima"', async () => {
    const { nivelAceito } = await import('@/lib/permissions')
    expect(nivelAceito('automations', 'MANAGE')).toBe('VIEW')
    expect(nivelAceito('marketing', 'MANAGE')).toBe('VIEW')
    expect(nivelAceito('marketing', 'VIEW')).toBe('VIEW')
    expect(nivelAceito('agenda', 'MANAGE')).toBe('MANAGE')
    // O que o módulo não aceita e não tem nível abaixo fica como sempre: Sem acesso.
    expect(nivelAceito('documents', 'VIEW')).toBe('NONE')
    expect(fonte('actions/permissions.ts')).toMatch(/nivelAceito\(module, raw/)
    expect(fonte('components/admin/roles-editor.tsx')).toMatch(/nivelAceito\(m, perms\[m\]\?\.level/)
  })

  it('quem tem Ver dá o cargo com o Gerenciar gravado (vale o mesmo)', async () => {
    const { modulosAcimaDoMeu } = await import('@/lib/equipe/cargo-acima')
    const { NO_PERMISSIONS } = await import('@/lib/permissions')
    const ctx = { permissions: { ...NO_PERMISSIONS, automations: 'VIEW', marketing: 'VIEW' }, reportTabs: [], plano: null } as never
    expect(modulosAcimaDoMeu(ctx, [{ module: 'automations', level: 'MANAGE' }, { module: 'marketing', level: 'MANAGE' }], [])).toEqual([])
  })
})

// O Copilot também (revisão de 24/11, Q02; o Heitor, 23/11, à proposta "cada
// passo pertence a UM módulo, e nenhuma ação pede dois": "concordo"): o Ver já
// liga a ferramenta, e cada gravação pede só a permissão dela — o Gerenciar do
// Copilot não dá mais nada.
describe('o Copilot: Sem acesso e Ver', () => {
  it('só os dois níveis, e o Gerenciar gravado vale como Ver', async () => {
    const { MODULE_LEVELS, nivelAceito } = await import('@/lib/permissions')
    expect(MODULE_LEVELS.copilot).toEqual(['NONE', 'VIEW'])
    expect(nivelAceito('copilot', 'MANAGE')).toBe('VIEW')
  })
  it('o Ver diz que pede gravações, e não há texto de Gerenciar', async () => {
    const { LEVEL_COPY } = await import('@/lib/permissions-copy')
    expect(LEVEL_COPY.copilot.MANAGE).toBeUndefined()
    expect(LEVEL_COPY.copilot.VIEW).not.toMatch(/Não prepara gravação/)
    expect(LEVEL_COPY.copilot.VIEW).toMatch(/pedir gravações/)
    expect(LEVEL_COPY.copilot.VIEW).toMatch(/cartão de confirmação/)
  })
  it('o resumo do cargo: com o Copilot, consulta e pede gravações', async () => {
    const { copilotNoResumo } = await import('@/lib/permissions-copy')
    expect(copilotNoResumo('VIEW')).toBe('E o Copilot (o botão no canto da tela), para consultar e pedir gravações.')
    expect(copilotNoResumo('NONE')).toBeNull()
  })
})

describe('a linha de Configurações em Gerenciar', () => {
  it('não diz que conecta o WhatsApp nem as contas de anúncio, nem monta os funis', async () => {
    const { LEVEL_COPY } = await import('@/lib/permissions-copy')
    const t = LEVEL_COPY.settings.MANAGE!
    expect(t).not.toMatch(/conecta o WhatsApp/)
    expect(t).not.toMatch(/monta os funis/)
    expect(t).toMatch(/só da Admin da rede/)
  })
})
