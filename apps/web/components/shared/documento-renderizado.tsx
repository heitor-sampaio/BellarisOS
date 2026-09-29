import type { CSSProperties, ReactNode } from 'react'
import {
  estiloEfetivo, ENTRELINHAS_BASE, FATOR_DE_LINHA, ESPACO_DEPOIS_DO_PARAGRAFO, ESPACO_ANTES_DO_TITULO,
  RECUO_DA_LISTA, TAMANHO_DO_TITULO,
  type Alinhamento, type BlocoResolvido, type DocumentoResolvido, type Trecho,
} from '@/lib/documentos/arvore'
import { familiaCss } from '@/lib/documentos/fontes'

/**
 * Desenha um documento (termo ou contrato) — a MESMA árvore que o PDF desenha
 * (`lib/documentos/pdf/diagramacao.ts`), com as mesmas fontes e medidas.
 *
 * A folha tem as medidas em PONTOS, como o PDF: `--pt` é quanto vale um ponto
 * nesta largura (a folha A4 tem 595pt; ver `.folha-documento` no CSS). No
 * celular, onde a escala deixaria o texto ilegível, o ponto tem um piso — o
 * texto quebra em outras palavras, mas o conteúdo é o mesmo, e é o conteúdo
 * que o hash prova.
 *
 * Tudo vira elemento React (nada de `dangerouslySetInnerHTML`): o conteúdo vem
 * do modelo da rede e dos dados do cliente, e fonte, cor e tamanho só chegam
 * aqui depois de passar pelo conversor (catálogo fechado, `#rrggbb`).
 *
 * `imagens`: URLs temporárias por caminho — a URL não entra no documento.
 * `assinatura`: a imagem da assinatura, quando já existe; sem ela, o lugar
 * marcado (ou o fim do documento) mostra a linha em branco.
 */

const pt = (n: number) => `calc(var(--pt) * ${n})`

const ALINHAR: Record<Alinhamento, CSSProperties['textAlign']> = {
  esquerda: 'left', centro: 'center', direita: 'right', justificado: 'justify',
}
const FLEX: Record<Alinhamento, CSSProperties['justifyContent']> = {
  esquerda: 'flex-start', centro: 'center', direita: 'flex-end', justificado: 'flex-start',
}

interface Ctx {
  base:       DocumentoResolvido['base']
  imagens:    Record<string, string>
  assinatura: string | null
  nome:       string | null
}

export function DocumentoRenderizado({ documento, imagens, assinatura, nomeDoAssinante }: {
  documento:        DocumentoResolvido
  imagens?:         Record<string, string>
  assinatura?:      string | null
  nomeDoAssinante?: string | null
}) {
  const ctx: Ctx = { base: documento.base, imagens: imagens ?? {}, assinatura: assinatura ?? null, nome: nomeDoAssinante ?? null }
  return (
    <div className="folha-documento">
      <div className="folha-documento-pagina" style={{ color: '#1f1f1f', fontFamily: familiaCss(documento.base.fonte), fontSize: pt(documento.base.tamanho) }}>
        {documento.cabecalho.length > 0 && (
          <div className="folha-documento-cabecalho">{documento.cabecalho.map((b, i) => <Bloco key={i} b={b} ctx={ctx} />)}</div>
        )}
        {documento.blocos.map((b, i) => <Bloco key={i} b={b} ctx={ctx} />)}
        {!temAssinatura(documento.blocos) && <LugarDaAssinatura ctx={ctx} />}
        {documento.rodape.length > 0 && (
          <div className="folha-documento-rodape">{documento.rodape.map((b, i) => <Bloco key={i} b={b} ctx={ctx} />)}</div>
        )}
      </div>
    </div>
  )
}

export function temAssinatura(blocos: BlocoResolvido[]): boolean {
  return blocos.some(b => b.tipo === 'assinatura'
    || (b.tipo === 'tabela' && b.linhas.some(l => l.celulas.some(c => temAssinatura(c.blocos)))))
}

function Bloco({ b, ctx }: { b: BlocoResolvido; ctx: Ctx }): ReactNode {
  switch (b.tipo) {
    case 'paragrafo':
    case 'titulo': {
      const nivel = b.tipo === 'titulo' ? b.nivel : null
      const entre = b.entrelinhas ?? ENTRELINHAS_BASE
      const Tag = nivel ? (`h${nivel + 1}` as 'h2' | 'h3' | 'h4') : 'p'
      const tamanho = nivel ? TAMANHO_DO_TITULO[nivel] : ctx.base.tamanho
      return (
        <Tag style={{
          margin: 0,
          marginTop: nivel ? pt(ESPACO_ANTES_DO_TITULO) : 0,
          marginBottom: pt(ESPACO_DEPOIS_DO_PARAGRAFO),
          textAlign: ALINHAR[b.alinhar ?? 'esquerda'],
          lineHeight: FATOR_DE_LINHA * entre,
          whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
          fontWeight: 400,
          // Parágrafo vazio ocupa uma linha, como no PDF.
          minHeight: pt(tamanho * FATOR_DE_LINHA * entre),
        }}>
          {b.trechos.map((t, i) => <Pedaco key={i} t={t} ctx={ctx} nivel={nivel} />)}
        </Tag>
      )
    }
    case 'lista': {
      const Tag = b.ordenada ? 'ol' : 'ul'
      return (
        <Tag start={b.ordenada ? b.inicio : undefined}
          style={{ margin: 0, marginBottom: pt(ESPACO_DEPOIS_DO_PARAGRAFO), paddingLeft: pt(RECUO_DA_LISTA), listStyle: b.ordenada ? 'decimal' : 'disc' }}>
          {b.itens.map((it, i) => (
            <li key={i} style={{ paddingLeft: pt(2) }}>
              {it.map((bi, j) => <Bloco key={j} b={bi} ctx={ctx} />)}
            </li>
          ))}
        </Tag>
      )
    }
    case 'tabela':
      return (
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: pt(ESPACO_DEPOIS_DO_PARAGRAFO) }}>
          <colgroup>{b.larguras.map((w, i) => <col key={i} style={{ width: `${w * 100}%` }} />)}</colgroup>
          <tbody>
            {b.linhas.map((l, i) => (
              <tr key={i}>
                {l.celulas.map((c, j) => {
                  const Tag = c.cabecalho ? 'th' : 'td'
                  return (
                    <Tag key={j} colSpan={c.colspan} style={{
                      border: `${pt(0.6)} solid #9a9a9a`, padding: `${pt(4)} ${pt(5)}`, verticalAlign: 'top',
                      textAlign: 'left', fontWeight: 400, background: c.cabecalho ? '#f2f2f2' : undefined,
                    }}>
                      {c.blocos.map((bi, k) => <Bloco key={k} b={bi} ctx={ctx} />)}
                    </Tag>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'imagem': {
      const url = ctx.imagens[b.caminho]
      const medida: CSSProperties = { width: pt(b.largura), maxWidth: '100%', aspectRatio: `${b.largura} / ${b.altura}`, display: 'block' }
      return (
        <div style={{ marginBottom: pt(ESPACO_DEPOIS_DO_PARAGRAFO), display: 'flex', justifyContent: FLEX[b.alinhar ?? 'esquerda'] }}>
          {url
            // eslint-disable-next-line @next/next/no-img-element -- URL temporária do storage, não otimizável
            ? <img src={url} alt="" style={{ ...medida, height: 'auto' }} />
            : <div style={{ ...medida, border: '1px dashed #bbbbbb' }} />}
        </div>
      )
    }
    case 'divisoria':
      return <hr style={{ border: 0, borderTop: `${pt(0.6)} solid #c8c8c8`, margin: `${pt(4)} 0 ${pt(8)}` }} />
    case 'quebra':
      // Na tela não há páginas: a quebra aparece como separação discreta.
      return <div aria-hidden style={{ borderTop: '1px dashed #d4d4d4', margin: `${pt(10)} 0` }} />
    case 'assinatura':
      return <LugarDaAssinatura ctx={ctx} />
  }
}

function Pedaco({ t, ctx, nivel }: { t: Trecho; ctx: Ctx; nivel: 1 | 2 | 3 | null }) {
  const e = estiloEfetivo(t, ctx.base, nivel !== null)
  const tamanho = t.tamanho ?? (nivel ? TAMANHO_DO_TITULO[nivel] : ctx.base.tamanho)
  const decoracao = [e.sublinhado && 'underline', e.tachado && 'line-through'].filter(Boolean).join(' ')
  return (
    <span style={{
      fontFamily: familiaCss(e.fonte),
      fontSize: pt(tamanho),
      fontWeight: e.negrito ? 700 : 400,
      fontStyle: e.italico ? 'italic' : 'normal',
      textDecoration: decoracao || undefined,
      color: e.cor,
      background: e.realce ?? undefined,
    }}>{t.texto}</span>
  )
}

function LugarDaAssinatura({ ctx }: { ctx: Ctx }) {
  return (
    <div style={{ margin: `${pt(14)} 0 ${pt(8)}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: pt(3) }}>
      <div style={{ width: pt(200), maxWidth: '100%', height: pt(70), display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        {ctx.assinatura && (
          // eslint-disable-next-line @next/next/no-img-element -- dataURL da assinatura, não imagem otimizável
          <img src={ctx.assinatura} alt="Assinatura" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
        )}
      </div>
      <div style={{ width: pt(260), maxWidth: '100%', borderTop: `${pt(0.8)} solid #6b6b6b` }} />
      <p style={{ margin: 0, fontSize: pt(9), color: '#6b6b6b' }}>{ctx.nome || 'Assinatura do cliente'}</p>
    </div>
  )
}
