import type { InjectableView } from '@/lib/anamnesis'

/**
 * A ilustração do planejador de injetáveis.
 *
 * São quatro desenhos — rosto e corpo, feminino e masculino — em
 * `public/mockup-*.png`. A primeira versão era um rosto feito em paths aqui
 * mesmo: não tinha qualidade para ser mostrado a uma cliente, que é exatamente
 * o uso da tela.
 *
 * ⚠️ O viewBox é a referência do sistema de coordenadas: os pontos são gravados
 * em 0..1 relativo a ele. As quatro imagens têm 1122×1402 (proporção 0,80), a
 * mesma do viewBox 200×250 — por isso um viewBox só serve para todas e trocar
 * de ilustração não desloca ponto nenhum. **Arte nova com outra proporção exige
 * acertar as duas coisas juntas**, senão o desenho ganha faixa vazia dos lados
 * e os pontos deixam de casar com ele.
 *
 * ⚠️ O peso do traço também é padronizado: **luminância média ≈ 109 nos pixels
 * opacos**, que é a do `mockup-rosto.png` original. As artes novas chegaram bem
 * mais escuras (o rosto masculino em 64) e, ao lado da primeira, pareciam de
 * outro conjunto. O acerto é feito na TINTA (255 − luminância), escalada por
 * um fator: clareia preservando matiz e alfa, e a borda do desenho continua
 * nítida — mexer no alfa deixaria o traço lavado.
 */

export const MAP_VIEWBOX = { width: 200, height: 250 }

/** Compatibilidade: o campo antigo importava com estes nomes. */
export const FACE_VIEWBOX = MAP_VIEWBOX

export const VIEW_IMAGE: Record<InjectableView, string> = {
  rosto_f: '/mockup-rosto.png',
  rosto_m: '/mockup-rosto-masculino.png',
  corpo_f: '/mockup-corpo-feminino.png',
  corpo_m: '/mockup-corpo-masculino.png',
}

export const VIEW_LABEL: Record<InjectableView, string> = {
  rosto_f: 'Rosto · feminino',
  rosto_m: 'Rosto · masculino',
  corpo_f: 'Corpo · feminino',
  corpo_m: 'Corpo · masculino',
}

/** As duas escolhas que compõem a vista, para a barra de seleção. */
export function viewDe(corpo: 'rosto' | 'corpo', sexo: 'f' | 'm'): InjectableView {
  return `${corpo}_${sexo}` as InjectableView
}

export function partesDaView(view: InjectableView): { corpo: 'rosto' | 'corpo'; sexo: 'f' | 'm' } {
  const [corpo, sexo] = view.split('_') as ['rosto' | 'corpo', 'f' | 'm']
  return { corpo, sexo }
}

export function InjectableOutline({
  view, opacity = 1,
}: {
  view: InjectableView
  opacity?: number
}) {
  return (
    <image
      href={VIEW_IMAGE[view]}
      x={0}
      y={0}
      width={MAP_VIEWBOX.width}
      height={MAP_VIEWBOX.height}
      preserveAspectRatio="xMidYMid meet"
      opacity={opacity}
      // Pano de fundo: clique e arraste pertencem à camada dos pontos, acima.
      style={{ pointerEvents: 'none' }}
    />
  )
}
