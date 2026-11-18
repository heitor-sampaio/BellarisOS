import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * com-06 (o Heitor, revisão de 02–03/11): "Campo vazio não gera comissão para
 * ninguém" — e o "Quem vendeu" nasce sempre vazio (r2-ven-12). No Relatório de
 * Vendas o plano sem "Quem vendeu" ia para a responsável pelo plano
 * (`coalesce(tp.vendido_por, tp.professional_id)`, D14 da 8ª): a venda virava
 * de alguém que ninguém escolheu — na coluna "Profissional" e no "só os meus".
 * Sem vendedor, a venda não é de ninguém, como o pacote, o pré-pago e o
 * produto (`sold_by` nulo).
 *
 * A prova no banco é `e2e/relatorio-vendas-plano-de-quem-vendeu.spec.ts`; aqui,
 * a definição VIGENTE da função (a última migration que a cria).
 */

const migrations = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')

function ultimaDefinicao(funcao: string): { arquivo: string; corpo: string } {
  const arquivos = readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()
  const comFuncao = arquivos.filter(f => new RegExp(`function\\s+public\\.${funcao}\\s*\\(`, 'i').test(readFileSync(path.join(migrations, f), 'utf8')))
  const arquivo = comFuncao[comFuncao.length - 1]!
  const texto = readFileSync(path.join(migrations, arquivo), 'utf8')
  const inicio = texto.search(new RegExp(`function\\s+public\\.${funcao}\\s*\\(`, 'i'))
  const fim = texto.indexOf('$function$;', inicio) >= 0 ? texto.indexOf('$function$;', inicio) : texto.indexOf('$$;', inicio)
  return { arquivo, corpo: texto.slice(inicio, fim) }
}

describe('metrics_vendas: o plano sem "Quem vendeu" não é de ninguém (com-06)', () => {
  it('a coluna e o "só os meus" do plano leem só treatment_plans.vendido_por', () => {
    const { arquivo, corpo } = ultimaDefinicao('metrics_vendas')
    expect(corpo, arquivo).not.toMatch(/coalesce\(\s*tp\.vendido_por\s*,\s*tp\.professional_id\s*\)/i)
    expect(corpo, arquivo).toMatch(/public\.users u on u\.id = tp\.vendido_por/)
    expect(corpo, arquivo).toMatch(/p_professional_id is null or tp\.vendido_por = p_professional_id/)
  })
})
