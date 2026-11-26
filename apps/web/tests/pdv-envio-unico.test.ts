import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * O clique duplo no "Receber" do PDV (o Heitor, 25/11, escolheu "As duas
 * respostas dizem 'recebido'" para: "Se a pessoa clica duas vezes em receber,
 * ou recebe em duas abas, o PDV grava uma vez só e o dinheiro fica certo. Mas a
 * segunda resposta mostra um erro ('Esse lançamento já está pago'), e quem
 * clicou pode achar que falhou.").
 *
 * - O MESMO envio duas vezes (a mesma chave da tela): grava uma vez, e as DUAS
 *   respostas dizem o que foi recebido (`umaVez`, `lib/envio-unico.ts`).
 * - DOIS envios (duas abas, chaves diferentes): um recebe, o outro ouve que já
 *   está pago — isso não muda.
 *
 * `envios_unicos` e a baixa (`marcarPagoCore`) são simulados em memória: a
 * prova contra o banco é `e2e/plano-recebimento-concorrente.spec.ts`.
 */

const JA_PAGO = 'Esse lançamento já está pago (ou foi estornado).'
const TX = '11111111-1111-4111-8111-111111111111'
const envios = new Map<string, { estado: string; resultado: unknown }>()
let baixas = 0

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@/lib/auth', () => ({
  getTenantContext: async () => ({ tenantId: 't1', branchId: null, internalUserId: 'u1', unidades: null }),
  podeReceber: () => true,
  alcancaUnidade: () => true,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (nome: string, a: { p_tenant: string; p_acao: string; p_chave: string }) => {
      if (nome !== 'envio_reivindicar') return { data: null, error: null }
      const k = `${a.p_tenant}|${a.p_acao}|${a.p_chave}`
      const atual = envios.get(k)
      if (!atual || atual.estado === 'livre') {
        envios.set(k, { estado: 'gravando', resultado: null })
        return { data: { situacao: 'sua' }, error: null }
      }
      if (atual.estado === 'feito') return { data: { situacao: 'feito', resultado: atual.resultado }, error: null }
      return { data: { situacao: 'ocupada' }, error: null }
    },
    from: () => {
      let patch: { estado: string; resultado: unknown } | null = null
      const filtro: string[] = []
      const b = {
        update: (p: { estado: string; resultado: unknown }) => { patch = p; return b },
        eq: (_c: string, v: string) => {
          filtro.push(v)
          if (filtro.length === 3 && patch) envios.set(filtro.join('|'), { estado: patch.estado, resultado: patch.resultado })
          return b
        },
        then: (ok: (r: unknown) => unknown) => Promise.resolve({ error: null }).then(ok),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/financeiro/lancamento', () => ({
  FORMAS_DE_PAGAMENTO: ['CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD'],
  lancamentoAoAlcance: async () => ({ id: TX, type: 'INCOME', amount: 300, is_paid: baixas > 0 }),
  // A baixa de verdade tem a guarda do já pago na própria gravação: a segunda ouve "já está pago".
  marcarPagoCore: async () => {
    await new Promise(ok => setTimeout(ok, 30))
    baixas += 1
    return baixas === 1 ? { ok: true } : { error: JA_PAGO }
  },
  marcarPagoEmFormasCore: async () => {
    await new Promise(ok => setTimeout(ok, 30))
    baixas += 1
    return baixas === 1 ? { ok: true } : { error: JA_PAGO }
  },
}))

beforeEach(() => { envios.clear(); baixas = 0 })

const chave = () => crypto.randomUUID()

describe('receberParcelaNoPdv: o mesmo envio grava uma vez, e as duas respostas dizem o recebido', () => {
  it('o mesmo envio duas vezes ao mesmo tempo (o clique duplo): uma baixa, e as duas respostas iguais, com o recebido', async () => {
    const { receberParcelaNoPdv } = await import('@/actions/pdv')
    const k = chave()
    const respostas = await Promise.all([1, 2].map(() => receberParcelaNoPdv(TX, 'loja', { forma: 'PIX' }, k)))
    expect(baixas, 'uma baixa só').toBe(1)
    expect(respostas[0]).toEqual({ ok: true, recebido: 300 })
    expect(respostas[1], 'a segunda resposta diz o mesmo recebido, sem erro').toEqual({ ok: true, recebido: 300 })
  })

  it('o mesmo envio em várias formas (o "+ Outra forma"): uma baixa, as duas respostas com o recebido', async () => {
    const { receberParcelaNoPdv } = await import('@/actions/pdv')
    const k = chave()
    const partes = [{ forma: 'PIX', valor: 200 }, { forma: 'CASH', valor: 100 }]
    const respostas = await Promise.all([1, 2].map(() => receberParcelaNoPdv(TX, 'loja', { forma: 'PIX', partes }, k)))
    expect(baixas).toBe(1)
    expect(respostas).toEqual([{ ok: true, recebido: 300 }, { ok: true, recebido: 300 }])
  })

  it('duas abas (dois envios, chaves diferentes): uma recebe, a outra ouve que já está pago — não muda', async () => {
    const { receberParcelaNoPdv } = await import('@/actions/pdv')
    const respostas = await Promise.all([chave(), chave()].map(k => receberParcelaNoPdv(TX, 'loja', { forma: 'PIX' }, k)))
    expect(baixas).toBe(2)
    expect(respostas.filter(r => 'ok' in r)).toHaveLength(1)
    expect(respostas.filter(r => 'error' in r && r.error === JA_PAGO)).toHaveLength(1)
  })

  it('a volta sem gravar (sem forma) solta a chave: o envio corrigido grava', async () => {
    const { receberParcelaNoPdv } = await import('@/actions/pdv')
    const k = chave()
    expect(await receberParcelaNoPdv(TX, 'loja', { forma: '' }, k)).toEqual({ error: 'Escolha a forma de pagamento.' })
    expect(await receberParcelaNoPdv(TX, 'loja', { forma: 'PIX' }, k)).toEqual({ ok: true, recebido: 300 })
    expect(baixas).toBe(1)
  })
})

/**
 * As outras actions do PDV que recebem dinheiro dependem de dezenas de módulos
 * (a comanda do atendimento, o checkout do plano): a prova contra o banco é o
 * E2E; aqui, que cada uma embrulha a gravação em `umaVez` com a chave da tela,
 * e que cada tela manda a MESMA chave nos dois cliques.
 */
const raiz = path.join(__dirname, '..')
const ler = (rel: string) => readFileSync(path.join(raiz, rel), 'utf8')
function corpo(texto: string, nome: string): string {
  const i = texto.indexOf(`export async function ${nome}(`)
  expect(i, nome).toBeGreaterThanOrEqual(0)
  const fim = texto.indexOf('\nexport ', i + 10)
  return texto.slice(i, fim < 0 ? undefined : fim)
}

describe('as outras actions do PDV que recebem: o mesmo envio grava uma vez', () => {
  it('a comanda do atendimento (confirmPayment) grava uma vez por chave', () => {
    const t = corpo(ler('actions/appointments.ts'), 'confirmPayment')
    expect(t).toMatch(/umaVez\(\s*ctx\.tenantId!,\s*'confirmPayment',\s*chaveDoEnvio\(formData\)/)
  })
  it('o plano (checkoutTreatmentPlan) grava uma vez por chave, e só o que recebeu se guarda', () => {
    const t = corpo(ler('actions/treatment-plans.ts'), 'checkoutTreatmentPlan')
    expect(t).toMatch(/umaVez\(\s*ctx\.tenantId!,\s*'checkoutTreatmentPlan'/)
    // A pergunta "Quem vendeu?" não gravou: não se guarda como feito.
    expect(t).toMatch(/gravou:\s*r\s*=>\s*'transactionId' in r/)
  })
  it('a parcela (receberParcelaNoPdv) grava uma vez por chave', () => {
    const t = corpo(ler('actions/pdv.ts'), 'receberParcelaNoPdv')
    expect(t).toMatch(/umaVez\(\s*ctx\.tenantId!,\s*'receberParcelaNoPdv',\s*chaveDoEnvio\(envio\)/)
  })
})

describe('as telas do PDV mandam a mesma chave nos dois cliques', () => {
  it('o "Receber" da comanda manda o _envio no formulário', () => {
    const t = ler('components/shared/receber-atendimento.tsx')
    expect(t).toMatch(/useEnvioUnico\(\)/)
    expect(t).toMatch(/fd\.set\('_envio', envio\.chave\(\)\)/)
  })
  it('o "Receber esta parcela" manda a chave', () => {
    const t = ler('components/shared/pdv/parcelas-em-aberto.tsx')
    expect(t).toMatch(/useEnvioUnico\(\)/)
    expect(t).toMatch(/receberParcelaNoPdv\([\s\S]*?envio\.chave\(\)\)/)
  })
  it('o receber do plano manda a chave', () => {
    const t = ler('components/branch/checkout-wizard.tsx')
    expect(t).toMatch(/useEnvioUnico\(\)/)
    expect(t).toMatch(/checkoutTreatmentPlan\([\s\S]*?envio\.chave\(\)\)/)
  })
})
