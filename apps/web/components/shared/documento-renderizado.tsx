import type { ArvoreResolvida, TrechoResolvido } from '@/lib/documentos/marcacao'

/**
 * Desenha um documento do editor — a mesma árvore que o PDF desenha.
 *
 * Tudo vira texto React (nada de `dangerouslySetInnerHTML`): o conteúdo vem do
 * modelo da rede e dos dados do cliente, e o valor de uma variável é texto
 * puro por construção (`interpolarArvore`).
 *
 * `assinatura`: a imagem da assinatura, quando já existe; sem ela, o lugar
 * marcado com [[assinatura]] (ou o fim do documento) mostra a linha em branco.
 */
export function DocumentoRenderizado({ arvore, assinatura, nomeDoAssinante }: {
  arvore:           ArvoreResolvida
  assinatura?:      string | null
  nomeDoAssinante?: string | null
}) {
  const temLugar = arvore.some(b => b.tipo === 'assinatura')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, color: 'var(--text)', fontSize: 'var(--text-base-sz)', lineHeight: 1.6 }}>
      {arvore.map((b, i) => {
        switch (b.tipo) {
          case 'titulo':
            return b.nivel === 1
              ? <h2 key={i} style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', textAlign: 'center', marginTop: i ? 8 : 0 }}><Trechos ts={b.trechos} /></h2>
              : <h3 key={i} style={{ fontSize: 'var(--text-base-sz)', fontWeight: 'var(--weight-extrabold)', marginTop: 6 }}><Trechos ts={b.trechos} /></h3>
          case 'paragrafo':
            return (
              <p key={i} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {b.linhas.map((l, j) => (
                  <span key={j}>{j > 0 && '\n'}<Trechos ts={l} /></span>
                ))}
              </p>
            )
          case 'lista': {
            const Tag = b.ordenada ? 'ol' : 'ul'
            return (
              <Tag key={i} style={{ paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 4, listStyle: b.ordenada ? 'decimal' : 'disc' }}>
                {b.itens.map((it, j) => <li key={j} style={{ overflowWrap: 'anywhere' }}><Trechos ts={it} /></li>)}
              </Tag>
            )
          }
          case 'divisoria':
            return <hr key={i} style={{ border: 0, borderTop: '1px solid var(--border)', margin: '4px 0' }} />
          case 'assinatura':
            return <LugarDaAssinatura key={i} assinatura={assinatura} nome={nomeDoAssinante} />
        }
      })}
      {!temLugar && <LugarDaAssinatura assinatura={assinatura} nome={nomeDoAssinante} />}
    </div>
  )
}

function Trechos({ ts }: { ts: TrechoResolvido[] }) {
  return <>{ts.map((t, i) => (t.negrito ? <strong key={i} style={{ fontWeight: 'var(--weight-extrabold)' }}>{t.texto}</strong> : <span key={i}>{t.texto}</span>))}</>
}

function LugarDaAssinatura({ assinatura, nome }: { assinatura?: string | null; nome?: string | null }) {
  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 280, maxWidth: '100%', height: 72, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        {assinatura && (
          // eslint-disable-next-line @next/next/no-img-element -- dataURL da assinatura, não imagem otimizável
          <img src={assinatura} alt="Assinatura" style={{ maxHeight: 72, maxWidth: '100%', objectFit: 'contain' }} />
        )}
      </div>
      <div style={{ width: 280, maxWidth: '100%', borderTop: '1px solid var(--text-muted)' }} />
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>{nome || 'Assinatura do cliente'}</p>
    </div>
  )
}
