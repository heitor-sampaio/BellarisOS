'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Loader2, X } from 'lucide-react'
import { decidirAcaoDoCopilot } from '@/actions/copilot'
import { erroParaTela } from '@/lib/erro-na-tela'
import { caminhoInterno } from '@/lib/origem'
import type { Cartao } from '@/lib/copilot/tipos'

/**
 * Os cartões do Copilot: o de AÇÃO (o resumo do que vai ser gravado, com
 * Confirmar e Cancelar — nada é gravado antes do Confirmar) e o de LINKS (as
 * fichas que uma consulta achou).
 */

const ESTADO: Record<string, string> = {
  executando: 'Gravando…',
  feita:      'Feito',
  cancelada:  'Cancelado — nada foi gravado.',
  falhou:     'Não foi gravado',
  vencida:    'Este cartão venceu. Peça de novo ao Copilot.',
}

const hrefSeguro = (href?: string) => (href ? caminhoInterno(href, '') || null : null)

export function CartaoDoCopilot({ cartao, pagina, aoNavegar, aoMudar }: {
  cartao: Cartao
  pagina: string
  aoNavegar?: () => void
  aoMudar?: (c: Cartao) => void
}) {
  const router = useRouter()
  const [pendente, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  if (cartao.tipo === 'links') {
    return (
      <div className="copilot-cartao" data-cartao="links">
        {cartao.titulo && <h4>{cartao.titulo}</h4>}
        <ul className="copilot-links">
          {cartao.itens.map((item, i) => {
            const href = hrefSeguro(item.href)
            const conteudo = <><span>{item.texto}</span>{item.detalhe && <small>{item.detalhe}</small>}</>
            return (
              <li key={i}>
                {href
                  ? <Link href={href} onClick={aoNavegar}>{conteudo}</Link>
                  : <span className="copilot-link-sem-href">{conteudo}</span>}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  function decidir(decisao: 'confirmar' | 'cancelar') {
    if (cartao.tipo !== 'acao') return
    setErro(null)
    startTransition(async () => {
      try {
        const r = await decidirAcaoDoCopilot(cartao.acaoId, decisao, pagina)
        if (r.error && r.status === 'falhou' && !r.resultado) { setErro(r.error); return }
        aoMudar?.({ ...cartao, status: r.status, resultado: r.resultado ?? (r.error ? { mensagem: r.error } : null) })
        // A tela por trás mostra o que mudou (o agendamento novo na agenda).
        if (r.status === 'feita') router.refresh()
      } catch (e) {
        setErro(erroParaTela(e, 'Não foi possível concluir. Tente de novo.'))
      }
    })
  }

  const { resumo, status, resultado } = cartao
  const linkDoResultado = hrefSeguro(resultado?.href)
  return (
    <div className="copilot-cartao" data-cartao="acao" data-status={status}>
      <h4>{resumo.titulo}</h4>
      {resumo.linhas.length > 0 && (
        <dl>
          {resumo.linhas.map((l, i) => (
            <div key={i} style={{ display: 'contents' }}>
              <dt>{l.rotulo}</dt>
              <dd>{l.valor}</dd>
            </div>
          ))}
        </dl>
      )}
      {resumo.aviso && status === 'pendente' && <p className="copilot-cartao-aviso" style={{ margin: 0 }}>{resumo.aviso}</p>}

      {status === 'pendente' && !pendente && (
        <div className="copilot-cartao-botoes">
          <button type="button" className="btn-primary" onClick={() => decidir('confirmar')}>
            <Check size={14} /> Confirmar
          </button>
          <button type="button" className="btn-ghost" onClick={() => decidir('cancelar')}>
            <X size={14} /> Cancelar
          </button>
        </div>
      )}
      {(pendente || status === 'executando') && (
        <span className="copilot-pensando"><Loader2 size={13} className="animate-spin" /> Gravando…</span>
      )}
      {status !== 'pendente' && status !== 'executando' && !pendente && (
        <div className="copilot-cartao-estado" data-status={status} role="status">
          <span>{ESTADO[status]}{status === 'feita' || status === 'falhou' ? (resultado?.mensagem ? ` · ${resultado.mensagem}` : '') : ''}</span>
          {status === 'feita' && linkDoResultado && (
            <Link href={linkDoResultado} onClick={aoNavegar}>{resultado?.rotuloDoLink ?? 'Abrir'} →</Link>
          )}
        </div>
      )}
      {erro && <div className="copilot-erro">{erro}</div>}
    </div>
  )
}
