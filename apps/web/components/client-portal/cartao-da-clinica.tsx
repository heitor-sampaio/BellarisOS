import { Clock3, MapPin, MessageCircle, Phone } from 'lucide-react'
import type { AClinica } from '@/lib/clientes/a-clinica'

/**
 * O cartão "A clínica" do app (J-66): a unidade do endereço — onde fica,
 * como falar com ela e quando abre. Sem dado nenhum cadastrado, não aparece.
 */
export function CartaoDaClinica({ clinica }: { clinica: AClinica }) {
  if (!clinica.endereco && !clinica.telefone && !clinica.horario.length) return null
  const linha = { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5 } as const
  return (
    <section data-a-clinica aria-label="A clínica">
      <p style={{
        fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)',
        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10,
      }}>
        A clínica
      </p>
      <div className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontWeight: 800, color: 'var(--text)', fontSize: 'var(--text-base-sz)', overflowWrap: 'anywhere' }}>{clinica.nome}</p>
        {clinica.endereco && (
          <p style={linha}>
            <MapPin size={15} color="var(--brand)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{clinica.endereco}</span>
          </p>
        )}
        {clinica.telefone && (
          <p style={linha}>
            <Phone size={15} color="var(--brand)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{clinica.telefone}</span>
          </p>
        )}
        {clinica.horario.length > 0 && (
          <div style={linha}>
            <Clock3 size={15} color="var(--brand)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>{clinica.horario.map(h => <p key={h}>{h}</p>)}</div>
          </div>
        )}
        {(clinica.whatsapp || clinica.ligar) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
            {clinica.whatsapp && (
              <a href={clinica.whatsapp} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                <MessageCircle size={14} aria-hidden="true" /> WhatsApp
              </a>
            )}
            {clinica.ligar && (
              <a href={clinica.ligar} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                <Phone size={14} aria-hidden="true" /> Ligar
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
