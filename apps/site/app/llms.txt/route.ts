import { connection } from 'next/server'
import { lerPlanos } from '@/lib/planos'
import { perguntasDoSite } from '@/lib/perguntas'
import { linksDaClinica, enderecoDoSite } from '@/lib/links'
import { textoParaIAs } from '@/lib/llms'

/** O resumo do BellarisOS para as IAs (lib/llms.ts), com os planos do sistema. */
export async function GET() {
  await connection()
  const planos = await lerPlanos()
  const links = linksDaClinica()
  const texto = textoParaIAs({
    site: enderecoDoSite(), comecar: links.comecar, privacidade: links.privacidade,
    planos, perguntas: perguntasDoSite(planos),
  })
  return new Response(texto, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
}
