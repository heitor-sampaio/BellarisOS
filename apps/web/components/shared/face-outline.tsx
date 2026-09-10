/**
 * Rosto feminino de frente, em traço fino, para o planejador de injetáveis.
 *
 * SVG inline de propósito: acompanha o tema (usa `currentColor`), escala sem
 * perder nitidez e não depende de carregar imagem — o campo precisa das
 * proporções estáveis para converter clique em coordenada 0..1.
 *
 * ⚠️ O viewBox é a referência do sistema de coordenadas do campo. Os pontos são
 * gravados em 0..1 relativo a ele, então mudar largura ou altura desloca tudo
 * que já foi marcado. Redesenhar as formas por dentro é seguro; mexer no
 * viewBox não é.
 *
 * Peso de traço em três níveis — contorno, estrutura e detalhe — é o que dá
 * delicadeza. Linha única e uniforme achata o desenho.
 */

export const FACE_VIEWBOX = { width: 200, height: 260 }

export function FaceOutline({ opacity = 1 }: { opacity?: number }) {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={opacity}
    >
      {/* ── Cabelo ─────────────────────────────────────────────────────
             Silhueta em um traço só, da ponta esquerda até a direita
             passando pela coroa. Duas curvas encontrando-se no topo
             criavam um bico. */}
      <path
        d="M35 206 C31 170 35 138 42 110
           C37 68 64 32 100 32
           C136 32 163 68 158 110
           C165 138 169 170 165 206"
        strokeWidth={1.2}
      />
      {/* Volume interno das laterais */}
      <path d="M47 118 C43 148 41 176 40 200" strokeWidth={0.8} opacity={0.5} />
      <path d="M153 118 C157 148 159 176 160 200" strokeWidth={0.8} opacity={0.5} />
      {/* Sem mechas caindo sobre a testa: num planejador de toxina, traço solto
          nessa região se confunde com marcação de ruga. */}

      {/* ── Rosto: oval suave, queixo arredondado ─────────────────────── */}
      <path
        d="M100 54 C128 54 147 72 150 102
           C152 122 150 141 146 159
           C141 183 124 205 100 213
           C76 205 59 183 54 159
           C50 141 48 122 50 102
           C53 72 72 54 100 54 Z"
        strokeWidth={1.45}
      />

      {/* Linha do cabelo sobre a testa — por cima do rosto, é o que faz o
          cabelo assentar em vez de flutuar */}
      <path d="M57 106 C61 76 78 62 100 62 C122 62 139 76 143 106" strokeWidth={1.1} />

      {/* ── Sobrancelhas: finas e arqueadas ───────────────────────────── */}
      <path d="M61 110 C71 100 87 98 96 104" strokeWidth={1.15} />
      <path d="M104 104 C113 98 129 100 139 110" strokeWidth={1.15} />

      {/* ── Olhos amendoados ──────────────────────────────────────────── */}
      <path d="M62 126 C71 117 87 117 95 126 C87 133 71 133 62 126 Z" strokeWidth={1.1} />
      <path d="M105 126 C113 117 129 117 138 126 C129 133 113 133 105 126 Z" strokeWidth={1.1} />
      {/* Íris contornada + pupila cheia. Dois círculos vazados viravam alvo. */}
      <circle cx={79} cy={125} r={4.2} strokeWidth={0.9} opacity={0.85} />
      <circle cx={121} cy={125} r={4.2} strokeWidth={0.9} opacity={0.85} />
      <circle cx={79} cy={125} r={1.7} fill="currentColor" stroke="none" />
      <circle cx={121} cy={125} r={1.7} fill="currentColor" stroke="none" />
      {/* Cílios no canto externo */}
      <path d="M62 124 C59.5 122 58 120 57 118" strokeWidth={0.9} opacity={0.75} />
      <path d="M138 124 C140.5 122 142 120 143 118" strokeWidth={0.9} opacity={0.75} />

      {/* ── Nariz: só a base. A linha longa do dorso virava um risco. ─── */}
      <path d="M100 146 C99 152 98 156 97.5 158" strokeWidth={0.75} opacity={0.45} />
      <path d="M93 162 C96 165 104 165 107 162" strokeWidth={1} />
      <path d="M91.5 160 C93 162 94.5 163 96 163" strokeWidth={0.8} opacity={0.6} />
      <path d="M108.5 160 C107 162 105.5 163 104 163" strokeWidth={0.8} opacity={0.6} />

      {/* ── Lábios: arco do cupido definido, inferior cheio ───────────── */}
      <path d="M84 181 C89 174 95 173 100 178 C105 173 111 174 116 181" strokeWidth={1.2} />
      <path d="M84 181 C90 192 110 192 116 181" strokeWidth={1.2} />
      <path d="M86 181 C93 183 107 183 114 181" strokeWidth={0.7} opacity={0.45} />

      {/* Mento */}
      <path d="M93 200 C96 203 104 203 107 200" strokeWidth={0.75} opacity={0.45} />

      {/* ── Pescoço e ombros ──────────────────────────────────────────── */}
      <path d="M85 210 C86 222 85 232 82 240" strokeWidth={1.1} />
      <path d="M115 210 C114 222 115 232 118 240" strokeWidth={1.1} />
      <path d="M50 258 C59 246 69 241 82 240" strokeWidth={1.15} />
      <path d="M150 258 C141 246 131 241 118 240" strokeWidth={1.15} />
    </g>
  )
}
