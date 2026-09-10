'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldOff, RotateCw, ArrowLeft } from 'lucide-react'

/**
 * Tela de erro do app.
 *
 * Existe sobretudo por causa das permissões: `assertPermission` faz
 * `throw new Error('Forbidden')` e não havia nenhum `error.tsx` no projeto —
 * então, no exato momento em que a permissão fazia o trabalho dela, a pessoa
 * via a tela genérica de exceção do Next. Permissão bem configurada parecia
 * defeito do sistema.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()
  const forbidden = error.message === 'Forbidden'

  useEffect(() => {
    // Forbidden é esperado — não polui o log como se fosse falha.
    if (!forbidden) console.error('[app/error]', error)
  }, [error, forbidden])

  return (
    <div style={{
      minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div className="card" style={{ maxWidth: 440, textAlign: 'center' }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', margin: '0 auto 14px',
          background: 'var(--brand-soft)', border: '1.5px solid var(--brand-soft-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {forbidden
            ? <ShieldOff size={20} style={{ color: 'var(--brand)' }} />
            : <RotateCw  size={20} style={{ color: 'var(--brand)' }} />}
        </div>

        <h1 style={{
          fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)',
          color: 'var(--text)', marginBottom: 6,
        }}>
          {forbidden ? 'Você não tem acesso a esta área' : 'Algo deu errado'}
        </h1>

        <p style={{
          fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)',
          lineHeight: 'var(--leading-snug)', marginBottom: 20,
        }}>
          {forbidden
            ? 'Seu cargo não libera esta tela. Se precisar dela para trabalhar, fale com quem administra a rede.'
            : 'A tela não conseguiu carregar. Tentar de novo costuma resolver; se insistir, avise quem administra a rede.'}
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button type="button" className="btn-secondary" onClick={() => router.back()}>
            <ArrowLeft size={14} /> Voltar
          </button>
          {!forbidden && (
            <button type="button" className="btn-primary" onClick={reset}>
              <RotateCw size={14} /> Tentar de novo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
