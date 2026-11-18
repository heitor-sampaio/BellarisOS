import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * A6 da 25ª simulação, a parte do banco: as recusas e os textos do pré-pago
 * diziam "unidade" querendo dizer a SESSÃO paga ("Esta unidade está agendada",
 * "Unidade não encontrada."). "Unidade" é a unidade da rede (CLAUDE.md §1); a
 * tela já diz "sessão" (`tests/pre-pago-sessao-no-texto.test.ts`). O
 * "Unidade não encontrada." de `procedimento_vender*` é da unidade da REDE
 * (`public.branches`) e fica, como "Este procedimento é de outra unidade.".
 *
 * A definição vigente de cada função: a da última migration que a cria, com as
 * trocas (`pg_temp.trocar_no_corpo`) das migrations seguintes aplicadas.
 */

const migrations = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const todas = readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()
const ler = (f: string) => readFileSync(path.join(migrations, f), 'utf8')

function corpoVigente(nome: string): { arquivos: string[]; corpo: string } {
  const cria = new RegExp(String.raw`function\s+public\.` + nome + String.raw`\s*\(`, 'i')
  // Só a troca por `pg_temp.trocar_no_corpo` (as de outro formato, num `do`, não mexem nestas frases).
  const troca = new RegExp(String.raw`trocar_no_corpo\(\s*'public\.` + nome + String.raw`\([^']*\)'::regprocedure`, 'i')
  const criacoes = todas.filter(f => cria.test(ler(f)))
  const ultima = criacoes[criacoes.length - 1]!
  const texto = ler(ultima)
  const inicio = texto.search(cria)
  let corpo = texto.slice(inicio, texto.indexOf('$function$;', inicio))
  const depois = todas.filter(f => f > ultima && troca.test(ler(f)))
  for (const f of depois) {
    const t = ler(f)
    const chamada = t.slice(t.search(troca))
    const arrays = [...chamada.matchAll(/array\[([\s\S]*?)\]\s*[,)]/g)].slice(0, 2)
      .map(m => [...m[1]!.matchAll(/\$t\$([\s\S]*?)\$t\$/g)].map(x => x[1]!))
    const [de, para] = arrays as [string[], string[]]
    de.forEach((d, i) => { corpo = corpo.split(d).join(para[i]!) })
  }
  return { arquivos: [ultima, ...depois], corpo }
}

describe('A6 da 25ª: o banco diz "sessão" para a sessão do pré-pago', () => {
  it('agendar usando o pré-pago', () => {
    const { arquivos, corpo } = corpoVigente('agendamento_usar_credito')
    expect(corpo, arquivos.join(' + ')).not.toMatch(/Esta unidade pré-paga/)
    expect(corpo, arquivos.join(' + ')).toMatch(/'Esta sessão pré-paga não serve a este agendamento/)
  })
  it('cancelar a sessão do pré-pago: recusas, motivo do estorno, descrição e comissão', () => {
    const { arquivos, corpo } = corpoVigente('procedimento_cancelar_unidade_devolvendo')
    const onde = arquivos.join(' + ')
    for (const velho of [
      /'Unidade não encontrada\.'/, /Só uma unidade ainda disponível/, /Esta unidade está agendada/,
      /'Unidade cancelada: '/, /'Cancelamento da unidade '/, /no cancelamento da unidade '/, /Cancelamento de unidade do pré-pago/,
    ]) expect(corpo, `${onde}: ${velho}`).not.toMatch(velho)
    expect(corpo.split(`'Sessão não encontrada.'`).length - 1, onde).toBe(2)
    expect(corpo, onde).toMatch(/'Esta sessão está agendada: cancele o agendamento antes\.'/)
  })
  for (const nome of ['procedimento_vender', 'procedimento_vender_com_equipe']) {
    it(`${nome}: o rateio é das sessões; a unidade da rede fica`, () => {
      const { arquivos, corpo } = corpoVigente(nome)
      expect(corpo, arquivos.join(' + ')).not.toMatch(/rateio das unidades/)
      expect(corpo, arquivos.join(' + ')).toMatch(/'O rateio das sessões não fecha com o valor da venda\.'/)
      // A unidade da REDE (branches): fica.
      expect(corpo, arquivos.join(' + ')).toMatch(/'Este procedimento é de outra unidade\.'/)
      expect(corpo, arquivos.join(' + ')).toMatch(/'Unidade não encontrada\.'/)
    })
  }
})
