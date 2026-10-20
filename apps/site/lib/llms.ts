import { cartaoDoPlano, type PlanoDoSite } from '@/lib/planos'
import type { Pergunta } from '@/lib/perguntas'
import { DEFINICAO } from '@/lib/dados-estruturados'

/**
 * O `/llms.txt` (GEO, 2026-10-20): o resumo do BellarisOS em Markdown, para as
 * IAs que leem o site antes de responder. Sem texto próprio que desatualize:
 * a definição, os planos (do sistema, com o cartão de preço) e as perguntas
 * são os mesmos da página.
 */
export function textoParaIAs(o: {
  site: string; comecar: string; privacidade: string; planos: PlanoDoSite[] | null; perguntas: Pergunta[]
}): string {
  const linhas: string[] = [
    '# BellarisOS',
    '',
    `> ${DEFINICAO}`,
    '',
    'O sistema operacional da clínica de estética: um sistema só, fácil de usar, no lugar de vários que não conversam entre si — a agenda, a planilha do financeiro, o WhatsApp no celular de alguém, o termo em papel.',
    '',
    `- Site: ${o.site}/`,
    `- Teste grátis (14 dias, tudo liberado, sem cartão): ${o.comecar}`,
    `- Preços e a calculadora de plano: ${o.site}/#precos`,
    `- Política de privacidade: ${o.privacidade}`,
    '',
  ]
  if (o.planos?.length) {
    linhas.push('## Planos (preço por mês)', '')
    for (const p of o.planos) {
      const c = cartaoDoPlano(p)
      const inclui = [c.todasAsFuncionalidades ? `todas as funcionalidades${c.comCopilot ? '' : ', fora o Copilot'}` : null, ...c.destaques]
        .filter(Boolean).join('; ')
      linhas.push(`- **${c.nome}** — ${c.preco} por mês: ${inclui}.${c.adicionais.length ? ` À parte: ${c.adicionais.join('; ')}.` : ''}`)
    }
    linhas.push('', 'As conversas do WhatsApp oficial têm a tarifa da Meta, cobrada pela Meta direto na conta da clínica.', '')
  }
  linhas.push('## Perguntas frequentes', '')
  for (const q of o.perguntas) linhas.push(`### ${q.p}`, '', q.r, '')
  return linhas.join('\n')
}
