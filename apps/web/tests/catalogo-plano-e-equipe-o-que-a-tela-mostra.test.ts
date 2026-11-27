import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const fonte = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8')

/**
 * O que a tela mostra (decisões do Claude, 27/11, pela regra citada em cada caso).
 */
describe('D12: o plano só se abre a quem tem o Atendimento (PL-01; CLAUDE.md §14, "a tela esconde")', () => {
  it('a lista de planos propostos (PDV) só leva ao plano quem tem o Atendimento em Ver', () => {
    const f = fonte('app/_shared/lista-de-checkout.tsx')
    expect(f).toMatch(/const abreOPlano = can\(ctx, 'atendimento', 'VIEW'\)/)
    // A linha só é link, e o "Ver o plano" só aparece, para quem abre o plano.
    expect(f).toMatch(/abreOPlano\s*\?\s*<Link key=\{plan\.id\} href=\{`\$\{base\}\/planejamentos\/\$\{plan\.id\}`\}/)
    expect(f).toMatch(/\{abreOPlano && \([\s\S]{0,400}Ver o plano/)
  })

  it('na ficha, o cartão do plano não abre (nem diz que abre) a quem não tem o Atendimento', () => {
    const f = fonte('components/branch/client-profile.tsx')
    expect(f).toMatch(/const abreOTratamento = \(p: ProfilePackage\) => !p\.planId \|\| podeVerPlanos/)
    expect(f).toMatch(/onClick=\{abreOTratamento\(pacote\) \? \(\) => \{ setPacoteAbertoId\(pacote\.id\); setTreatmentModalOpen\(true\) \} : undefined\}/)
    expect(f).toMatch(/\{abreOTratamento\(pacote\) && \(\s*<p data-tratamento-que-abre/)
  })

  it('no painel da rede, o "Ver o plano" dos planos propostos também é de quem tem o Atendimento', () => {
    const f = fonte('components/admin/admin-dashboard-view.tsx')
    expect(f).toMatch(/\{can\('atendimento'\) && \(\s*<a\s+href=\{`\/admin\/planejamentos\/\$\{p\.id\}`\}/)
  })
})

describe('A11: "Outros documentos" não diz "Nenhum documento cadastrado" quando o termo da rede já está escolhido acima', () => {
  it('sem documento a oferecer, o bloco não aparece (o termo e o contrato já dizem onde se criam)', () => {
    const f = fonte('components/admin/procedure-form.tsx')
    expect(f).toMatch(/\{modelos && outrosVisiveis\.length > 0 && \(/)
    expect(f).not.toContain('Nenhum documento cadastrado ainda')
  })
})

describe('A13: a faixa da Equipe diz o estado, sem explicar onde se marca (princípio 7, o Heitor, 26/11)', () => {
  for (const arquivo of ['app/admin/team/page.tsx', 'app/[slug]/team/page.tsx']) {
    it(arquivo, () => {
      const f = fonte(arquivo)
      expect(f).toContain('Ninguém atende nesta unidade ainda.')
      expect(f).not.toContain('no lápis de cada pessoa')
    })
  }
})

describe('A10: os próximos passos do setup são o nome e o link, sem o porquê (princípio 7, o Heitor, 26/11)', () => {
  it('só guardam frase os dois passos em que ela diz ONDE (os testes da A2 da 14ª e da A2 da 10ª a pedem)', async () => {
    const { PROXIMOS_PASSOS } = await import('@/lib/setup/proximos-passos')
    expect(PROXIMOS_PASSOS.filter(p => p.porque).map(p => p.titulo)).toEqual(['Taxas da maquininha', 'Outra unidade (se a rede tiver)'])
    for (const p of PROXIMOS_PASSOS.filter(p => p.porque)) expect(p.porque!.length).toBeLessThanOrEqual(40)
  })
  it('a tela só mostra a frase do passo que a tem', () => {
    expect(fonte('components/setup/setup-wizard.tsx')).toMatch(/\{passo\.porque && \(/)
  })
})

describe('A21: o procedimento inativo não diz "App: Sim" (princípio 3: ele não está no app)', () => {
  it('a coluna App da lista de Procedimentos', () => {
    const f = fonte('app/_shared/catalogo-de-procedimentos.tsx')
    expect(f).toMatch(/const noApp = p\.visible_on_client_app && p\.is_active/)
    expect(f).toMatch(/data-no-app=\{noApp \? 'sim' : 'nao'\}/)
  })
})
