import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { rotuloDaFormaDoFechamento } from '@/lib/financeiro/formas'
import { formaConferivel, linhasDaConferencia, detalheDasBandeirasEmTexto } from '@/lib/financeiro/conferencia-do-fechamento'

/**
 * D3 da 43ª simulação (vendas-financeiro:FC-15, "a despesa no cartão aparece
 * como 'Cartão'"; MQ-15, "a despesa no cartão não tem maquininha (o cartão da
 * rede não é maquininha)"; princípio 3): no Fechamento do dia, o "Conserto da
 * maca" de R$ 270 pago no cartão de DÉBITO da rede saía do Débito da
 * maquininha — "Débito registrado R$ 150" (420 − 270), contra os R$ 420 que a
 * maquininha diz, e "Cartão: R$ 0,00 (saídas R$ 270,00)" dentro da linha. Quem
 * confere pela maquininha via R$ 270 de diferença que não existe.
 *
 * A despesa no cartão vira a linha própria "Cartão" (a chave CARTAO), que não
 * se confere (não é a maquininha); a forma do cartão da maquininha fica só com
 * o que passou nela (as entradas e o estorno às clientes, que é da maquininha
 * do pagamento — FC-11).
 */

const MIGRATIONS = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')
function ultimaMigrationQueCria(funcao: string): string {
  const com = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
    .map(f => readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    .filter(s => s.includes(`function public.${funcao}(`))
  const sql = com[com.length - 1] ?? ''
  // Só o corpo da função (a migration pode criar outras).
  const inicio = sql.indexOf(`function public.${funcao}(`)
  const fim = sql.indexOf('$function$;', inicio)
  return inicio < 0 ? '' : sql.slice(inicio, fim < 0 ? undefined : fim)
}

describe('D3 da 43ª: a despesa no cartão da rede fica fora da forma da maquininha', () => {
  it('a linha da despesa no cartão se chama "Cartão" e não se confere', () => {
    expect(rotuloDaFormaDoFechamento('CARTAO')).toBe('Cartão')
    expect(formaConferivel('CARTAO')).toBe(false)
  })

  it('no banco, a despesa no crédito ou no débito tem a chave CARTAO no Fechamento', () => {
    const sql = ultimaMigrationQueCria('metrics_fechamento_do_dia')
    expect(sql).toMatch(/f\.payment_method in \('CREDIT_CARD', 'DEBIT_CARD'\) then 'CARTAO'/)
  })

  it('no banco, o cartão por maquininha e bandeira é só o que passou na maquininha (sem a despesa)', () => {
    const sql = ultimaMigrationQueCria('metrics_fechamento_por_maquininha')
    expect(sql).toContain('metrics_fechamento_por_maquininha')
    expect(sql).not.toMatch(/f\.type = 'EXPENSE'/)
  })

  it('o Débito registrado é o da maquininha; a despesa fica na linha "Cartão", sem campo', () => {
    const linhas = linhasDaConferencia({
      formas: [
        { forma: 'DEBIT_CARD', entradas: 420, saidas: 0, saldo: 420 },
        { forma: 'CARTAO', entradas: 0, saidas: 270, saldo: -270 },
      ],
      esperadoDinheiro: 0, ultimo: null,
    })
    expect(linhas.find(l => l.forma === 'DEBIT_CARD')?.registrado).toBe(420)
    const cartao = linhas.find(l => l.forma === 'CARTAO')
    expect(cartao?.conferivel).toBe(false)
    // O detalhe da forma é só da maquininha: nada de "Cartão: R$ 0,00 (saídas …)".
    const txt = detalheDasBandeirasEmTexto('DEBIT_CARD', [
      { forma: 'DEBIT_CARD', maquininha: 'Azul', bandeira: 'VISA', entradas: 420, saidas: 0 },
    ], true)
    expect(txt).not.toContain('Cartão:')
  })
})
