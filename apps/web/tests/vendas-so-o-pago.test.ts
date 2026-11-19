import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * D6 (o Heitor, 18/11, sobre a 25ª simulação): "nao pago nao conta na venda".
 * A pergunta era se o atendimento avulso, o pacote, o pré-pago e o produto NÃO
 * pagos contavam em Relatórios → Vendas — e contavam: o avulso pelo dia em que
 * aconteceu, o pacote e o pré-pago pela venda, o produto pela venda e o
 * crédito vendido pela criação, pagos ou não. O plano já entrava só no
 * primeiro recebimento PAGO (20261124900002; o Heitor, 18/11: "Uma coisa só
 * foi vendida se foi paga."). Agora todos os tipos seguem a régua do plano: a
 * venda entra quando há dinheiro pago dela, na data do 1º recebimento pago
 * (`min(coalesce(paid_at, created_at))` dos lançamentos de receita pagos, que
 * não são estorno nem estornados, com algum valor — o dinheiro ou os pontos e
 * o voucher).
 *
 * A função vigente é a do corpo de 20261124250001 com as trocas das migrations
 * seguintes (`pg_temp.trocar_no_corpo`), como em vendas-plano-no-recebimento.
 */

const migrations = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const CRIA = /function\s+public\.metrics_vendas\s*\(/i
const TROCA = /'public\.metrics_vendas\(uuid,uuid\[\],timestamp(?:tz| with time zone),timestamp(?:tz| with time zone),uuid\)'::regprocedure/i

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
    de.forEach((d, i) => {
      // A migration para se o trecho não aparece: aqui também.
      expect(corpo.includes(d), `${f}: trecho ${i + 1} não está no corpo`).toBe(true)
      corpo = corpo.split(d).join(para[i]!)
    })
  }
  return { arquivos: [ultima, ...depois], corpo }
}

/** O pedaço do `union all` de um tipo (do select dele até o próximo `union all`, ou o fim). */
function ramo(corpo: string, tipo: string): string {
  const i = corpo.indexOf(`'${tipo}'`)
  const fim = corpo.indexOf('union all', i)
  return corpo.slice(i, fim < 0 ? undefined : fim)
}

const PAGO = [
  /coalesce\(f\.is_paid, false\)/,
  /f\.type::text = 'INCOME'/,
  /f\.estorno_de is null/,
  /f\.category is distinct from 'Estorno'/,
  /coalesce\(f\.notes, ''\) <> 'Estornada'/,
  /coalesce\(f\.amount, 0\) \+ coalesce\(f\.loyalty_discount, 0\) > 0/,
  /min\(coalesce\(f\.paid_at, f\.created_at\)\) em/,
]

const TIPOS: { tipo: string; chave: RegExp; dataAntiga: RegExp }[] = [
  { tipo: 'PROCEDIMENTO', chave: /f\.appointment_id = a\.id and f\.type::text = 'INCOME'/, dataAntiga: /a\.aconteceu_em between p_from and p_to/ },
  { tipo: 'PACOTE',       chave: /f\.client_package_id = cp\.id/,                          dataAntiga: /cp\.purchased_at between p_from and p_to/ },
  { tipo: 'PRE_PAGO',     chave: /f\.procedure_sale_id = v\.id/,                           dataAntiga: /v\.sold_at between p_from and p_to/ },
  { tipo: 'PRODUTO',      chave: /f\.product_sale_id = ps\.id/,                            dataAntiga: /ps\.sold_at between p_from and p_to/ },
  { tipo: 'CREDITO',      chave: /f\.credito_vendido_id = cv\.id/,                         dataAntiga: /cv\.created_at between p_from and p_to/ },
]

describe('D6: não pago não conta na venda (metrics_vendas)', () => {
  for (const { tipo, chave, dataAntiga } of TIPOS) {
    it(`${tipo}: entra no 1º recebimento pago dele, na data desse recebimento`, () => {
      const { arquivos, corpo } = corpoVigente()
      const r = ramo(corpo, tipo)
      const onde = `${arquivos.join(' + ')} — ${tipo}`
      expect(r, onde).toMatch(chave)
      for (const p of PAGO) expect(r, onde).toMatch(p)
      expect(r, onde).toMatch(/rec\.em between p_from and p_to/)
      expect(r, onde).toMatch(new RegExp(`'${tipo}', rec\\.em,`))
      expect(r, onde).not.toMatch(dataAntiga)
    })
  }

  it('o plano segue como estava (a régua de que todos partem)', () => {
    const { arquivos, corpo } = corpoVigente()
    const r = ramo(corpo, 'PLANO')
    for (const p of PAGO) expect(r, arquivos.join(' + ')).toMatch(p)
    expect(r, arquivos.join(' + ')).toMatch(/rec\.em between p_from and p_to/)
  })
})
