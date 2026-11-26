import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { partesDoMovimento, textoDasPartes } from '@/lib/estoque/lotes-do-movimento'
import { partesDaLinha } from '@/lib/metrics/movimentos-de-estoque'

/**
 * O saldo do produto e a soma dos lotes batem (ES-18: "a parte que nenhum lote
 * cobre usa o último custo"; ES-25: "Cada atendimento… diz o que se tirou de
 * cada lote"; ES-20; princípio 3).
 *
 * D5: o ácido (frasco de 10 ml) acabou no meio de um atendimento — 2 ml do
 * lote AM1 e 2 ml sem lote, o saldo em −2 ml. A entrada do AM2 (1 frasco, 10 ml)
 * levou o saldo a 8 ml, mas o lote ficou com 10 ml: o gatilho do lote ignora
 * todo movimento positivo, e a entrada não abatia a falta que ficou descoberta.
 * E o Histórico dizia "−4 ml · Lote AM1" para um consumo que o AM1 cobriu só em
 * 2 ml. Agora o lote que entra cobre o que faltou (o AM2 fica com 8 ml), e o
 * Histórico e as Movimentações dizem o que cada lote cobriu.
 *
 * E a entrada gravava as embalagens somando ao saldo de antes (−1 frasco, a
 * "embalagem devida" de `lib/estoque/baixa.ts`, + 1 = 0) com o rendimento em
 * 8 ml: o produto ficava "0 frasco" com 8 ml na prateleira. As embalagens são
 * o rendimento arredondado (a regra do ajuste e da baixa).
 *
 * D7: a Auditoria dizia "Corrigiu o custo do lote… de R$ 800 para R$ 980" na
 * conclusão que ninguém corrigiu — o gatilho do lote gravava o custo do insumo
 * por um UPDATE depois do insert, e a Auditoria lê toda edição de `unit_cost`
 * como a correção. O custo dos lotes vai no próprio insert (um gatilho ANTES),
 * como a transferência já faz (20261209600001).
 */
const DIR = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const migration = (nome: RegExp) => {
  const f = readdirSync(DIR).filter(n => n.endsWith('.sql')).find(n => nome.test(n))
  return f ? readFileSync(join(DIR, f), 'utf8') : ''
}
const fonte = (arq: string) => readFileSync(resolve(__dirname, '..', arq), 'utf8')

describe('D5: o lote que entra cobre a falta que ficou sem lote', () => {
  const m = () => migration(/^202612122\d{5}_estoque_o_lote_que_entra_cobre_a_falta\.sql$/)
  it('a migration existe, na faixa do estoque, e termina recarregando o esquema', () => {
    expect(m(), 'a migration existe').not.toBe('')
    expect(m().trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
  it('um gatilho ADIADO (o lote da entrada nasce depois do movimento) abate a falta de antes nos lotes que o movimento positivo pôs', () => {
    const s = m()
    expect(s).toMatch(/create or replace function private\.lote_cobre_a_falta\(\)/)
    expect(s).toMatch(/create or replace function private\.lote_cobre_a_falta_do_movimento\(p_mov uuid\)/)
    expect(s).toMatch(/create constraint trigger trg_lote_cobre_a_falta\s+after insert on public\.stock_movements\s+deferrable initially deferred\s+for each row\s+when \(new\.quantity > 0\)/)
    // A falta é a de ANTES do movimento (o saldo negativo que nenhum lote cobriu)…
    expect(s).toContain('greatest(-(v_m.balance_after - v_m.quantity), 0) / v_fator')
    // …e nunca passa do que os lotes têm a mais que o saldo.
    expect(s).toMatch(/v_excesso\s*:=\s*v_lotes - greatest\(v_saldo, 0\) \/ v_fator/)
    expect(s).toMatch(/update public\.product_batches set quantity = quantity - v_tira/)
    // A ligação diz o que entrou no lote (o "Desfazer entrada" confere por ela).
    expect(s).toMatch(/update public\.stock_movement_batches set quantity = quantity - v_tira/)
    expect(s).toMatch(/revoke all on function private\.lote_cobre_a_falta\(\) from public, anon, authenticated/)
    expect(s).toMatch(/revoke all on function private\.lote_cobre_a_falta_do_movimento\(uuid\) from public, anon, authenticated/)
  })
  it('a entrada grava as embalagens pelo rendimento (a embalagem aberta inteira; a devida, para longe do zero)', () => {
    const s = m()
    expect(s).toContain("'public.estoque_entrada(uuid,uuid,numeric,numeric,text,text,timestamp with time zone,text,text,text,text)'::regprocedure")
    expect(s).toContain('then ceil(round(v_novo_rend / v_upp, 6)) else floor(round(v_novo_rend / v_upp, 6)) end')
  })
  it('os de antes: só o que o banco prova (a entrada depois do saldo negativo, com o lote acima do saldo), sem a Auditoria', () => {
    const s = m()
    expect(s).toContain('alter table public.product_batches disable trigger auditoria_upd;')
    expect(s).toContain('alter table public.product_batches enable trigger auditoria_upd;')
    expect(s).toMatch(/m\.balance_after - m\.quantity < 0/)
  })
  it('as Movimentações dos Relatórios recebem o que cada lote cobriu (a ligação, em embalagens) e o rendimento', () => {
    const s = m()
    expect(s).toContain("'public.metrics_movimentos_de_estoque(uuid,uuid[],timestamp with time zone,timestamp with time zone,integer,integer)'::regprocedure")
    expect(s).toContain("'embalagens', smb.quantity")
    expect(s).toContain("'fator', public.fator_de_consumo(p)")
  })
})

describe('D7: o custo do insumo vai no insert, sem o UPDATE que a Auditoria lia como correção', () => {
  const m = () => migration(/^202612122\d{5}_estoque_custo_da_saida_no_insert\.sql$/)
  it('um gatilho ANTES do insert grava o custo dos lotes que a saída vai tirar (o escolhido primeiro, depois o FEFO)', () => {
    const s = m()
    expect(s, 'a migration existe').not.toBe('')
    expect(s).toMatch(/create or replace function private\.custo_da_saida_do_movimento\(p_produto uuid, p_unidade uuid, p_embalagens numeric, p_lote uuid, p_custo_do_resto numeric\)/)
    expect(s).toMatch(/create trigger trg_custo_da_saida_pelos_lotes\s+before insert on public\.stock_movements/)
    expect(s).toMatch(/new\.type in \('PROCEDURE_USAGE', 'MANUAL_ADJUSTMENT'\) and new\.quantity < 0/)
    // A mesma ordem do gatilho do lote: o válido que vence antes, os vencidos depois.
    expect(s).toContain("order by coalesce((b.expires_at at time zone 'UTC')::date < (now() at time zone public.fuso_da_unidade(b.branch_id))::date, false),")
    expect(s).toMatch(/revoke all on function private\.custo_da_saida_do_movimento\(uuid, uuid, numeric, uuid, numeric\) from public, anon, authenticated/)
  })
  it('o gatilho do lote deixa de fazer o UPDATE do custo depois do insert', () => {
    const s = m()
    expect(s).toContain("'public.on_stock_movement_lotes()'::regprocedure")
    expect(s).toContain('update public.stock_movements\n       set unit_cost = (v_soma + v_resto')
    expect(s.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})

describe('o que cada lote cobriu (o Histórico e as Movimentações)', () => {
  it('o consumo de 4 ml que o AM1 cobriu só em 2 ml: 2 ml do AM1 e 2 ml sem lote', () => {
    const p = partesDoMovimento({ quantidade: -4, fator: 10, ligacoes: [{ numero: 'AM1', validade: null, embalagens: 0.2 }] })
    expect(p.lotes).toEqual([{ numero: 'AM1', validade: null, quantidade: 2 }])
    expect(p.semLote).toBe(2)
    expect(p.cobriuAFalta).toBe(0)
    expect(textoDasPartes(p, 'ml')).toBe('Lote AM1: 2 ml · 2 ml sem lote')
  })
  it('a entrada de 10 ml que cobriu 2 ml da falta: o lote AM2 com 8 ml', () => {
    const p = partesDoMovimento({ quantidade: 10, fator: 10, ligacoes: [{ numero: 'AM2', validade: '2027-03-31T00:00:00+00:00', embalagens: 0.8 }] })
    expect(p.lotes).toEqual([{ numero: 'AM2', validade: '2027-03-31T00:00:00+00:00', quantidade: 8 }])
    expect(p.semLote).toBe(0)
    expect(p.cobriuAFalta).toBe(2)
    expect(textoDasPartes(p, 'ml')).toBe('Lote AM2 val. 31/03/2027: 8 ml · 2 ml cobriram a falta de antes (sem lote)')
  })
  it('o lote que cobre o movimento inteiro diz só o lote, sem a quantidade (como antes)', () => {
    const p = partesDoMovimento({ quantidade: -4, fator: 10, ligacoes: [{ numero: 'AM1', validade: null, embalagens: 0.4 }] })
    expect(p.semLote).toBe(0)
    expect(textoDasPartes(p, 'ml')).toBe('Lote AM1')
  })
  it('dois lotes: cada um com o que cobriu', () => {
    const p = partesDoMovimento({ quantidade: -120, fator: 100, ligacoes: [
      { numero: 'TX-A', validade: null, embalagens: 1 }, { numero: 'TX-B', validade: null, embalagens: 0.2 },
    ] })
    expect(textoDasPartes(p, 'UI')).toBe('Lote TX-A: 100 UI · Lote TX-B: 20 UI')
  })
  it('o movimento sem lote nenhum não diz nada (o produto que não usa lote não ganha um "sem lote" em cada linha)', () => {
    expect(textoDasPartes(partesDoMovimento({ quantidade: 10, fator: 10, ligacoes: [] }), 'ml')).toBe('')
    const semNenhum = partesDoMovimento({ quantidade: -4, fator: 10, ligacoes: [] })
    expect(semNenhum.semLote).toBe(4)
    expect(textoDasPartes(semNenhum, 'ml')).toBe('')
  })
  it('o arredondamento das 4 casas da ligação não vira "sem lote"', () => {
    const p = partesDoMovimento({ quantidade: -4, fator: 30, ligacoes: [{ numero: 'AG1', validade: null, embalagens: 0.1333 }] })
    expect(p.semLote).toBe(0)
    expect(textoDasPartes(p, 'ml')).toBe('Lote AG1')
  })
  it('o Histórico do produto e as Movimentações dos Relatórios leem pela mesma regra', () => {
    expect(fonte('actions/stock.ts')).toMatch(/partesDoMovimento\(/)
    expect(fonte('components/admin/admin-stock-manage-modal.tsx')).toMatch(/textoDasPartes\(m\.partes, m\.unidade\)/)
    expect(fonte('lib/metrics/movimentos-de-estoque.ts')).toMatch(/partesDoMovimento\(/)
  })
  it('nos Relatórios, o lote que cobre o movimento inteiro segue no texto de sempre ("MM · val. …", e2e/estoque-perda)', () => {
    const inteiro = { quantity: -2, lotes: [{ numero: 'MM', validade: '2027-02-24', embalagens: 2, fator: 1 }] }
    expect(partesDaLinha(inteiro), 'sem partes: a tela usa textoDosLotes').toBeUndefined()
    const metade = { quantity: -4, lotes: [{ numero: 'AM1', validade: null, embalagens: 0.2, fator: 10 }] }
    expect(textoDasPartes(partesDaLinha(metade)!, 'ml')).toBe('Lote AM1: 2 ml · 2 ml sem lote')
  })
  it('a tabela das Movimentações dos Relatórios diz o que cada lote cobriu (as partes que o carregador manda)', () => {
    const s = fonte('components/admin/reports-bi-view.tsx')
    expect(s).toMatch(/import \{[^}]*\btextoDasPartes\b[^}]*\} from '@\/lib\/estoque\/lotes-do-movimento'/)
    expect(s).toContain('(l.partes && textoDasPartes(l.partes, l.medida)) || textoDosLotes(l.lotes)')
  })
})
