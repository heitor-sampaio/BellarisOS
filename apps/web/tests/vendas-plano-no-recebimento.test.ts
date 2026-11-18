import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * metrics_vendas (o Relatório de Vendas), dois achados da 25ª simulação:
 *
 * - D5: a forma "Crédito na clínica" voltou (CLAUDE.md §1: "'Clínica' é a mesma
 *   coisa que rede e não deve existir no sistema"). A 20261116200001 tinha
 *   trocado por "Crédito interno"; a 20261121000001 e a 20261124250001
 *   recriaram a função com o texto antigo.
 * - O plano entrava em Vendas no PRIMEIRO lançamento de receita, pago ou não
 *   (o crediário lança as parcelas em aberto). O Heitor, 18/11: "Obviamente que
 *   no recebimento. Uma coisa só foi vendida se foi paga." Agora: o primeiro
 *   lançamento PAGO do plano, que não é estorno nem estornado, com algum valor
 *   (a mesma régua de `private.plano_pagamento_que_vale`, do CRM), na data do
 *   pagamento.
 *
 * A função vigente é a última migration que a toca: a que a cria inteira
 * (`function public.metrics_vendas(`) ou a que troca trechos do corpo vivo
 * (`'public.metrics_vendas(…)'::regprocedure`, `pg_temp.trocar_no_corpo`).
 * Aqui, o corpo de 20261124250001 com as trocas das migrations seguintes
 * aplicadas.
 */

const migrations = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const CRIA = /function\s+public\.metrics_vendas\s*\(/i
const TROCA = /'public\.metrics_vendas\(uuid,uuid\[\],timestamp(?:tz| with time zone),timestamp(?:tz| with time zone),uuid\)'::regprocedure/i

/** O corpo vigente: o da última criação, com as trocas (de → para) das migrations seguintes. */
function corpoVigente(): { arquivos: string[]; corpo: string } {
  const todas = readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()
  const ler = (f: string) => readFileSync(path.join(migrations, f), 'utf8')
  const criacoes = todas.filter(f => CRIA.test(ler(f)))
  const ultima = criacoes[criacoes.length - 1]!
  const texto = ler(ultima)
  const inicio = texto.search(CRIA)
  let corpo = texto.slice(inicio, texto.indexOf('$function$;', inicio))
  const depois = todas.filter(f => f > ultima && TROCA.test(ler(f)))
  for (const f of depois) {
    const t = ler(f)
    const chamada = t.slice(t.search(TROCA))
    const arrays = [...chamada.matchAll(/array\[([\s\S]*?)\]\s*[,)]/g)].slice(0, 2)
      .map(m => [...m[1]!.matchAll(/\$t\$([\s\S]*?)\$t\$/g)].map(x => x[1]!))
    const [de, para] = arrays as [string[], string[]]
    de.forEach((d, i) => { corpo = corpo.split(d).join(para[i]!) })
  }
  return { arquivos: [ultima, ...depois], corpo }
}

describe('metrics_vendas da 25ª', () => {
  it('D5: a forma é "Crédito interno", nunca "Crédito na clínica"', () => {
    const { arquivos, corpo } = corpoVigente()
    expect(corpo, arquivos.join(' + ')).not.toMatch(/Crédito na clínica/)
    expect(corpo, arquivos.join(' + ')).toMatch(/'CREDITO', cv\.created_at, 'Crédito interno'/)
  })
  it('o plano entra em Vendas no primeiro recebimento PAGO, na data do pagamento', () => {
    const { arquivos, corpo } = corpoVigente()
    const i = corpo.indexOf("'PLANO'")
    const plano = corpo.slice(i, corpo.indexOf('union all', i))
    expect(plano, arquivos.join(' + ')).toMatch(/min\(coalesce\(f\.paid_at, f\.created_at\)\) em/)
    expect(plano, arquivos.join(' + ')).toMatch(/coalesce\(f\.is_paid, false\)/)
    expect(plano, arquivos.join(' + ')).toMatch(/f\.category is distinct from 'Estorno'/)
    expect(plano, arquivos.join(' + ')).toMatch(/coalesce\(f\.notes, ''\) <> 'Estornada'/)
    expect(plano, arquivos.join(' + ')).toMatch(/coalesce\(f\.amount, 0\) \+ coalesce\(f\.loyalty_discount, 0\) > 0/)
    expect(plano, arquivos.join(' + ')).not.toMatch(/select min\(f\.created_at\) em/)
  })
})
