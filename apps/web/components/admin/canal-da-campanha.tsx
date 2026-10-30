import { Smartphone } from 'lucide-react'

/**
 * O canal da campanha, dito com todas as letras (D-3, decisão do Heitor em
 * 2026-10-29: "A campanha de hoje é aviso no celular (push). A tela passa a
 * dizer isso claramente. O WhatsApp fica para o futuro.").
 *
 * A clínica montava a campanha achando que ia pelo WhatsApp; chegava só a quem
 * tem o app. Este aviso fica na lista, na criação e na revisão.
 */
export function CanalDaCampanha() {
  return (
    <div role="note" style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '12px 16px', borderRadius: 'var(--radius-field-token)',
      background: 'var(--info-soft)', border: '1px solid var(--border)',
      fontSize: 'var(--text-sm-sz)', color: 'var(--text)', lineHeight: 1.5,
    }}>
      <Smartphone size={16} style={{ flexShrink: 0, marginTop: 2, color: 'var(--info)' }} />
      <span>
        <strong>Aviso no celular.</strong> A campanha chega como notificação no celular de quem tem o
        app da clínica (ou os avisos do navegador ligados) e fica no sino do portal da cliente.
        Ela não vai pelo WhatsApp.
      </span>
    </div>
  )
}
