import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as regra from '@/lib/pacotes/tamanho-e-valor'
import { lerPacotesDaPlanilha } from '@/lib/importacao/normalizar'

/**
 * O Heitor, 25/11, sobre os limites que recusavam o valor que a rede escolheu:
 * "Se não for impossível, ainda que improvável, pode ser feito."
 *
 * O pacote do catálogo recusava mais de 100 sessões (no total e em cada
 * procedimento), mais de 30 procedimentos e preço acima de R$ 1.000.000; o
 * "Trazer pacote de fora", mais de 100 sessões e valor de referência acima de
 * R$ 10.000.000 — o preço e o valor com a mensagem do zod em inglês.
 *
 * Decisão do Claude, 25/11: o "comum" é o antigo teto (acima dele a tela avisa
 * e o servidor grava). O impossível: cada sessão vira UMA LINHA em
 * `package_sessions`, então até 32.767 sessões (o limite do crediário); o
 * preço e o valor de referência gravam em `service_packages.price`
 * (numeric(10,2)), então até R$ 99.999.999,99. Os 30 procedimentos não têm
 * motivo técnico: saem (cada linha tem ao menos uma sessão, e as sessões já
 * têm o limite).
 */

const APP = join(__dirname, '..')
const ler = (p: string) => readFileSync(join(APP, p), 'utf8')
const mensagem = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.success ? '' : r.error!.issues[0]!.message

describe('as sessões do pacote: acima de 100 avisa, acima de 32.767 recusa', () => {
  it('a conta', () => {
    expect(regra.avisoDasSessoesDoPacote(150)).toBe('Acima do comum (mais de 100 sessões). Confira: o valor vale como está.')
    expect(regra.avisoDasSessoesDoPacote(100)).toBeNull()
    expect(regra.recusaDasSessoesDoPacote(32_767)).toBeNull()
    expect(regra.recusaDasSessoesDoPacote(32_768)).toBe('No máximo 32.767 sessões num pacote (o limite do registro).')
  })
  it('cada procedimento do catálogo aceita 150 sessões; zero e fracionário recusam em português', () => {
    expect(regra.SessoesDoItemDoPacote.parse(150)).toBe(150)
    expect(mensagem(regra.SessoesDoItemDoPacote.safeParse(0))).toBe('Cada procedimento entra pelo menos uma vez.')
    expect(mensagem(regra.SessoesDoItemDoPacote.safeParse(1.5))).toBe('O número de sessões é inteiro.')
  })
  it('o pacote de fora aceita 150 sessões e recusa acima do registro', () => {
    expect(regra.SessoesDoPacoteDeFora.parse(150)).toBe(150)
    expect(mensagem(regra.SessoesDoPacoteDeFora.safeParse(32_768))).toBe('No máximo 32.767 sessões num pacote (o limite do registro).')
    expect(mensagem(regra.SessoesDoPacoteDeFora.safeParse(0))).toBe('O pacote tem pelo menos 1 sessão.')
    expect(mensagem(regra.UsadasDoPacoteDeFora.safeParse(2.5))).toBe('O número de sessões é inteiro.')
  })
})

describe('o preço do pacote e o valor de referência: acima do antigo teto avisa', () => {
  it('o preço: R$ 2.000.000 grava, com o aviso; acima de R$ 99.999.999,99 recusa em português', () => {
    expect(regra.PrecoDoPacote.parse(2_000_000)).toBe(2_000_000)
    expect(regra.avisoDoPrecoDoPacote(2_000_000)).toBe('Acima do comum (mais de 1.000.000 reais). Confira: o valor vale como está.')
    expect(regra.avisoDoPrecoDoPacote(1_000_000)).toBeNull()
    expect(regra.PrecoDoPacote.parse(99_999_999.99)).toBe(99_999_999.99)
    expect(mensagem(regra.PrecoDoPacote.safeParse(100_000_000))).toBe('No máximo 99.999.999,99 reais (o limite do registro).')
    expect(mensagem(regra.PrecoDoPacote.safeParse(-1))).toBe('O preço do pacote não pode ser negativo.')
  })
  it('o valor de referência: R$ 20.000.000 grava, com o aviso; acima do registro recusa em português', () => {
    expect(regra.ValorDeReferenciaDoPacote.parse(20_000_000)).toBe(20_000_000)
    expect(regra.ValorDeReferenciaDoPacote.parse(null)).toBeNull()
    expect(regra.avisoDoValorDeReferencia(20_000_000)).toBe('Acima do comum (mais de 10.000.000 reais). Confira: o valor vale como está.')
    expect(regra.avisoDoValorDeReferencia(10_000_000)).toBeNull()
    expect(mensagem(regra.ValorDeReferenciaDoPacote.safeParse(100_000_000))).toBe('No máximo 99.999.999,99 reais (o limite do registro).')
    expect(mensagem(regra.ValorDeReferenciaDoPacote.safeParse(-1))).toBe('O valor de referência não pode ser negativo.')
  })
})

describe('as actions e as telas leem a mesma regra, sem o teto de antes', () => {
  it('actions/pacotes.ts', () => {
    const a = ler('actions/pacotes.ts')
    expect(a).not.toMatch(/No máximo 100 sessões/)
    expect(a).not.toMatch(/1_000_000|10_000_000/)
    expect(a).not.toMatch(/\.max\(30\)/)
    expect(a).not.toMatch(/\.max\(100\)/)
    expect(a).toMatch(/SessoesDoItemDoPacote/)
    expect(a).toMatch(/PrecoDoPacote/)
    expect(a).toMatch(/recusaDasSessoesDoPacote/)
    expect(a).toMatch(/SessoesDoPacoteDeFora/)
    expect(a).toMatch(/ValorDeReferenciaDoPacote/)
  })
  it('o catálogo avisa as sessões e o preço, sem parar em 100', () => {
    const t = ler('components/admin/pacotes-catalogo.tsx')
    expect(t).not.toMatch(/max=\{100\}/)
    expect(t).toMatch(/avisoDasSessoesDoPacote\(/)
    expect(t).toMatch(/avisoDoPrecoDoPacote\(/)
    expect(t).toMatch(/data-acima-do-comum="sessoes-do-pacote"/)
    expect(t).toMatch(/data-acima-do-comum="preco-do-pacote"/)
  })
  it('o "Trazer pacote de fora" avisa as sessões e o valor, sem parar em 100', () => {
    const t = ler('components/shared/trazer-pacote-de-fora.tsx')
    expect(t).not.toMatch(/max=\{100\}|max=\{99\}/)
    expect(t).toMatch(/avisoDasSessoesDoPacote\(/)
    expect(t).toMatch(/avisoDoValorDeReferencia\(/)
    expect(t).toMatch(/data-acima-do-comum="sessoes-do-pacote-de-fora"/)
    expect(t).toMatch(/data-acima-do-comum="valor-de-referencia"/)
  })
})

describe('a importação ("Pacote de antes") segue a mesma regra', () => {
  const procs = { procedimentos: [{ id: 'p1', nome: 'Limpeza de pele' }] }
  it('lê o pacote de 150 e de 5.000 sessões', () => {
    expect(lerPacotesDaPlanilha('Limpeza de pele; 150; 10', procs).pacotes).toEqual([{ procedimentoId: 'p1', total: 150, usadas: 10, valor: null, validade: null }])
    expect(lerPacotesDaPlanilha('Limpeza de pele; 5000; 1000', procs).pacotes.map(p => p.total)).toEqual([5000])
  })
  it('acima do registro, fica de fora com o motivo', () => {
    expect(lerPacotesDaPlanilha('Limpeza de pele; 40000; 1', procs).avisos)
      .toEqual(['Pacote de antes acima do limite ("Limpeza de pele; 40000; 1"): No máximo 32.767 sessões num pacote (o limite do registro). Importada sem esse pacote.'])
  })
})

describe('o banco: sem o teto de 100 sessões, com o limite do registro', () => {
  const pasta = join(APP, '..', '..', 'supabase', 'migrations')
  const nome = readdirSync(pasta).find(n => n.startsWith('20261207300001'))
  it('a migration nova', () => {
    expect(nome, 'a migration nova').toBeTruthy()
    const sql = readFileSync(join(pasta, nome!), 'utf8')
    expect(sql).toMatch(/service_package_items_quantity_check check \(quantity between 1 and 32767\)/)
    expect(sql).toContain('public.pacote_salvar(')
    expect(sql).toContain('public.pacote_trazer(')
    expect(sql).toContain('p_total > 32767')
    expect(sql).toContain('v_total > 32767')
    expect(sql).toContain('p_preco > 99999999.99')
    expect(sql).toContain('v_valor > 99999999.99')
    expect(sql).not.toMatch(/create policy/i)
    expect(sql.trimEnd().endsWith(`notify pgrst, 'reload schema';`)).toBe(true)
  })
})
