'use client'

import { usePathname } from 'next/navigation'

/**
 * Lista + detalhe: lado a lado no desktop, UMA TELA POR VEZ no celular.
 *
 * `.master-detail` sozinha empilha, e empilhar não basta aqui: escolher um
 * cliente abria o perfil ABAIXO da lista inteira, então a pessoa tocava num
 * nome e nada parecia acontecer — o conteúdo estava três telas abaixo. É a
 * mesma navegação do inbox: a lista leva ao detalhe, e o detalhe traz de volta.
 *
 * Quem decide é a rota, não um estado: estar em `/clients/<id>` já significa
 * "tem detalhe aberto". Por isso o componente lê o pathname em vez de receber
 * um booleano que teria de ser sincronizado por fora.
 */
export function ListaDetalhe({
  basePath, lista, children,
}: {
  /** Rota da lista sem detalhe — ex.: `/admin/clients`. */
  basePath: string
  lista:    React.ReactNode
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const semBarra = pathname.replace(/\/$/, '')
  const temDetalhe = semBarra !== basePath.replace(/\/$/, '')

  return (
    <div className="master-detail lista-detalhe" data-detalhe={temDetalhe ? '1' : '0'}>
      <div className="ld-lista">{lista}</div>
      <div className="ld-detalhe" style={{ flex: 1, minWidth: 0, width: '100%' }}>
        {children}
      </div>
    </div>
  )
}
