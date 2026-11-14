import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { perguntasDoSite } from '@/lib/perguntas'
import { TELAS } from '@/lib/telas'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * SI1 e SI2 (Bloco Site do plano de adaptação, 2026-11-16 — a revisão do
 * Heitor de 2026-11-13: "Sim para o site"): o texto do site fala o sistema
 * ADAPTADO.
 *  - SI1: Documentos (não "Termos e contratos"), Ficha de saúde (não
 *    "anamnese"), o PDV (não "Recebeu na recepção"), Oportunidades (não
 *    "lead"), e nenhum cargo como se fosse fixo ("a recepção", "a gerente",
 *    "a profissional", "a contadora"): quem decide é a permissão. "Clínica de
 *    estética" fica — é o mercado.
 *  - SI2: o app da cliente diz o que ganhou (aceita o plano, agenda as sessões
 *    do plano e do pacote, assina todos os documentos de uma vez — sem
 *    prometer pagar), e a Auditoria entra no "Cada um vê o seu".
 *
 * Lê o TEXTO dos arquivos do site (sem os comentários, que falam do código).
 */
const raiz = path.resolve(__dirname, '..')
const ARQUIVOS = [
  'components/conteudo.tsx', 'components/demos.tsx', 'components/termo.tsx', 'components/precos.tsx',
  'components/calculadora.tsx', 'lib/telas.ts', 'lib/perguntas.ts', 'lib/llms.ts', 'lib/dados-estruturados.ts',
  'lib/planos.ts', 'app/layout.tsx', 'app/page.tsx',
]
const semComentarios = (t: string) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n').map(l => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n')
  // As classes de CSS não são texto ("site-lead").
  .replace(/className=("[^"]*"|\{`[^`]*`\})/g, '')

const textos = ARQUIVOS.map(a => ({ arquivo: a, texto: semComentarios(fs.readFileSync(path.join(raiz, a), 'utf8')) }))
// O que vem de fora dos arquivos e também aparece na página.
const doCatalogo = [
  ...perguntasDoSite([]).flatMap(q => [q.p, q.r]),
  ...Object.values(TELAS).map(t => t.descricao),
  ...FUNCIONALIDADES.map(f => f.rotulo),
].join('\n')
const tudo = [...textos.map(t => t.texto), doCatalogo].join('\n')

const PROIBIDOS: [RegExp, string][] = [
  [/termos e contratos/i, 'é "Documentos" (DC1)'],
  [/termos? assinados? sem papel/i, 'é "Documentos assinados" (DC1)'],
  [/anamnese/i, 'é "Ficha de saúde" (PR3)'],
  [/recebeu na recep/i, 'é o PDV'],
  [/recep[çc][ãa]o/i, 'cargo como se fosse fixo: "a equipe", "quem atende"'],
  [/\b(a|à|da|pela|por) gerente\b/i, 'cargo como se fosse fixo'],
  [/\b(a|à|da|pela) profissional\b/i, 'cargo como se fosse fixo: "quem atende"'],
  [/\bpor profissional\b/i, 'cargo como se fosse fixo: "por quem atende"'],
  [/\bcada profissional\b/i, 'cargo como se fosse fixo: "cada pessoa que atende"'],
  [/contadora/i, 'cargo como se fosse fixo'],
  [/\bleads?\b/i, 'é "oportunidade" (CR1)'],
  [/\bo cargo (dela|da pessoa)\b/i, 'é a permissão que decide'],
  [/pelo portal/i, 'é "App da cliente" (um nome por conceito — docs/regras/site.md)'],
]

describe('SI1 — o texto do site fala o sistema adaptado', () => {
  for (const [re, porque] of PROIBIDOS) {
    it(`não diz ${re} (${porque})`, () => {
      const onde = textos.filter(t => re.test(t.texto)).map(t => t.arquivo)
      if (re.test(doCatalogo)) onde.push('(perguntas, telas, dicas ou o catálogo do plano)')
      expect(onde).toEqual([])
    })
  }

  it('fala de Documentos, da Ficha de saúde, do PDV e das Oportunidades', () => {
    expect(tudo).toMatch(/Documentos/)
    expect(tudo).toMatch(/ficha de saúde/i)
    expect(tudo).toMatch(/\bPDV\b/)
    expect(tudo).toMatch(/oportunidades/i)
  })

  it('"Clínica de estética" fica: é o mercado', () => {
    expect(tudo).toMatch(/clínicas? de estética/i)
  })
})

describe('SI2 — o app da cliente diz o que ganhou, e a Auditoria entra no "Cada um vê o seu"', () => {
  const conteudo = textos.find(t => t.arquivo === 'components/conteudo.tsx')!.texto
  it('aceita o plano de tratamento pelo celular', () => {
    expect(conteudo).toMatch(/aceita o plano/i)
  })
  it('agenda as sessões do plano e do pacote', () => {
    expect(conteudo).toMatch(/sessões do plano e do pacote/i)
  })
  it('assina todos os documentos de uma vez', () => {
    expect(conteudo).toMatch(/todos de uma vez|todos os documentos[^.]*de uma vez/i)
  })
  it('não promete pagar pelo app', () => {
    expect(conteudo).not.toMatch(/paga (pelo|no) (app|celular)|pagar (pelo|no) (app|celular)/i)
  })
  it('"Cada um vê o seu" diz que tudo o que se faz fica registrado', () => {
    const linha = conteudo.split('\n').find(l => l.includes("'Cada um vê o seu'"))
    expect(linha).toBeDefined()
    expect(linha).toContain('e tudo o que se faz fica registrado')
  })
})
