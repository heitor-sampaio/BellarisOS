import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A1–A6 da 22ª simulação (2026-11-17): Configurações → Cargos e a Equipe.
 *
 * A1 [3]: a matriz mostrava o PDV em "Sem acesso" num cargo que abre o PDV
 * pelo Financeiro em Gerenciar (PDV1, `podeReceber`).
 * A2 [3]: Tratamentos aparecia no resumo sem dizer de onde vem.
 * A3 [3]: o aviso do escopo pendente, junto do Salvar, não levava à linha.
 * A4 [7]: a "Comissão padrão (%)" só aparecia depois do "Atende clientes".
 * A5 [design]: a coluna de ações da Equipe cortava a 1440 px.
 * A6 [3]: o Reativar não dizia o que volta e o que não volta.
 */

const ler = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const editor = () => ler('components/admin/roles-editor.tsx')

describe('A1: a linha do PDV diz que o Financeiro em Gerenciar o abre', () => {
  it('o texto, só com o PDV fechado e o Financeiro em Gerenciar', async () => {
    const { pdvAbertoPeloFinanceiro } = await import('@/lib/permissions-copy')
    expect(pdvAbertoPeloFinanceiro({ cashier: 'NONE', financial: 'MANAGE' })).toBe('Aberto pelo Financeiro em Gerenciar')
    expect(pdvAbertoPeloFinanceiro({ cashier: 'MANAGE', financial: 'MANAGE' })).toBeNull()
    expect(pdvAbertoPeloFinanceiro({ cashier: 'NONE', financial: 'VIEW' })).toBeNull()
  })
  it('a dica do PDV em "Sem acesso" diz a exceção', async () => {
    const { LEVEL_COPY } = await import('@/lib/permissions-copy')
    expect(LEVEL_COPY.cashier.NONE).toContain('Financeiro em Gerenciar')
  })
  it('a linha do PDV mostra', () => {
    const f = editor()
    expect(f).toContain('pdvAbertoPeloFinanceiro(')
    expect(f).toContain('data-pdv-pelo-financeiro')
  })
})

describe('A2: o resumo diz de onde vem Tratamentos', () => {
  it('o texto, com o Prontuário ou com quem recebe', async () => {
    const { tratamentosNoResumo } = await import('@/lib/permissions-copy')
    expect(tratamentosNoResumo({ medical_records: 'VIEW' })).toMatch(/^Tratamentos vem do Prontuário ou de quem recebe/)
    expect(tratamentosNoResumo({ financial: 'MANAGE' })).toMatch(/^Tratamentos vem do Prontuário ou de quem recebe/)
    expect(tratamentosNoResumo({ medical_records: 'NONE', cashier: 'NONE', financial: 'VIEW' })).toBeNull()
  })
  it('o resumo usa o texto numa dica', () => {
    const f = editor()
    expect(f).toContain('tratamentosNoResumo(')
    expect(f).toContain('<Dica rotulo="De onde vem Tratamentos">')
  })
})

describe('A3: o aviso do que falta leva à primeira linha pendente', () => {
  it('o aviso junto do Salvar é um botão que rola até a linha', () => {
    const f = editor()
    expect(f).toContain('data-ir-ao-que-falta')
    expect(f).toMatch(/function irAoQueFalta\(/)
    expect(f).toMatch(/data-ir-ao-que-falta[\s\S]{0,200}onClick=\{irAoQueFalta\}/)
  })
})

describe('A4: a comissão padrão aparece no Novo membro antes do "Atende clientes"', () => {
  it('as duas telas mostram o campo com a comissão no plano, desligado sem atender', () => {
    const rede = ler('components/admin/team-form.tsx')
    expect(rede).not.toMatch(/\{atende && podeComissao && \(/)
    expect(rede).toMatch(/id="tm-comissao"[^>]*disabled=\{!atende\}/)
    const unidade = ler('components/branch/team-form.tsx')
    expect(unidade).not.toMatch(/\{atendeEm\.length > 0 && podeComissao && \(/)
    expect(unidade).toMatch(/id="tm-comissao"[^>]*disabled=\{atendeEm\.length === 0\}/)
  })
})

describe('A5: a coluna de ações da Equipe quebra a linha em vez de cortar', () => {
  it('as duas Equipes', () => {
    for (const f of ['app/admin/team/page.tsx', 'app/[slug]/team/page.tsx']) {
      expect(ler(f), f).toMatch(/data-acoes-do-membro style=\{\{ display: 'flex', flexWrap: 'wrap'/)
    }
  })
})

describe('A6: o Reativar diz o que volta e o que não volta', () => {
  it('o texto', async () => {
    const { textoDoReativado } = await import('@/lib/equipe/textos-do-cadastro')
    expect(textoDoReativado('Dr. Otávio', true))
      .toBe('Dr. Otávio voltou: entra no sistema e atende como antes. O que foi repassado ao desativar continua com quem recebeu.')
    expect(textoDoReativado('Júlia', false))
      .toBe('Júlia voltou: entra no sistema como antes. O que foi repassado ao desativar continua com quem recebeu.')
  })
  it('o botão confirma com o texto, nas duas Equipes', () => {
    const f = ler('components/admin/reativar-membro.tsx')
    expect(f).toContain('toast.success(textoDoReativado(')
    for (const p of ['app/admin/team/page.tsx', 'app/[slug]/team/page.tsx']) {
      expect(ler(p), p).toMatch(/<ReativarMembro membroId=\{m\.id\} nome=\{m\.name\} atende=\{!!m\.provides_services\}/)
    }
  })
})
