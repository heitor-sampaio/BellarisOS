import { AlertTriangle } from 'lucide-react'

/**
 * A alergia da cliente em destaque (2026-10-21): na ficha e no atendimento,
 * acima de tudo. A simulação de um dia de clínica viu a alergia da cliente —
 * a dipirona — só dentro da anamnese, sem nada chamando a atenção.
 * Só aparece para quem vê o prontuário (quem chama só passa o texto então).
 */
export function AlertaDeAlergia({ alergias }: { alergias: string | null }) {
  if (!alergias) return null
  return (
    <div data-alerta-alergia role="note" style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderRadius: 'var(--radius-field-token)',
      background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', color: 'var(--danger)',
      fontSize: 'var(--text-sm-sz)', fontWeight: 700,
    }}>
      <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span>Alergia: <span style={{ fontWeight: 600 }}>{alergias}</span></span>
    </div>
  )
}
