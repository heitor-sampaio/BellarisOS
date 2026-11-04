import 'server-only'
import { headers } from 'next/headers'
import { origemPublicaDe } from '@/lib/origem'
import { getCachedNetworkBranches } from '@/lib/cached-queries'

/**
 * O endereço que se dá à CLIENTE (A4 da 6ª simulação): o app dela é o portal
 * da UNIDADE (`/<unidade>/cliente`) — qualquer unidade ativa da clínica abre a
 * mesma ficha (H5). Inteiro, com o domínio de quem está vendo, para copiar e
 * mandar. O identificador da rede (`tenants.slug`) não é endereço de tela
 * nenhuma, e era ele que Configurações → Geral mostrava como "Endereço do
 * portal".
 */
export async function origemDoApp(): Promise<string> {
  return origemPublicaDe(await headers())
}

export function enderecoDoAppDaCliente(origem: string, slugDaUnidade: string): string {
  return `${origem}/${slugDaUnidade}/cliente`
}

export async function enderecosDoAppDaClinica(tenantId: string): Promise<{ unidade: string; url: string }[]> {
  const [origem, unidades] = await Promise.all([origemDoApp(), getCachedNetworkBranches(tenantId)])
  return (unidades as { name: string; slug: string }[]).map(u => ({ unidade: u.name, url: enderecoDoAppDaCliente(origem, u.slug) }))
}
