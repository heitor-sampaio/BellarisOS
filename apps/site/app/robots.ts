import type { MetadataRoute } from 'next'
import { connection } from 'next/server'
import { enderecoDoSite } from '@/lib/links'

/**
 * Tudo aberto — inclusive, com todas as letras, aos robôs das IAs (GEO,
 * 2026-10-20): quem pergunta a um assistente "qual sistema para clínica de
 * estética" só ouve falar do BellarisOS se ele pôde ler a página.
 */
const ROBOS_DAS_IAS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended']

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection()
  return {
    rules: [{ userAgent: '*', allow: '/' }, { userAgent: ROBOS_DAS_IAS, allow: '/' }],
    sitemap: `${enderecoDoSite()}/sitemap.xml`,
  }
}
