import { connection } from 'next/server'
import { Movimento } from '@/components/movimento'
import { Topo, Hero, Faixa, UmSistema, DiaDaClinica, AppDaCliente, Destaques, EAinda, Seguranca, Perguntas, Final, Rodape } from '@/components/conteudo'
import { Precos } from '@/components/precos'
import { lerPlanos } from '@/lib/planos'
import { linksDaClinica, enderecoDoSite } from '@/lib/links'

/**
 * A página do BellarisOS (bellarisos.com, 2026-10-17). Renderizada a cada
 * pedido — os links da clínica e os planos vêm do ambiente e do banco, que o
 * build do Docker não tem —, com os planos em cache de uma hora.
 */
export default async function Inicio() {
  await connection()
  const links = linksDaClinica()
  const planos = await lerPlanos()

  // O que o buscador lê da página (schema.org): o produto e as ofertas.
  const dadosEstruturados = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'BellarisOS',
    url: enderecoDoSite(),
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, Android',
    description: 'O sistema operacional da clínica de estética: ERP e CRM num sistema só — agenda, prontuário, WhatsApp, vendas, financeiro, marketing e o app da cliente.',
    inLanguage: 'pt-BR',
    offers: (planos ?? []).map(p => ({
      '@type': 'Offer', name: p.nome, price: (p.valorCentavos / 100).toFixed(2), priceCurrency: 'BRL',
      url: `${enderecoDoSite()}/#precos`,
    })),
  }

  return (
    <div className="site">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(dadosEstruturados).replace(/</g, '\u003c') }} />
      <Topo links={links} />
      <main>
        <Hero links={links} />
        <Faixa />
        <UmSistema />
        <DiaDaClinica />
        <AppDaCliente />
        <Destaques />
        <EAinda />
        <Seguranca />
        <Precos planos={planos} comecar={links.comecar} />
        <Perguntas />
        <Final links={links} />
      </main>
      <Rodape links={links} />
      <Movimento />
    </div>
  )
}
