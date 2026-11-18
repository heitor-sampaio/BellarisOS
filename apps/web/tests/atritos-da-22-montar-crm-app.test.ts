import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Atritos da 22ª simulação (2026-11-17): montar a rede, CRM e app da cliente.
 * - A27 [3]: "(Massagem relaxante) : a baixa…" — um espaço antes dos dois-pontos.
 * - A28 [3]: o CEP "não encontrado" no /setup deixava seguir sem cidade nem UF;
 *   o app da cliente mostrou "100, 65075-000". A tela pede a cidade e a UF ali.
 * - A30 [3]: a linha que juntou com quem já existia saía só como "1 sem
 *   mudança" — não dizia que a Júlia Menezes entrou na Helena Prado, nem que o
 *   e-mail dela ficou de fora.
 * - A34 [3]: "Por que perdeu?" não dizia de qual oportunidade.
 * - A39 [3]: "Plano aceito!" dizia "os documentos você assina por aqui", e o
 *   cartão logo abaixo, "O contrato do plano se assina no pagamento, na unidade".
 * - A40 [3]: a foto enviada aparecia em Documentos sem miniatura.
 * - A41 [3]: "Confirmar e avaliar (opcional)" virava "Confirmar que realizei o
 *   atendimento" no botão, com a avaliação preenchida.
 */

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('A27: sem espaço antes dos dois-pontos na faixa dos sem insumo', () => {
  it('o parêntese e os dois-pontos ficam na mesma linha do JSX', () => {
    const f = fonte('app/_shared/catalogo-de-procedimentos.tsx')
    expect(f).not.toMatch(/\)\s*\n\s*: a baixa automática/)
    expect(f).toContain('): a baixa automática')
  })
})

describe('A28: o CEP sem cidade pede a cidade e a UF ali', () => {
  it('o CEP preenchido sem cidade pede a cidade e a UF', async () => {
    const { avisoDoEnderecoQueFalta } = await import('@/lib/cep')
    expect(avisoDoEnderecoQueFalta({ cep: '65075-000', cidade: '', uf: '' })).toBe('Escreva a cidade e a UF: o CEP não as trouxe.')
    expect(avisoDoEnderecoQueFalta({ cep: '65075-000', cidade: '', uf: 'MA' })).toBe('Escreva a cidade: o CEP não a trouxe.')
  })
  it('a cidade sem a UF segue o aviso de antes; tudo preenchido, nada', async () => {
    const { avisoDoEnderecoQueFalta, avisoDaUfQueFalta } = await import('@/lib/cep')
    expect(avisoDoEnderecoQueFalta({ cep: '65075-000', cidade: 'São Luís', uf: '' })).toBe(avisoDaUfQueFalta({ cidade: 'São Luís', uf: '' }))
    expect(avisoDoEnderecoQueFalta({ cep: '65075-000', cidade: 'São Luís', uf: 'MA' })).toBeNull()
    expect(avisoDoEnderecoQueFalta({ cep: '', cidade: '', uf: '' }), 'sem CEP, nada a pedir').toBeNull()
  })
  it('o CEP não encontrado diz o que fazer', async () => {
    const { CEP_NAO_ENCONTRADO } = await import('@/lib/cep')
    expect(CEP_NAO_ENCONTRADO).toBe('CEP não encontrado: escreva a cidade e a UF abaixo.')
  })
  it('o setup, a Nova unidade e a edição da unidade usam os dois', () => {
    for (const arquivo of ['components/setup/setup-wizard.tsx', 'components/admin/branch-form.tsx', 'components/admin/branch-edit-form.tsx']) {
      const f = fonte(arquivo)
      expect(f, arquivo).toContain('avisoDoEnderecoQueFalta(')
      expect(f, arquivo).toContain('CEP_NAO_ENCONTRADO')
      expect(f, arquivo).not.toContain("'CEP não encontrado.'")
    }
  })
})

describe('A30: a linha juntada diz em quem entrou e o que ficou de fora', () => {
  it('nome e e-mail diferentes: os dois ficam de fora, e a linha diz', async () => {
    const { avisoDaLinhaJuntada } = await import('@/lib/importacao/o-que-entra')
    expect(avisoDaLinhaJuntada({
      como: 'telefone',
      existente: { nome: 'Helena Prado', email: 'helena@exemplo.com' },
      linha: { nome: 'Júlia Menezes', email: 'julia@exemplo.com' },
    })).toBe('Entrou em Helena Prado (o mesmo telefone). Ficaram de fora: o nome “Júlia Menezes” e o e-mail julia@exemplo.com — Helena Prado já tem.')
  })
  it('só o e-mail', async () => {
    const { avisoDaLinhaJuntada } = await import('@/lib/importacao/o-que-entra')
    expect(avisoDaLinhaJuntada({
      como: 'telefone',
      existente: { nome: 'Helena Prado', email: 'helena@exemplo.com' },
      linha: { nome: 'Helena Prado', email: 'outra@exemplo.com' },
    })).toBe('Entrou em Helena Prado (o mesmo telefone). Ficou de fora: o e-mail outra@exemplo.com — Helena Prado já tem.')
  })
  it('nada de fora (o mesmo nome, o e-mail igual ou que entrou): sem aviso', async () => {
    const { avisoDaLinhaJuntada } = await import('@/lib/importacao/o-que-entra')
    expect(avisoDaLinhaJuntada({ como: 'telefone', existente: { nome: 'Helena Prado', email: null }, linha: { nome: 'helena prado', email: 'h@x.com' } })).toBeNull()
    expect(avisoDaLinhaJuntada({ como: 'email', existente: { nome: 'Helena', email: 'H@X.com' }, linha: { nome: null, email: 'h@x.com' } })).toBeNull()
  })
  it('a importação usa nos contatos e nas fichas', () => {
    const f = fonte('lib/importacao/processar.ts')
    expect(f.match(/avisoDaLinhaJuntada\(/g)?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('A34: "Por que perdeu?" diz de qual oportunidade', () => {
  it('o nome, os procedimentos e o funil', async () => {
    const { rotuloDaOportunidade } = await import('@/lib/crm')
    expect(rotuloDaOportunidade({ nome: 'Camila Souza', procedimentos: ['Drenagem', 'Massagem'], funil: 'Vendas' })).toBe('Camila Souza · Drenagem, Massagem · Vendas')
    expect(rotuloDaOportunidade({ nome: 'Camila Souza', procedimentos: [], funil: null })).toBe('Camila Souza')
  })
  it('a janela mostra, e o quadro e o painel do inbox passam', () => {
    expect(fonte('components/branch/pergunta-da-perda.tsx')).toMatch(/data-oportunidade-da-perda/)
    for (const arquivo of ['components/branch/crm-board.tsx', 'components/admin/inbox-lead-panel.tsx']) {
      const f = fonte(arquivo)
      const janela = f.slice(f.indexOf('<PerguntaDaPerda'), f.indexOf('<PerguntaDaPerda') + 400)
      expect(janela, arquivo).toContain('oportunidade={')
    }
  })
})

describe('A39: o "Plano aceito!" diz o mesmo que o cartão do contrato', () => {
  it('com o contrato no pagamento, diz que ele se assina lá', async () => {
    const { textoDoPlanoAceitoNoApp } = await import('@/lib/clientes/textos-do-app')
    const t = textoDoPlanoAceitoNoApp({ contratoNoPagamento: true, temDocumentos: false })
    expect(t).toBe('A equipe já foi avisada. O pagamento é combinado na unidade, e o contrato do plano se assina lá, no pagamento.')
    expect(t).not.toMatch(/por aqui/)
  })
  it('com documentos no app, eles se assinam por aqui; sem nenhum, não promete', async () => {
    const { textoDoPlanoAceitoNoApp } = await import('@/lib/clientes/textos-do-app')
    expect(textoDoPlanoAceitoNoApp({ contratoNoPagamento: false, temDocumentos: true }))
      .toBe('A equipe já foi avisada. O pagamento é combinado na unidade, e os documentos você assina por aqui quando quiser.')
    expect(textoDoPlanoAceitoNoApp({ contratoNoPagamento: false, temDocumentos: false }))
      .toBe('A equipe já foi avisada. O pagamento é combinado na unidade.')
  })
  it('a página usa', () => {
    const f = fonte('app/[slug]/cliente/planos/[id]/page.tsx')
    expect(f).toContain('textoDoPlanoAceitoNoApp(')
    expect(f).not.toContain('os documentos você assina por aqui quando quiser')
  })
})

describe('A40: a foto enviada tem miniatura em Documentos', () => {
  it('foto com endereço: a miniatura; documento ou sem endereço: o ícone', async () => {
    const { miniaturaNoApp } = await import('@/lib/clientes/textos-do-app')
    expect(miniaturaNoApp({ category: 'foto_clinica', file_url: 'https://x.supabase.co/a.jpg' })).toBe('https://x.supabase.co/a.jpg')
    expect(miniaturaNoApp({ category: 'foto', file_url: 'https://x.supabase.co/b.jpg' })).toBe('https://x.supabase.co/b.jpg')
    expect(miniaturaNoApp({ category: 'contrato', file_url: 'https://x.supabase.co/c.pdf' })).toBeNull()
    expect(miniaturaNoApp({ category: 'foto_clinica', file_url: '' })).toBeNull()
  })
  it('o Histórico usa', () => {
    const f = fonte('components/client-portal/historico-tabs.tsx')
    expect(f).toContain('miniaturaNoApp(')
    expect(f).toContain('data-miniatura-da-foto')
  })
})

// A36 da 23ª: a regra mudou — o rótulo que mudava ao marcar as estrelas parecia
// instável; é um só, e o cartão da avaliação diz que ela vai junto.
describe('A41: a avaliação diz que vai junto com a confirmação', () => {
  it('o formulário diz, no cartão da avaliação', () => {
    expect(fonte('components/client-portal/confirm-appointment-form.tsx')).toContain('vai junto ao confirmar')
  })
})
