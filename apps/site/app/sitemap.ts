import type { MetadataRoute } from 'next'
import { connection } from 'next/server'
import { enderecoDoSite } from '@/lib/links'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection()
  return [{ url: `${enderecoDoSite()}/`, changeFrequency: 'weekly', priority: 1 }]
}
