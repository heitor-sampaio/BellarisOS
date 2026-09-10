/**
 * Rosto de frente, em traço, para o planejador de injetáveis.
 *
 * SVG inline de propósito: acompanha o tema (usa `currentColor`), escala sem
 * perder nitidez e não depende de carregar imagem — o campo precisa das
 * proporções estáveis para converter clique em coordenada 0..1.
 *
 * O viewBox é a referência do sistema de coordenadas do campo; mudá-lo desloca
 * todos os pontos já gravados.
 */

export const FACE_VIEWBOX = { width: 200, height: 260 }

export function FaceOutline({ opacity = 1 }: { opacity?: number }) {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" opacity={opacity}>
      {/* Contorno do rosto */}
      <path
        d="M100 42 C138 42 162 72 162 112 C162 160 138 206 100 218 C62 206 38 160 38 112 C38 72 62 42 100 42 Z"
        strokeWidth={1.6}
      />
      {/* Linha do cabelo */}
      <path d="M46 104 C52 60 74 44 100 44 C126 44 148 60 154 104" strokeWidth={1.2} />
      {/* Orelhas */}
      <path d="M38 110 C28 106 26 128 35 136" strokeWidth={1.2} />
      <path d="M162 110 C172 106 174 128 165 136" strokeWidth={1.2} />
      {/* Sobrancelhas */}
      <path d="M58 102 C68 94 84 93 92 98" strokeWidth={1.4} />
      <path d="M108 98 C116 93 132 94 142 102" strokeWidth={1.4} />
      {/* Olhos */}
      <path d="M60 117 C68 109 84 109 92 117 C84 125 68 125 60 117 Z" strokeWidth={1.2} />
      <path d="M108 117 C116 109 132 109 140 117 C132 125 116 125 108 117 Z" strokeWidth={1.2} />
      <circle cx={76} cy={117} r={3.2} strokeWidth={1.2} />
      <circle cx={124} cy={117} r={3.2} strokeWidth={1.2} />
      {/* Nariz */}
      <path d="M100 122 L100 150 C100 156 95 158 91 155" strokeWidth={1.2} />
      <path d="M88 157 C94 161 106 161 112 157" strokeWidth={1.2} />
      {/* Lábios */}
      <path d="M82 177 C90 171 110 171 118 177 C110 184 90 184 82 177 Z" strokeWidth={1.3} />
      <path d="M82 177 L118 177" strokeWidth={1} />
      {/* Mento */}
      <path d="M88 197 C94 202 106 202 112 197" strokeWidth={1} />
    </g>
  )
}
