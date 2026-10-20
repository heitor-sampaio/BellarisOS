import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'
import type { PlanoDoSite } from '@/lib/planos'
import type { Pergunta } from '@/lib/perguntas'

/**
 * O que o buscador e as IAs leem da página (schema.org, 2026-10-20): um grafo
 * com a ORGANIZAÇÃO, o SITE, o PRODUTO (cada plano ativo como oferta MENSAL,
 * e as funcionalidades do catálogo) e as PERGUNTAS — as mesmas da página. Só
 * o que é verdade: sem nota, avaliação ou número de clientes.
 */
export const DEFINICAO = 'O BellarisOS é um sistema de gestão para clínicas de estética que junta ERP e CRM num lugar só: agenda, prontuário, WhatsApp, vendas, financeiro, estoque, marketing e um app para a cliente agendar sozinha.'

export function dadosEstruturados(site: string, planos: PlanoDoSite[] | null, perguntas: Pergunta[]) {
  const org = `${site}/#organizacao`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization', '@id': org, name: 'BellarisOS', url: `${site}/`,
        logo: `${site}/icon.png`, description: DEFINICAO,
      },
      {
        '@type': 'WebSite', '@id': `${site}/#site`, name: 'BellarisOS', url: `${site}/`,
        inLanguage: 'pt-BR', publisher: { '@id': org },
      },
      {
        '@type': 'SoftwareApplication', '@id': `${site}/#produto`, name: 'BellarisOS', url: `${site}/`,
        applicationCategory: 'BusinessApplication', applicationSubCategory: 'Sistema de gestão para clínicas de estética',
        operatingSystem: 'Web, Android', inLanguage: 'pt-BR', description: DEFINICAO, publisher: { '@id': org },
        featureList: FUNCIONALIDADES.filter(f => !('emBreve' in f && f.emBreve)).map(f => f.rotulo),
        offers: (planos ?? []).map(p => {
          const preco = (p.valorCentavos / 100).toFixed(2)
          return {
            '@type': 'Offer', name: `Plano ${p.nome}`, price: preco, priceCurrency: 'BRL', url: `${site}/#precos`,
            priceSpecification: {
              '@type': 'UnitPriceSpecification', price: preco, priceCurrency: 'BRL',
              referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
            },
          }
        }),
      },
      {
        '@type': 'FAQPage', '@id': `${site}/#perguntas`, inLanguage: 'pt-BR',
        mainEntity: perguntas.map(q => ({ '@type': 'Question', name: q.p, acceptedAnswer: { '@type': 'Answer', text: q.r } })),
      },
    ],
  }
}

/** O JSON-LD dentro de um <script>: o "<" escapado, para nenhum texto fechar a tag. */
export function jsonLd(dados: unknown): string {
  return JSON.stringify(dados).replace(/</g, '\\u003c')
}
