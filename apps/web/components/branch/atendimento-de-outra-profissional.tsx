'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, CalendarX } from 'lucide-react'
import { rotaAgenda } from '@/lib/rotas'
import { Dica } from '@/components/shared/dica'

/**
 * O atendimento de OUTRA profissional aberto pela URL, com a agenda "só os
 * meus" (r2-atd-04, revisão do Heitor de 2026-11-03: o 404 "Página não
 * encontrada" parecia defeito). A tela diz de quem é e o caminho de volta — e
 * continua barrando: nada do atendimento (cliente, procedimento, ficha) chega
 * aqui, só o nome de quem atende, que a agenda já mostra nos seletores.
 */
export function AtendimentoDeOutraProfissional({ slug, profissional }: {
  slug:         string
  profissional: string | null
}) {
  const pathname = usePathname()
  return (
    <div data-atendimento-de-outra style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ maxWidth: 460, textAlign: 'center' }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', margin: '0 auto 14px',
          background: 'var(--brand-soft)', border: '1.5px solid var(--brand-soft-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CalendarX size={20} style={{ color: 'var(--brand)' }} aria-hidden="true" />
        </div>
        <h1 style={{
          fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)',
          color: 'var(--text)', marginBottom: profissional ? 6 : 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <span>Este atendimento é de outra profissional</span>
          {/* O porquê mora na dica (2026-11-16, "A explicação mora na dica"). */}
          <Dica rotulo="Por que não abre">
            Com a sua agenda em “só os meus”, você abre só os seus atendimentos.
          </Dica>
        </h1>
        {profissional && (
          <p style={{
            fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)',
            lineHeight: 'var(--leading-snug)', marginBottom: 20,
          }}>
            Ele está na agenda de <strong style={{ color: 'var(--text)' }}>{profissional}</strong>.
          </p>
        )}
        <Link href={rotaAgenda(pathname, slug)} className="btn-primary" style={{ display: 'inline-flex' }}>
          <ArrowLeft size={14} aria-hidden="true" /> Voltar à agenda
        </Link>
      </div>
    </div>
  )
}
