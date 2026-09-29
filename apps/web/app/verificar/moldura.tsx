import Link from 'next/link'

/** A moldura das páginas públicas de verificação — sem sessão, sem menu. */
/** `marca` nula: o logo não leva a lugar nenhum (a página do link de assinatura). */
export function MolduraDaVerificacao({ children, marca = '/verificar' }: { children: React.ReactNode; marca?: string | null }) {
  const estilo = {
    fontSize: 20, fontWeight: 'var(--weight-extrabold)', color: 'var(--brand)',
    letterSpacing: 'var(--tracking-tight)', textDecoration: 'none',
  } as const
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)' }}>
      <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 20px', height: 64, display: 'flex', alignItems: 'center' }}>
          {marca
            ? <Link href={marca} style={estilo}>BellarisOS ✦</Link>
            : <span style={estilo}>BellarisOS ✦</span>}
        </div>
      </header>
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '36px 20px 80px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {children}
      </main>
    </div>
  )
}

export function FormularioDoCodigo({ inicial, erro }: { inicial?: string; erro?: string | null }) {
  return (
    <form action="/verificar" method="get" className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label htmlFor="codigo" style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>
        Código de verificação
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input id="codigo" name="codigo" className="field" defaultValue={inicial} placeholder="XXXX-XXXX-XXXX"
          autoComplete="off" spellCheck={false} maxLength={20} style={{ flex: 1, minWidth: 200, textTransform: 'uppercase' }} />
        <button type="submit" className="btn-primary">Verificar</button>
      </div>
      {erro && <p role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
        O código está no rodapé de cada página do documento assinado.
      </p>
    </form>
  )
}
