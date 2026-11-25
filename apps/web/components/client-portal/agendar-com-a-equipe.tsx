import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { AUnidade } from '@/lib/clientes/a-unidade'
import { CartaoDaUnidade } from '@/components/client-portal/cartao-da-unidade'
import { falaDaRedeDoPortal } from '@/lib/clientes/nome-da-rede'

/**
 * O agendar do app da cliente ARQUIVADA (o Heitor: "concordo", F6 da 5ª
 * simulação): em vez do passo a passo, "Fale com <o nome da rede> para agendar" (CA1) e o
 * cartão da unidade do endereço, com o WhatsApp e o telefone.
 */
export async function AgendarComAEquipe({ slug, unidade }: { slug: string; unidade: AUnidade | null }) {
  const { FaleCom } = await falaDaRedeDoPortal(slug)
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
      <div data-agendar-com-a-equipe className="card" style={{ padding: '18px 20px' }}>
        <p style={{ fontWeight: 800, color: 'var(--text)', fontSize: 'var(--text-base-sz)', marginBottom: 4 }}>
          {FaleCom} para agendar.
        </p>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 'var(--leading-snug)' }}>
          O agendamento pelo app não está disponível para o seu cadastro. A equipe marca o seu horário.
        </p>
      </div>
      {unidade && <CartaoDaUnidade unidade={unidade} />}
    </div>
  )
}
