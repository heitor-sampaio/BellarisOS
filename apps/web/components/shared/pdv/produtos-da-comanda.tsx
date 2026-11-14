'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { acrescentarProdutoNaComanda, tirarProdutoDaComanda } from '@/actions/pdv'
import type { ItemDaComanda } from '@/lib/pdv/itens-da-comanda'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Os produtos da comanda do atendimento (PDV, fase 5b — o desenho aprovado:
 * "na saída ela levou um sérum, que se acrescenta na mesma comanda" e "sai do
 * estoque da unidade"). Cada um numa linha, com a quantidade e o valor; antes
 * de receber, "Tirar". "Acrescentar produto" abre a escolha: os produtos de
 * Venda direta, com o que há no estoque da unidade. O estoque sai quando a
 * comanda é paga, junto do atendimento.
 *
 * `produtos` nulo: a comanda já não recebe produto (paga, cancelada).
 */
export function ProdutosDaComanda({ comandaId, slug, itens, produtos }: {
  comandaId: string
  slug:      string
  itens:     ItemDaComanda[]
  produtos:  { id: string; name: string; price: number; unidade: string; disponivel: number }[] | null
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [produtoId, setProdutoId] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, comecar] = useTransition()

  const acrescentar = () => {
    setErro(null)
    if (!produtoId) { setErro('Escolha o produto.'); return }
    const qtd = Number(quantidade)
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 100) { setErro('Quantidade inválida (de 1 a 100).'); return }
    comecar(async () => {
      const r = await acrescentarProdutoNaComanda(comandaId, produtoId, qtd, slug)
      if ('error' in r) { setErro(r.error); return }
      setAberto(false); setProdutoId(''); setQuantidade('1')
      router.refresh()
    })
  }
  const tirar = (itemId: string) => {
    setErro(null)
    comecar(async () => {
      const r = await tirarProdutoDaComanda(itemId, slug)
      if ('error' in r) { setErro(r.error); return }
      router.refresh()
    })
  }

  return (
    <>
      {itens.map(i => (
        <div key={i.id} data-item-da-comanda style={{
          display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 40px 110px',
          gap: 10, alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--hairline)',
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, color: 'var(--text)' }}>{i.nome}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 2 }}>
              {i.vendido ? 'Produto · saiu do estoque da unidade' : 'Produto · sai do estoque da unidade ao receber'}
            </p>
            {produtos && !i.vendido && (
              <button type="button" className="btn-ghost" aria-label={`Tirar ${i.nome}`}
                disabled={pendente} onClick={() => tirar(i.id)}
                style={{ marginTop: 4, padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                <X size={12} aria-hidden /> Tirar
              </button>
            )}
          </div>
          <span style={{ color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>{i.quantidade}</span>
          <span style={{ textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{brl(i.preco * i.quantidade)}</span>
        </div>
      ))}

      {produtos && !aberto && (
        <button type="button" className="btn-ghost" onClick={() => { setAberto(true); setErro(null) }}
          style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--brand)', fontWeight: 700 }}>
          <Plus size={14} aria-hidden /> Acrescentar produto
        </button>
      )}

      {produtos && aberto && (
        <div data-acrescentar-produto style={{
          marginTop: 10, padding: 12, borderRadius: 'var(--radius-field)', border: '1px solid var(--hairline)',
          background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {produtos.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              Nenhum produto de Venda direta com preço nesta rede. Marque o uso e o preço no cadastro do produto, no Estoque.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px', gap: 8 }}>
              <select className="field" aria-label="Produto a acrescentar" value={produtoId} onChange={ev => setProdutoId(ev.target.value)}>
                <option value="">Escolha o produto…</option>
                {produtos.map(p => (
                  <option key={p.id} value={p.id} disabled={p.disponivel < 1}>
                    {p.name} · {brl(p.price)} · {p.disponivel < 1 ? 'sem estoque' : `${p.disponivel} ${p.unidade} na unidade`}
                  </option>
                ))}
              </select>
              <input className="field" type="number" min={1} max={100} step={1} inputMode="numeric" aria-label="Quantidade"
                value={quantidade} onChange={ev => setQuantidade(ev.target.value)} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={() => { setAberto(false); setErro(null) }}>Cancelar</button>
            {produtos.length > 0 && (
              <button type="button" className="btn-primary" disabled={pendente} onClick={acrescentar}>
                {pendente ? 'Acrescentando…' : 'Acrescentar'}
              </button>
            )}
          </div>
        </div>
      )}

      {erro && <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--text-xs-sz)', marginTop: 8 }}>{erro}</p>}
    </>
  )
}
