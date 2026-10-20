import { connection } from 'next/server'
import { Movimento } from '@/components/movimento'
import { TermosNaTela } from '@/components/termos-na-tela'
import { Topo, Hero, Faixa, Troca, UmSistema, DiaDaClinica, Facil, AppDaCliente, Destaques, EAinda, Seguranca, Perguntas, Final, Rodape } from '@/components/conteudo'
import { Precos } from '@/components/precos'
import { lerPlanos } from '@/lib/planos'
import { linksDaClinica, enderecoDoSite } from '@/lib/links'
import { perguntasDoSite } from '@/lib/perguntas'
import { dadosEstruturados, jsonLd } from '@/lib/dados-estruturados'

/**
 * A página do BellarisOS (bellarisos.com, 2026-10-17). Renderizada a cada
 * pedido — os links da clínica e os planos vêm do ambiente e do banco, que o
 * build do Docker não tem —, com os planos em cache de uma hora.
 */
export default async function Inicio() {
  await connection()
  const links = linksDaClinica()
  const planos = await lerPlanos()

  const perguntas = perguntasDoSite(planos)

  return (
    <div className="site">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(dadosEstruturados(enderecoDoSite(), planos, perguntas)) }} />
      <Topo links={links} />
      <main>
        <Hero links={links} />
        <Faixa />
        <Troca />
        <UmSistema />
        <DiaDaClinica />
        <Facil />
        <AppDaCliente />
        <Destaques />
        <EAinda />
        <Seguranca />
        <Precos planos={planos} comecar={links.comecar} />
        <Perguntas perguntas={perguntas} />
        <Final links={links} />
      </main>
      <Rodape links={links} />
      <Movimento />
      <TermosNaTela />
    </div>
  )
}
