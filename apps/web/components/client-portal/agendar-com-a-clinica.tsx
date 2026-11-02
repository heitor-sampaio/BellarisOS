import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { AClinica } from '@/lib/clientes/a-clinica'
import { CartaoDaClinica } from '@/components/client-portal/cartao-da-clinica'

/**
 * O agendar do app da cliente ARQUIVADA (o Heitor: "concordo", F6 da 5ª
 * simulação): em vez do passo a passo, "Fale com a clínica para agendar" e o
 * cartão da unidade do endereço, com o WhatsApp e o telefone.
 */
export function AgendarComAClinica({ slug, clinica }: { slug: string; clinica: AClinica | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href={`/${slug}/cliente/agendamentos`} aria-label="Voltar" className="btn-ghost" style={{ padding: 8 }}>
          <ChevronLeft size={16} aria-hidden="true" />
        </Link>
        <h1 style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Novo agendamento
        </h1>
      </div>
      <div data-agendar-com-a-clinica className="card" style={{ padding: '18px 20px' }}>
        <p style={{ fontWeight: 800, color: 'var(--text)', fontSize: 'var(--text-base-sz)', marginBottom: 4 }}>
          Fale com a clínica para agendar.
        </p>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 'var(--leading-snug)' }}>
          O agendamento pelo app não está disponível para o seu cadastro. A recepção marca o seu horário.
        </p>
      </div>
      {clinica && <CartaoDaClinica clinica={clinica} />}
    </div>
  )
}
