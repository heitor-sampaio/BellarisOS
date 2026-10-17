import type { MetadataRoute } from 'next'
import { connection } from 'next/server'
import { enderecoDoSite } from '@/lib/links'

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection()
  return { rules: [{ userAgent: '*', allow: '/' }], sitemap: `${enderecoDoSite()}/sitemap.xml` }
}
