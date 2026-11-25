import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O Heitor, 25/11, perguntado se o "no máximo, avisar" do princípio 2 vale
 * para os prazos que a rede configura: "Se não for impossível, ainda que
 * improvável, pode ser feito."
 *
 * Três prazos recusavam acima de um teto — a validade do plano proposto (365
 * dias), o prazo para alterar o agendamento pelo portal (720 horas) e a
 * validade da ficha de saúde (36 meses). Agora acima do teto antigo (o
 * "comum") a tela AVISA e o servidor GRAVA.
 *
 * O impossível continua recusado (decisão do Claude, 25/11): negativo, zero
 * onde não cabe (a validade do plano e da ficha começam em 1; o prazo do
 * portal aceita 0), fracionário, e acima de 100 anos — cada um vira uma DATA,
 * e a conta da data estoura no banco: 36.500 dias, 876.000 horas, 1.200 meses.
 */

const RAIZ = join(__dirname, '..', '..', '..')
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

// ─── O servidor de mentira: o que as actions gravam em `tenants` ────────────

const gravado: Record<string, unknown>[] = []

function construtor() {
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'in', 'order', 'limit', 'maybeSingle', 'single']) b[op] = () => b
  b.update = (patch: Record<string, unknown>) => { gravado.push(patch); return b }
  b.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: { id: 't1' }, error: null }).then(ok)
  return b
}

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor, rpc: async () => ({ data: null, error: null }) }) }))
vi.mock('@/lib/auth', () => ({
  getTenantContext: async () => ({
    tenantId: 't1', branchId: null, internalUserId: 'u1', isNetworkAdmin: true, suporte: null,
    permissions: { settings: 'MANAGE', forms: 'MANAGE' },
  }),
  assertPermission: () => {},
  assertRecurso: () => {},
  alcancaOAgendamento: () => true,
  vistaPessoal: () => null,
  can: () => true,
}))

beforeEach(() => { gravado.length = 0 })

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData()
  f.set('name', 'Estética Bella')
  for (const [k, v] of Object.entries(campos)) f.set(k, v)
  return f
}

async function salvarDadosDaRede(campos: Record<string, string>) {
  const { atualizarDadosDaRede } = await import('@/actions/rede')
  return atualizarDadosDaRede(undefined, formulario({ portal_prazo_alteracao_horas: '24', plano_validade_dias: '30', ...campos }))
}

describe('o limite das datas em horas', () => {
  it('100 anos em horas: 100 × 365 × 24', async () => {
    const { LIMITE_DE_HORAS, LIMITE_DE_DIAS, LIMITE_DE_MESES } = await import('@/lib/acima-do-comum')
    expect(LIMITE_DE_HORAS).toBe(876_000)
    expect([LIMITE_DE_DIAS, LIMITE_DE_MESES]).toEqual([36_500, 1_200])
  })
})

describe('o prazo do portal: acima de 720 horas avisa, não recusa', () => {
  it('2.000 horas passa; zero também (a cliente altera até o horário)', async () => {
    const { recusaDoPrazoDoPortal } = await import('@/lib/configuracoes/prazos-da-rede')
    expect(recusaDoPrazoDoPortal(2000)).toBeNull()
    expect(recusaDoPrazoDoPortal(0)).toBeNull()
    expect(recusaDoPrazoDoPortal(876_000)).toBeNull()
  })

  it('o impossível continua recusado: negativo, fracionário, ilegível e acima de 100 anos', async () => {
    const { recusaDoPrazoDoPortal } = await import('@/lib/configuracoes/prazos-da-rede')
    for (const n of [-1, 1.5, Number.NaN]) expect(recusaDoPrazoDoPortal(n), String(n)).toBe('O prazo do portal é um número inteiro de horas, de 0 para cima.')
    expect(recusaDoPrazoDoPortal(876_001)).toBe('No máximo 876.000 horas (100 anos, o limite das datas).')
  })

  it('o aviso começa acima de 720 horas', async () => {
    const { avisoDoPrazoDaRede } = await import('@/lib/configuracoes/prazos-da-rede')
    expect(avisoDoPrazoDaRede('portal_prazo_alteracao_horas', 2000)).toBe('Acima do comum (mais de 720 horas). Confira: o valor vale como está.')
    expect(avisoDoPrazoDaRede('portal_prazo_alteracao_horas', 720)).toBeNull()
  })

  it('a action grava 2.000 horas', async () => {
    const r = await salvarDadosDaRede({ portal_prazo_alteracao_horas: '2000' })
    expect(r).toEqual({ success: true })
    expect(gravado[0]).toMatchObject({ portal_prazo_alteracao_horas: 2000 })
  })

  it('a action recusa o impossível e não grava', async () => {
    for (const v of ['-1', '1.5', '876001']) {
      const r = await salvarDadosDaRede({ portal_prazo_alteracao_horas: v })
      expect('error' in r, v).toBe(true)
    }
    expect(gravado).toEqual([])
  })
})

describe('a validade do plano proposto: acima de 365 dias avisa, não recusa', () => {
  it('800 dias passa', async () => {
    const { recusaDaValidadeDoPlano } = await import('@/lib/configuracoes/prazos-da-rede')
    expect(recusaDaValidadeDoPlano(800)).toBeNull()
    expect(recusaDaValidadeDoPlano(1)).toBeNull()
    expect(recusaDaValidadeDoPlano(36_500)).toBeNull()
  })

  it('o impossível continua recusado: zero, negativo, fracionário e acima de 100 anos', async () => {
    const { recusaDaValidadeDoPlano } = await import('@/lib/configuracoes/prazos-da-rede')
    for (const n of [0, -1, 1.5, Number.NaN]) expect(recusaDaValidadeDoPlano(n), String(n)).toBe('A validade do plano proposto é um número inteiro de dias, de 1 para cima.')
    expect(recusaDaValidadeDoPlano(36_501)).toBe('No máximo 36.500 dias (100 anos, o limite das datas).')
  })

  it('o aviso começa acima de 365 dias', async () => {
    const { avisoDoPrazoDaRede } = await import('@/lib/configuracoes/prazos-da-rede')
    expect(avisoDoPrazoDaRede('plano_validade_dias', 800)).toBe('Acima do comum (mais de 365 dias). Confira: o valor vale como está.')
    expect(avisoDoPrazoDaRede('plano_validade_dias', 365)).toBeNull()
  })

  it('a action grava 800 dias e recusa o impossível', async () => {
    expect(await salvarDadosDaRede({ plano_validade_dias: '800' })).toEqual({ success: true })
    expect(gravado[0]).toMatchObject({ plano_validade_dias: 800 })
    gravado.length = 0
    for (const v of ['0', '-1', '2.5', '36501']) {
      const r = await salvarDadosDaRede({ plano_validade_dias: v })
      expect('error' in r, v).toBe(true)
    }
    expect(gravado).toEqual([])
  })

  it('a data da proposta com a validade de 100 anos é uma data', async () => {
    const { validoAteDaProposta } = await import('@/lib/plano-de-tratamento/validade')
    expect(validoAteDaProposta('2026-11-25T12:00:00.000Z', 800).toISOString()).toBe('2029-02-02T12:00:00.000Z')
    expect(Number.isNaN(validoAteDaProposta('2026-11-25T12:00:00.000Z', 36_500).getTime())).toBe(false)
  })
})

describe('a validade da ficha de saúde: acima de 36 meses avisa, não recusa', () => {
  it('60 meses passa', async () => {
    const { EntradaDoEnvioDaFicha } = await import('@/lib/configuracoes/prazos-da-rede')
    expect(EntradaDoEnvioDaFicha.parse({ envio: true, validadeMeses: 60 }).validadeMeses).toBe(60)
    expect(EntradaDoEnvioDaFicha.safeParse({ envio: false, validadeMeses: 1200 }).success).toBe(true)
  })

  it('o impossível continua recusado: zero, negativo, fracionário e acima de 100 anos', async () => {
    const { EntradaDoEnvioDaFicha } = await import('@/lib/configuracoes/prazos-da-rede')
    for (const m of [0, -1, 1.5, 1201]) expect(EntradaDoEnvioDaFicha.safeParse({ envio: true, validadeMeses: m }).success, String(m)).toBe(false)
  })

  it('o aviso começa acima de 36 meses', async () => {
    const { avisoDoPrazoDaRede } = await import('@/lib/configuracoes/prazos-da-rede')
    expect(avisoDoPrazoDaRede('pre_atendimento_validade_meses', 60)).toBe('Acima do comum (mais de 36 meses). Confira: o valor vale como está.')
    expect(avisoDoPrazoDaRede('pre_atendimento_validade_meses', 36)).toBeNull()
  })

  it('a action grava 60 meses e recusa o impossível', async () => {
    const { definirEnvioDoPreAtendimento } = await import('@/actions/pre-atendimento')
    expect(await definirEnvioDoPreAtendimento({ envio: true, validadeMeses: 60 })).toEqual({ ok: true })
    expect(gravado[0]).toMatchObject({ pre_atendimento_validade_meses: 60 })
    gravado.length = 0
    for (const m of [0, -1, 1.5, 1201]) {
      const r = await definirEnvioDoPreAtendimento({ envio: true, validadeMeses: m })
      expect('error' in r, String(m)).toBe(true)
    }
    expect(gravado).toEqual([])
  })

  it('a ficha vencida com 60 meses e com 100 anos é uma conta de data', async () => {
    const { fichaDeSaudeVencida, fichaDeSaudeValidaAte } = await import('@/lib/pre-atendimento/validade')
    const agora = new Date('2026-11-25T12:00:00.000Z')
    expect(fichaDeSaudeVencida('2022-01-10T12:00:00.000Z', 60, agora)).toBe(false)
    expect(fichaDeSaudeVencida('2021-11-25T11:00:00.000Z', 60, agora)).toBe(true)
    expect(fichaDeSaudeValidaAte('2026-11-25T12:00:00.000Z', 60)).toBe('2031-11-25T12:00:00.000Z')
    expect(fichaDeSaudeValidaAte('2026-11-25T12:00:00.000Z', 1200)).toBe('2126-11-25T12:00:00.000Z')
  })
})

describe('o prazo do portal grande no app da cliente', () => {
  it('"Alterar até" e o "ainda dá" fazem a conta com 2.000 horas', async () => {
    const { aindaDaParaAlterar, limiteParaAlterar } = await import('@/lib/clientes/agenda-do-portal')
    const horario = '2027-03-01T13:00:00.000Z'
    expect(aindaDaParaAlterar(horario, 2000, Date.parse('2026-12-01T12:00:00.000Z'))).toBe(true)
    expect(aindaDaParaAlterar(horario, 2000, Date.parse('2027-01-01T12:00:00.000Z'))).toBe(false)
    // 2.000 horas = 83 dias e 8 horas antes: 08/12/2026 às 02:00 em Brasília. O limite cai em
    // OUTRO ano que o do horário, e a tela diz qual (princípio 3; decisão do Claude, 25/11): sem o
    // ano, "08/12" de um horário em março se lê como o dezembro seguinte.
    expect(limiteParaAlterar(horario, 2000, 'America/Sao_Paulo')).toBe('terça-feira, 08/12/2026 às 02:00')
  })
  it('no mesmo ano do horário, o "Alterar até" fica sem o ano', async () => {
    const { limiteParaAlterar } = await import('@/lib/clientes/agenda-do-portal')
    expect(limiteParaAlterar('2027-03-01T13:00:00.000Z', 48, 'America/Sao_Paulo')).toBe('sábado, 27/02 às 10:00')
    // A virada do ano conta no fuso da unidade: 01/01 01:00 em Brasília, 2 horas antes = 31/12 do ano anterior.
    expect(limiteParaAlterar('2027-01-01T04:00:00.000Z', 2, 'America/Sao_Paulo')).toBe('quinta-feira, 31/12/2026 às 23:00')
  })
})

describe('a tela avisa ao lado do campo e não tem mais o teto', () => {
  it('Configurações → Geral: o prazo do portal e a validade do plano', () => {
    const tela = fonte('components/admin/settings-geral.tsx')
    expect(tela).not.toContain('max={720}')
    expect(tela).not.toContain('max={365}')
    expect(tela).toContain("aviso={avisoDoPrazoDaRede('portal_prazo_alteracao_horas'")
    expect(tela).toContain("aviso={avisoDoPrazoDaRede('plano_validade_dias'")
  })

  it('a ficha de saúde: a validade das respostas', () => {
    const tela = fonte('components/admin/settings-pre-atendimento.tsx')
    expect(tela).not.toContain('max={36}')
    expect(tela).toContain("avisoDoPrazoDaRede('pre_atendimento_validade_meses'")
    expect(tela).toContain('data-acima-do-comum="pre_atendimento_validade_meses"')
  })

  it('as actions leem a regra do lugar único, sem o teto de antes', () => {
    const rede = fonte('actions/rede.ts')
    expect(rede).not.toMatch(/prazo > 720|validadeDoPlano > 365/)
    expect(rede).toContain('recusaDoPrazoDoPortal(')
    expect(rede).toContain('recusaDaValidadeDoPlano(')
    const ficha = fonte('actions/pre-atendimento.ts')
    expect(ficha).not.toContain('.max(36)')
    expect(ficha).toContain('EntradaDoEnvioDaFicha')
  })
})

describe('o banco solta as três travas e mantém o impossível', () => {
  const sql = (() => {
    try { return readFileSync(join(RAIZ, 'supabase', 'migrations', '20261207000001_prazos_da_rede_acima_do_comum.sql'), 'utf8') } catch { return '' }
  })()

  it('as faixas vão até 100 anos, com o mínimo de antes', () => {
    expect(sql).toContain('drop constraint if exists tenants_plano_validade_dias_faixa')
    expect(sql).toContain('add constraint tenants_plano_validade_dias_faixa check (plano_validade_dias between 1 and 36500)')
    expect(sql).toContain('drop constraint if exists tenants_portal_prazo_alteracao')
    expect(sql).toContain('add constraint tenants_portal_prazo_alteracao check (portal_prazo_alteracao_horas between 0 and 876000)')
    expect(sql).toContain('drop constraint if exists tenants_pre_atendimento_validade')
    expect(sql).toContain('add constraint tenants_pre_atendimento_validade check (pre_atendimento_validade_meses between 1 and 1200)')
  })

  it('sem política nova e com o recarregar do PostgREST no fim', () => {
    expect(sql).not.toMatch(/create policy/i)
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})
