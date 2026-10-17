import { ImageResponse } from 'next/og'

/**
 * A imagem de quando o link é compartilhado (WhatsApp, Instagram, LinkedIn).
 * O ImageResponse não lê CSS: as cores são as dos tokens do núcleo
 * (`--gradient-brand`: #c34d6b → #a63a55; `--on-brand`), escritas aqui. Sem o ✦:
 * a fonte padrão não tem o glifo, e o ImageResponse tentaria baixá-la no build.
 */
export const alt = 'BellarisOS — a clínica inteira num lugar só'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Imagem() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '72px 80px', color: '#ffffff', background: 'linear-gradient(165deg, #c34d6b 0%, #a63a55 100%)',
      }}>
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em' }}>BellarisOS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', fontSize: 84, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.02 }}>
            A clínica inteira num lugar só.
          </div>
          <div style={{ display: 'flex', fontSize: 32, opacity: 0.88 }}>
            Agenda, prontuário, WhatsApp, vendas e financeiro para clínicas de estética.
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 700 }}>Teste grátis por 14 dias · bellarisos.com</div>
      </div>
    ),
    size,
  )
}
