const S = { borderRadius: 'var(--radius-row)' }

/**
 * O esqueleto de carregamento das telas dos portais.
 *
 * Mora aqui (e cada seção tem o seu `loading.tsx` de uma linha) porque o
 * portal NÃO pode ter `loading.tsx` no topo (D18, 2026-10-28): ele envolveria o
 * `[...rota]` num Suspense, e o 404 da rota inexistente sairia com HTTP 200
 * (com streaming o status vai antes do `notFound()`). `tests/loading-fora-do-catch-all`
 * trava os dois lados.
 */
function Esqueleto({ titulo, acao, filtro, linhas }: { titulo: number; acao: number; filtro: number; linhas: number }) {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="skeleton" style={{ height: 28, width: titulo, ...S }} />
        <div className="skeleton" style={{ height: 36, width: acao, ...S }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="skeleton" style={{ height: 38, flex: 1, ...S }} />
        <div className="skeleton" style={{ height: 38, width: filtro, ...S }} />
      </div>
      <div className="skeleton" style={{ height: 40, ...S }} />
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 56, ...S }} />
      ))}
    </div>
  )
}

/** Portal da rede (/admin). */
export function EsqueletoDaRede() {
  return <Esqueleto titulo={220} acao={140} filtro={110} linhas={8} />
}

/** Portal da unidade (/[slug]) e o da cliente. */
export function EsqueletoDaUnidade() {
  return <Esqueleto titulo={200} acao={130} filtro={100} linhas={7} />
}
