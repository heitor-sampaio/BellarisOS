import Image from 'next/image'
import type { Tela } from '@/lib/telas'

/**
 * As molduras das telas reais: o navegador (computador) e o celular. A tela
 * flutua sobre a página, por isso a sombra é a do que flutua
 * (`--shadow-overlay`), não uma inventada.
 */
export function Navegador({ tela, prioridade = false, tamanhos = '(min-width: 960px) 640px, 100vw' }: {
  tela: Tela
  prioridade?: boolean
  tamanhos?: string
}) {
  return (
    <figure className="site-navegador" style={{ margin: 0 }}>
      <div className="site-navegador-barra" aria-hidden="true">
        <i /><i /><i />
        <span className="site-navegador-endereco">app.bellarisos.com</span>
      </div>
      <Image src={tela.arquivo} alt={tela.descricao} width={tela.largura} height={tela.altura}
        sizes={tamanhos} priority={prioridade} />
    </figure>
  )
}

export function Celular({ tela, prioridade = false, className }: { tela: Tela; prioridade?: boolean; className?: string }) {
  return (
    <figure className={['site-celular', className].filter(Boolean).join(' ')} style={{ margin: 0 }}>
      <div className="site-celular-tela">
        <Image src={tela.arquivo} alt={tela.descricao} width={tela.largura} height={tela.altura}
          sizes="(min-width: 960px) 300px, 60vw" priority={prioridade} />
      </div>
    </figure>
  )
}
