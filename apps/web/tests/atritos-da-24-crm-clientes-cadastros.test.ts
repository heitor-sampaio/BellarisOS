import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Os atritos de tela da 24ª simulação (2026-11-18) fora do Copilot.
 *
 * A42 [3]: o link `?funil=` abria o funil e não ficava lembrado (o cookie só
 * nascia no clique do seletor), e a tela não dizia que o lembrado é DESTE
 * navegador.
 * A43 [design]: o "…" do cartão de oportunidade era só o ícone.
 * A9 [3]: o "Quem realiza" vazio sem chip (só a dica dizia "todos"); a coluna
 * App do catálogo com o mesmo ícone, sem sim ou não; a Nova unidade sem a
 * faixa do domingo fechado do /setup; o rótulo "Categoria" do Novo produto
 * centralizado.
 * A12 [3]: o selo "Novo" das fichas importadas, sem dizer que é um estado
 * calculado (não é tag: a rede não tem tags, e o sistema nunca põe uma).
 */

const RAIZ = join(__dirname, '..')
const fonte = (arquivo: string) => readFileSync(join(RAIZ, arquivo), 'utf8')

describe('A42: o ?funil= também fica lembrado, e a tela diz que é deste navegador', () => {
  it('o funil aberto pelo endereço se lembra; o que caiu no padrão, não', async () => {
    const { funilParaLembrar, cookieDoFunilLembrado, COOKIE_DO_FUNIL } = await import('@/lib/crm/funil-lembrado')
    expect(funilParaLembrar('f-corporal', 'f-corporal')).toBe('f-corporal')
    // O endereço pediu um funil que não vale (outra rede, inativo): abriu outro, e nada se lembra.
    expect(funilParaLembrar('f-de-fora', 'f-padrao')).toBeNull()
    expect(funilParaLembrar(null, 'f-padrao')).toBeNull()
    expect(cookieDoFunilLembrado('f 1')).toBe(`${COOKIE_DO_FUNIL}=f%201; path=/; max-age=31536000; samesite=lax`)
  })

  it('o seletor anota o funil do endereço e diz, na dica, que o lembrado é deste navegador', () => {
    const s = fonte('components/shared/funnel-select.tsx')
    expect(s).toContain('funilParaLembrar(')
    expect(s).toContain('cookieDoFunilLembrado(')
    expect(s).toMatch(/<Dica rotulo="Sobre o funil que abre"/)
    expect(s).toMatch(/neste navegador/)
  })
})

describe('A43: o "…" do cartão de oportunidade diz o que é', () => {
  it('o botão tem o nome à vista ("Ações") e o nome acessível', () => {
    const s = fonte('components/branch/crm-board.tsx')
    expect(s).toContain('aria-label="Ações da oportunidade"')
    expect(s).toMatch(/data-acoes-do-card[\s\S]{0,900}<MoreHorizontal size=\{12\} \/>\s*<span[^>]*>Ações<\/span>/)
  })
})

describe('A9: os cadastros dizem o que o vazio e a marca querem dizer', () => {
  it('"Quem realiza" vazio tem o chip "Todos que atendem" marcado', () => {
    const s = fonte('components/admin/procedure-form.tsx')
    expect(s).toContain('data-quem-realiza-todos')
    expect(s).toMatch(/aria-pressed=\{quemRealiza\.length === 0\}/)
    expect(s).toContain('Todos que atendem')
  })

  it('a coluna App do catálogo diz Sim ou Não', () => {
    const s = fonte('app/_shared/catalogo-de-procedimentos.tsx')
    expect(s).toMatch(/data-no-app[\s\S]{0,800}> Sim\s*<\/span>[\s\S]{0,300}>Não</)
  })

  it('a Nova unidade tem a faixa do domingo fechado, a mesma do /setup', () => {
    expect(fonte('components/shared/aviso-do-domingo-fechado.tsx')).toContain('O domingo vem fechado.')
    expect(fonte('components/admin/branch-form.tsx')).toContain('<AvisoDoDomingoFechado')
    expect(fonte('components/setup/setup-wizard.tsx')).toContain('<AvisoDoDomingoFechado')
  })

  it('o rótulo do campo (.field-label) é alinhado à esquerda em qualquer janela', () => {
    const css = readFileSync(join(RAIZ, '..', '..', 'packages', 'nucleo', 'src', 'estilos', 'globals.css'), 'utf8')
    expect(css).toMatch(/\.field-label \{[^}]*text-align: left;/)
  })
})

describe('A12: o selo "Novo" diz que é calculado, e não é tag', () => {
  it('a lista de clientes explica os selos numa dica, e o "Novo" diz a regra ao passar o mouse', () => {
    const s = fonte('components/branch/clients-sidebar.tsx')
    expect(s).toMatch(/<Dica rotulo="Sobre os selos da lista"/)
    expect(s).toMatch(/não são tags/)
    expect(s).toContain('TITULO_DO_SELO_NOVO')
  })
})
