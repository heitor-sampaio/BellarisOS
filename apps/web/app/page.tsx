import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, Users, TrendingUp } from 'lucide-react'
import { getTenantContext, getRedirectPath } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { AuthRedirect } from '@/components/auth-redirect'

export const dynamic = 'force-dynamic'

const FEATURES = [
  {
    icon: CalendarDays,
    title: 'Agenda inteligente',
    desc: 'Agendamentos online e internos, sala por sala, com confirmações automáticas via WhatsApp.',
  },
  {
    icon: Users,
    title: 'CRM completo',
    desc: 'Prontuário digital, histórico de procedimentos, fidelidade e mensagens em um só lugar.',
  },
  {
    icon: TrendingUp,
    title: 'Financeiro integrado',
    desc: 'Caixa, comissões, DRE por filial e visão consolidada da rede em tempo real.',
  },
]

export default async function LandingPage() {
  try {
    const ctx = await getTenantContext()
    const admin = createAdminClient()

    if (ctx.isClient && ctx.clientId) {
      const { data: client } = await admin
        .from('clients').select('branch_id').eq('id', ctx.clientId).single()
      if (client?.branch_id) {
        const { data: br } = await admin
          .from('branches').select('slug').eq('id', client.branch_id).single()
        if (br?.slug) redirect(`/${br.slug}/cliente`)
      }
    } else if (ctx.branchId) {
      const { data: br } = await admin
        .from('branches').select('slug').eq('id', ctx.branchId).single()
      redirect(getRedirectPath(ctx.role, br?.slug ?? null))
    } else {
      redirect(getRedirectPath(ctx.role, null))
    }
  } catch {
    // Não autenticado — exibe landing page normalmente
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', fontFamily: 'var(--font-sans)' }}>
      {/* Fallback client-side: detecta sessão após WebView carregar cookie store */}
      <AuthRedirect />

      {/* -- Header ---------------------------------------- */}
      <header style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '0 24px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 20,
          fontWeight: 'var(--weight-extrabold)',
          color: 'var(--brand)',
          letterSpacing: 'var(--tracking-tight)',
        }}>
          BellarisOS ✦
        </span>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link
            href="/login"
            style={{
              fontSize: 'var(--text-sm-sz)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-muted)',
              textDecoration: 'none',
              padding: '8px 16px',
            }}
          >
            Entrar
          </Link>
          <Link href="/register" className="btn-primary" style={{ fontSize: 'var(--text-sm-sz)' }}>
            Criar conta
          </Link>
        </nav>
      </header>

      {/* -- Hero ------------------------------------------ */}
      <section style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: '80px 24px 72px',
        textAlign: 'center',
      }}>
        <span className="overline" style={{ marginBottom: 16, display: 'block' }}>
          Gestão para redes de estética
        </span>

        <h1 style={{
          fontSize: 'clamp(2rem, 5vw, 3.25rem)',
          fontWeight: 'var(--weight-extrabold)',
          letterSpacing: 'var(--tracking-tight)',
          color: 'var(--text)',
          lineHeight: 1.15,
          marginBottom: 20,
        }}>
          Tudo que sua rede de clínicas precisa, em um só lugar
        </h1>

        <p style={{
          fontSize: 'var(--text-base-sz)',
          color: 'var(--text-muted)',
          lineHeight: 1.65,
          maxWidth: 520,
          margin: '0 auto 36px',
        }}>
          Agenda, CRM, financeiro, estoque e muito mais — desenhado para redes de 1 a 5 filiais que querem crescer com controle.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/register" className="btn-primary" style={{ fontSize: 'var(--text-base-sz)', padding: '12px 28px' }}>
            Crie sua conta grátis
          </Link>
          <Link
            href="/login"
            style={{
              fontSize: 'var(--text-base-sz)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-muted)',
              textDecoration: 'none',
              padding: '12px 20px',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Já tenho conta
          </Link>
        </div>
      </section>

      {/* -- Features -------------------------------------- */}
      <section style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '0 24px 96px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 20,
      }}>
        {FEATURES.map(f => {
          const Icon = f.icon
          return (
            <div key={f.title} className="card" style={{ padding: '28px 24px' }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'var(--brand-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}>
                <Icon size={20} style={{ color: 'var(--brand)' }} />
              </div>
              <h3 style={{
                fontSize: 'var(--text-card-title)',
                fontWeight: 'var(--weight-extrabold)',
                color: 'var(--text)',
                letterSpacing: 'var(--tracking-tight)',
                marginBottom: 8,
              }}>
                {f.title}
              </h3>
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {f.desc}
              </p>
            </div>
          )
        })}
      </section>

      {/* -- Footer ---------------------------------------- */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '24px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)' }}>
          © 2026 BellarisOS · Todos os direitos reservados
        </p>
      </footer>
    </div>
  )
}
