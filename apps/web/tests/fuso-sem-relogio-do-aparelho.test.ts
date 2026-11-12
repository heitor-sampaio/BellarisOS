import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * F64 (13ª simulação, D1–D6): a hora ainda saía do relógio do APARELHO ou do
 * SERVIDOR em cinco lugares — o modal do agendamento, os avisos do sininho, a
 * ficha, a tela do atendimento e a campanha agendada. A regra é uma
 * (`indicadores.md`, "O fuso é o da UNIDADE"): o instante se formata no fuso
 * (`formatarNoFuso`, `timeZone: fuso`), e o `format` do date-fns direto num
 * instante usa o relógio de quem roda.
 *
 * A grade da agenda trabalha "na parede" (`naParede`/`isoNaParede`): ali o
 * Date já está no relógio da unidade, e a linha diz isso (o comentário com
 * "parede"), que é o que este teste aceita.
 */
const WEB = path.resolve(__dirname, '..')
const PASTAS = ['app', 'components', 'lib', 'actions'].map(p => path.join(WEB, p))

function arquivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (['node_modules', '.next'].includes(e.name)) return []
    const p = path.join(dir, e.name)
    return e.isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}

const linhas = PASTAS.flatMap(arquivos).flatMap(f =>
  fs.readFileSync(f, 'utf8').split('\n').map((l, i) => ({ onde: `${path.relative(WEB, f).replace(/\\/g, '/')}:${i + 1}`, l, f })))

describe('nenhuma hora no relógio do aparelho ou do servidor', () => {
  it('o format do date-fns não recebe um instante cru (é formatarNoFuso, ou a grade "de parede")', () => {
    const cru = linhas.filter(({ l }) => /(^|[^.\w])format\(\s*(new Date|parseISO)\(/.test(l) && !/parede/.test(l))
    expect(cru.map(x => x.onde)).toEqual([])
  })

  it('new Date(…).toLocaleString / Intl sem timeZone não formata data', () => {
    const sem = linhas.filter(({ l }, i, todas) => {
      if (!/new Date\([^)]*\)\.toLocale(Date|Time)?String\(/.test(l)) return false
      const trecho = todas.slice(i, i + 4).map(x => x.l).join(' ')
      // A data de PAREDE ("2026-11-12T00:00:00", sem fuso) é lida no relógio local de propósito.
      return !/timeZone/.test(trecho) && !/parede/.test(trecho) && !/T(00|12):00(:00)?['`]/.test(trecho)
    })
    expect(sem.map(x => x.onde)).toEqual([])
  })

  it('isToday / isYesterday do date-fns (o dia do aparelho) não decidem o "Hoje"', () => {
    const uso = linhas.filter(({ l }) => /\b(isToday|isYesterday)\(/.test(l))
    expect(uso.map(x => x.onde)).toEqual([])
  })

  it('os avisos da agenda formatam com o fuso da unidade', () => {
    const semFuso = linhas.filter(({ l, f }) => !f.endsWith(path.join('appointments', 'avisos.ts'))
      && /\bfmtDateTime\(\s*[^,()]+(\([^()]*\))?\s*\)/.test(l) && !/function fmtDateTime/.test(l)
      && !f.endsWith(path.join('lgpd', 'export.ts')) && !f.endsWith(path.join('cliente', 'home', 'page.tsx')) && !f.endsWith('treatment-file-modal.tsx'))
    expect(semFuso.map(x => x.onde)).toEqual([])
  })

  it('o lançamento pago no dia escolhido usa o hoje da unidade', () => {
    const lanc = fs.readFileSync(path.join(WEB, 'lib', 'financeiro', 'lancamento.ts'), 'utf8')
    expect(lanc).not.toMatch(/pagoNoDia\(l\.pagoEm\)/)
  })

  it('nada lê o fuso de Brasília fixo para decidir o vencimento ou o dia do plano', () => {
    const fixo = ['lib/financeiro/vencimentos.ts', 'lib/checkout/em-aberto-do-plano.ts', 'components/branch/planejamento-tratamento.tsx']
      .filter(f => /timeZone: 'America\/Sao_Paulo'/.test(fs.readFileSync(path.join(WEB, f), 'utf8')))
    expect(fixo).toEqual([])
  })
})
