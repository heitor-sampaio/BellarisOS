import { describe, it, expect } from 'vitest'
import { tituloDoLancamento, regraDoLancamento, csvDoExtrato } from '@/lib/comissoes/extrato-texto'
import type { LancamentoDoExtrato } from '@/lib/comissoes/leitura'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

const base: LancamentoDoExtrato = {
  id: 'l1', professionalId: 'p1', branchId: 'b1', releasedAt: '2026-11-10T13:00:00Z', kind: 'LIBERACAO', motivo: null, amount: 420,
  status: 'OPEN', payoutId: null, appointmentId: null, scheduledAt: '2026-11-10T13:00:00Z', cliente: 'Beatriz Nogueira', procedimento: null,
  origem: 'PLANO_VENDA', preco: 8400, regraTipo: 'PERCENTAGE', regraValor: 5, pacote: null, descontaTaxa: false, descontaInsumos: false,
  previsto: null, baseComPontos: 'PRECO', plano: null, base: 8400, baseDesconto: 0, baseTaxa: 0, baseInsumos: 0, baseFator: 1, pagoEm: null,
  regraDe: 'CLINICA',
}

// A43 da 11ª: "Procedimento · Beatriz Nogueira" na venda do plano.
describe('A43: o título do lançamento de venda diz que é venda', () => {
  it('a venda do plano sem nome', () => {
    expect(tituloDoLancamento(base)).toBe('Venda de plano')
  })
  it('a venda do plano com nome, do pacote e do pré-pago', () => {
    expect(tituloDoLancamento({ ...base, plano: 'Harmonização', procedimento: 'Harmonização' })).toBe('Venda do plano Harmonização')
    expect(tituloDoLancamento({ ...base, origem: 'PACOTE_VENDA', pacote: '10 drenagens', procedimento: '10 drenagens' })).toBe('Venda do pacote 10 drenagens')
    expect(tituloDoLancamento({ ...base, origem: 'PRE_PAGO_VENDA', procedimento: 'Drenagem' })).toBe('Venda de procedimento: Drenagem')
  })
  it('o atendimento segue com o procedimento', () => {
    expect(tituloDoLancamento({ ...base, origem: 'AVULSO', procedimento: 'Toxina' })).toBe('Toxina')
  })
})

// A17 da 11ª: de onde veio o percentual.
describe('A17: a regra diz de onde veio', () => {
  it('da pessoa, do item, da rede', () => {
    expect(regraDoLancamento({ ...base, regraValor: 3, regraDe: 'PESSOA' }, 'Tatiane')).toBe('3% — da Tatiane')
    expect(regraDoLancamento({ ...base, origem: 'PACOTE_VENDA', regraValor: 10, regraDe: 'ITEM' }, 'Tatiane')).toBe('10% — do pacote')
    expect(regraDoLancamento({ ...base, origem: 'PRODUTO', regraValor: 10, regraDe: 'ITEM' }, 'Tatiane')).toBe('10% — do produto')
    expect(regraDoLancamento({ ...base, regraDe: 'CLINICA' }, 'Tatiane')).toBe('5% — da rede')
    expect(regraDoLancamento({ ...base, regraDe: null }, 'Tatiane')).toBe('5%')
  })
})

// A44 da 11ª: "Taxa da maquininha" e "Insumos" saíam 0,00 com a base cheia.
describe('A44: o CSV não diz 0,00 do que não sai da base', () => {
  it('a taxa e os insumos vazios quando não são descontados; com o desconto, o valor', () => {
    const csv = csvDoExtrato([base, { ...base, id: 'l2', descontaTaxa: true, baseTaxa: 6.3 }], new Map([['p1', 'Tatiane']]), new Map([['b1', 'Azaleia']]))
    // Os campos com ";" vêm entre aspas: o CSV lido como o Excel lê.
    const campos = (linha: string) => [...linha.matchAll(/("([^"]|"")*"|[^;]*)(;|$)/g)].map(m => m[1]!.replace(/^"|"$/g, '').replace(/""/g, '"')).slice(0, -1)
    const l = csv.slice(1).split('\r\n')
    const cab = campos(l[0]!)
    const iTaxa = cab.indexOf('Taxa da maquininha'), iIns = cab.indexOf('Insumos'), iRegra = cab.indexOf('Regra')
    const sem = campos(l[1]!), com = campos(l[2]!)
    expect([sem[iTaxa], sem[iIns]]).toEqual(['', ''])
    expect(com[iTaxa]).toBe('6,30')
    expect(sem[iRegra]).toBe('5% — da rede')
  })
})

describe('cada lançamento de comissão guarda o retrato da base (princípio 3, comissoes.md)', () => {
  const WEB = nodePath.join(__dirname, "..")
  const MIGRATIONS = nodePath.join(WEB, "..", "..", "supabase", "migrations")
  const ler = (caminho: string) => nodeFs.readFileSync(nodePath.join(WEB, caminho), "utf8")
  const sp = (s: string | null | undefined) => s?.replace(/\s/g, " ") ?? null
  const migrations = () => nodeFs.readdirSync(MIGRATIONS).filter(f => f.endsWith(".sql")).sort()
  /** A migration mais nova que mexe no que o trecho diz. */
  const ultimaCom = (trecho: string) => {
    const achou = migrations().filter(f => nodeFs.readFileSync(nodePath.join(MIGRATIONS, f), "utf8").includes(trecho))
    return achou.length ? { nome: achou.at(-1)!, sql: nodeFs.readFileSync(nodePath.join(MIGRATIONS, achou.at(-1)!), "utf8") } : null
  }

  // ─── O retrato da base em cada lançamento ──────────────────────────────────
  // Decisão do Claude (18/11), princípio 3 ("O que a tela mostra é o que vale na
  // conta"): todo lançamento novo guarda a base da conta da linha NA HORA em que
  // nasceu; o estorno, a da liberação que ele desfaz. Sem retrato (o antigo), o
  // extrato segue a conta de hoje (e a D5 no avulso).
  describe('o extrato diz a base da hora de cada lançamento', () => {
    it('o acerto da linha grava o retrato (e o estorno, o da liberação que desfaz)', () => {
      const m = ultimaCom('base_retrato')
      expect(m, 'nenhuma migration retrata a base do lançamento').not.toBeNull()
      expect(m!.nome >= '20261130100001').toBe(true)
      const s = sp(m!.sql)!
      expect(s).toMatch(/alter table public\.commissions add column if not exists base_retrato jsonb/)
      expect(m!.sql).toContain("'private.comissao_acertar_linha(uuid,text,uuid)'::regprocedure")
      expect(s).toMatch(/from private\.comissao_conta_detalhe\(p_linha\) d/)
      expect(s).toMatch(/where c\.line_id = p_linha and c\.amount > 0 order by c\.released_at desc, c\.id desc limit 1/)
      expect(m!.sql).toContain('create or replace function pg_temp.trocar_no_corpo')
      expect(m!.sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
    })
    it('o extrato (e o CSV, que sai dele) usa o retrato quando existe', () => {
      const m = ultimaCom('base_retrato')!
      const s = sp(m.sql)!
      expect(m.sql).toContain("'public.comissoes_extrato_com_regra(uuid,uuid[],timestamp with time zone,timestamp with time zone,uuid)'::regprocedure")
      expect(s).toMatch(/case when x\.base_retrato is not null then \(x\.base_retrato ->> 'base'\)::numeric/)
      for (const k of ['base_desconto', 'base_taxa', 'base_insumos', 'base_fator', 'base_fidelidade', 'preco', 'regra_valor']) {
        expect(s, k).toContain(`(x.base_retrato ->> '${k}')::numeric`)
      }
      expect(ler('lib/comissoes/leitura.ts')).toContain("rpc('comissoes_extrato_com_regra'")
    })
    it('comissoes.md diz a regra', () => {
      const t = sp(nodeFs.readFileSync(nodePath.join(WEB, '..', '..', 'docs', 'regras', 'comissoes.md'), 'utf8'))!
      expect(t).toMatch(/\*\*Cada lançamento com o RETRATO da base\*\*/)
    })
  })
})
