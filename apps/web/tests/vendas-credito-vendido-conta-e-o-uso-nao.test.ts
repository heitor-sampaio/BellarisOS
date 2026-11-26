import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * O Heitor, 25/11, sobre o crédito interno em Relatórios → Vendas: "se o
 * crédito foi vendido, é venda, tem que contar, não conta é quando só usa".
 *
 * Era o contrário (RL1, 14/11, decisão do Claude): o crédito vendido ficava
 * FORA do "Total vendido", e o que se pagava com ele contava. Agora:
 * - o crédito vendido entra no "Total vendido" (`metrics_vendas_resumo`);
 * - o que se paga com crédito interno não conta de novo: o pagamento com
 *   crédito não faz a venda entrar (a régua do primeiro recebimento pago o
 *   deixa de fora), e a parte paga com ele sai do valor da linha.
 */

const migrations = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const todas = readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()
const ler = (f: string) => readFileSync(path.join(migrations, f), 'utf8')

const CRIA = /function\s+public\.metrics_vendas\s*\(/i
const TROCA = /'public\.metrics_vendas\(uuid,uuid\[\],timestamp(?:tz| with time zone),timestamp(?:tz| with time zone),uuid\)'::regprocedure/i

/** O corpo vigente de `metrics_vendas`: a última criação com as trocas das migrations seguintes. */
function corpoVigente(): string {
  const criacoes = todas.filter(f => CRIA.test(ler(f)))
  const ultima = criacoes[criacoes.length - 1]!
  const texto = ler(ultima)
  const inicio = texto.search(CRIA)
  let corpo = texto.slice(inicio, texto.indexOf('$function$;', inicio))
  for (const f of todas.filter(x => x > ultima && TROCA.test(ler(x)))) {
    const t = ler(f)
    const chamada = t.slice(t.search(TROCA))
    const [de, para] = [...chamada.matchAll(/array\[([\s\S]*?)\]\s*[,)]/g)].slice(0, 2)
      .map(m => [...m[1]!.matchAll(/\$t\$([\s\S]*?)\$t\$/g)].map(x => x[1]!)) as [string[], string[]]
    de.forEach((d, i) => {
      expect(corpo.includes(d), `${f}: trecho ${i + 1} não está no corpo`).toBe(true)
      corpo = corpo.split(d).join(para[i]!)
    })
  }
  return corpo
}

function ramo(corpo: string, tipo: string): string {
  const i = corpo.indexOf(`'${tipo}'`)
  const fim = corpo.indexOf('union all', i)
  return corpo.slice(i, fim < 0 ? undefined : fim)
}

/** A última definição de `metrics_vendas_resumo`. */
function resumoVigente(): string {
  const cria = /function\s+public\.metrics_vendas_resumo\s*\(/i
  const ultima = todas.filter(f => cria.test(ler(f))).pop()!
  const t = ler(ultima)
  const i = t.search(cria)
  return t.slice(i, t.indexOf('$$;', i) > 0 ? t.indexOf('$$;', i) : undefined)
}

const SEM_O_CREDITO = /f\.payment_method::text is distinct from 'INTERNAL_CREDIT'/
const O_PAGO_COM_CREDITO = /f\.payment_method::text = 'INTERNAL_CREDIT'/

describe('o crédito vendido conta, e o pago com crédito interno não conta de novo', () => {
  const corpo = corpoVigente()

  for (const tipo of ['PROCEDIMENTO', 'PACOTE', 'PRE_PAGO', 'PLANO', 'PRODUTO']) {
    it(`${tipo}: o pagamento com crédito interno não faz a venda entrar`, () => {
      expect(ramo(corpo, tipo)).toMatch(SEM_O_CREDITO)
    })
    it(`${tipo}: a parte paga com crédito interno sai do valor da linha`, () => {
      expect(ramo(corpo, tipo)).toMatch(O_PAGO_COM_CREDITO)
    })
  }

  it('o "Total vendido" (a linha geral do resumo) soma o crédito vendido', () => {
    const r = resumoVigente()
    expect(r).not.toMatch(/tipo <> 'CREDITO'/)
  })

  it('a tela não diz mais que o crédito fica fora do total', () => {
    const tela = readFileSync(path.join(__dirname, '..', 'components', 'admin', 'reports-bi-view.tsx'), 'utf8')
    expect(tela).not.toContain('data-credito-fora-do-total')
    expect(tela).not.toContain('a venda é o que for pago com ele')
    const comum = readFileSync(path.join(__dirname, '..', 'lib', 'metrics', 'vendas-comum.ts'), 'utf8')
    expect(comum).not.toMatch(/export const FORA_DO_TOTAL/)
  })
})
