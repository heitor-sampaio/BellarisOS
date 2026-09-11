/**
 * Rosto de frente do planejador de injetáveis.
 *
 * É a ilustração de `public/mockup-rosto.png`, desenhada dentro do SVG do
 * campo. A primeira versão era um rosto feito em paths aqui mesmo — não tinha
 * qualidade para ser mostrada a uma cliente, que é exatamente o uso da tela.
 *
 * ⚠️ O viewBox é a referência do sistema de coordenadas do campo: os pontos são
 * gravados em 0..1 relativo a ele. Mudar as dimensões desloca tudo que já foi
 * marcado. A proporção 200×250 acompanha a da imagem (1122×1402 ≈ 0,80) — arte
 * nova com outra proporção exige acertar as duas coisas juntas, senão o rosto
 * fica com faixa vazia dos lados e os pontos deixam de casar com o desenho.
 */

export const FACE_VIEWBOX = { width: 200, height: 250 }

export const FACE_IMAGE_SRC = '/mockup-rosto.png'

export function FaceOutline({ opacity = 1 }: { opacity?: number }) {
  return (
    <image
      href={FACE_IMAGE_SRC}
      x={0}
      y={0}
      width={FACE_VIEWBOX.width}
      height={FACE_VIEWBOX.height}
      preserveAspectRatio="xMidYMid meet"
      opacity={opacity}
      // Pano de fundo: clique e arraste pertencem à camada dos pontos, acima.
      style={{ pointerEvents: 'none' }}
    />
  )
}
