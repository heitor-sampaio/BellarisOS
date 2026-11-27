'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus, X } from 'lucide-react'
import { acrescentarProdutoNaComanda, tirarProdutoDaComanda, tirarUmProdutoDaComanda } from '@/actions/pdv'
import type { ItemDaComanda } from '@/lib/pdv/itens-da-comanda'
import { situacaoDoItemDaComanda } from '@/lib/pdv/situacoes'
import { recusaDaQuantidadeDoProduto, avisoDaQuantidadeDoProduto, avisosDosItensDaVenda } from '@/lib/vendas/quantidades'
import { faltaAoAcrescentarNaComanda, faltaDosProdutosDaComanda, motivoDaFaltaNoBotao } from '@/lib/vendas/falta-de-estoque'
import { MotivoDoBotao } from '@/components/shared/campos-do-pagamento'
import { useFuso } from '@/components/shared/fuso'
import type { LoteParaBaixa } from '@/lib/estoque/fefo'
import { partesVencidasDaSaida, textoDoVencidoNaVenda } from '@/lib/vendas/lote-vencido'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Os produtos da comanda do atendimento (PDV, fase 5b — o desenho aprovado:
 * "na saída ela levou um sérum, que se acrescenta na mesma comanda" e "sai do
 * estoque da unidade"). Cada um numa linha, com a quantidade e o valor; antes
 * de receber, "−"/"+" na quantidade (A13 da 22ª) e "Tirar". "Acrescentar produto" abre a escolha: os produtos de
 * Venda direta, com o que há no estoque da unidade. O estoque sai quando a
 * comanda é paga, junto do atendimento.
 *
 * `produtos` nulo: a comanda já não recebe produto (paga, cancelada).
 * `aReceber`: a comanda ainda a receber — o produto já vendido nela (a comanda
 * reaberta pelo estorno só do atendimento, D1 da 16ª) diz "já pago"; o
 * estornado diz "estornado · voltou ao estoque" e o valor sai riscado (D2 da 18ª).
 */
export function ProdutosDaComanda({ comandaId, slug, itens, produtos, aReceber = false, naoPontua = false }: {
  comandaId: string
  slug:      string
  itens:     ItemDaComanda[]
  aReceber?: boolean
  /** A32 da 20ª: a venda de produto não pontua nesta rede (com a fidelidade ligada). */
  naoPontua?: boolean
  produtos:  { id: string; name: string; price: number; unidade: string; disponivel: number; lotes?: LoteParaBaixa[] }[] | null
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
    // O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito." — acima de 100 avisa.
    const recusa = recusaDaQuantidadeDoProduto(qtd)
    if (recusa) { setErro(recusa); return }
    comecar(async () => {
      const r = await acrescentarProdutoNaComanda(comandaId, produtoId, qtd, slug)
      if ('error' in r) { setErro(r.error); return }
      setAberto(false); setProdutoId(''); setQuantidade('1')
      router.refresh()
    })
  }
  // A13 da 22ª (princípio 7): a quantidade se muda na linha — o "+" acrescenta
  // um (o banco soma e confere o estoque), o "−" tira um (com um só, a linha).
  const maisUm = (produto: string) => {
    setErro(null)
    comecar(async () => {
      const r = await acrescentarProdutoNaComanda(comandaId, produto, 1, slug)
      if ('error' in r) { setErro(r.error); return }
      router.refresh()
    })
  }
  const menosUm = (itemId: string) => {
    setErro(null)
    comecar(async () => {
      const r = await tirarUmProdutoDaComanda(itemId, slug)
      if ('error' in r) { setErro(r.error); return }
      router.refresh()
    })
  }
  // Acima do comum (decisão do Claude, 25/11): mais de 20 produtos na comanda avisa, e grava.
  const avisoDosProdutos = avisosDosItensDaVenda(itens.filter(i => !i.vendido).map(i => i.quantidade)).produtos
  const avisoDoAcrescentar = avisoDaQuantidadeDoProduto(Number(quantidade))
  // R04 (o Heitor, 26/11: "e tb não deixa realizar a venda de produto sem estoque"): a comanda
  // não passa do que há na unidade — o "Acrescentar" e o "+" desligam com o motivo, e o que já
  // está nela e passou do saldo (que caiu depois) diz a falta. O banco confere do mesmo jeito.
  const naComanda = (produto: string) => itens.filter(i => !i.vendido && i.produtoId === produto).reduce((s, i) => s + i.quantidade, 0)
  const faltaDoAcrescentar = faltaAoAcrescentarNaComanda(produtos?.find(p => p.id === produtoId), Math.trunc(Number(quantidade)) || 0, naComanda(produtoId))
  const noLimite = (i: ItemDaComanda) => {
    const p = produtos?.find(x => x.id === i.produtoId)
    return !!p && naComanda(i.produtoId) >= p.disponivel
  }
  const faltaNaComanda = faltaDosProdutosDaComanda(itens, produtos)
  // D3 da 38ª (ES-24, "o vencido é sinalizado, não bloqueado"): o que cada linha ainda não
  // vendida tira de lote vencido — pela ordem do gatilho, contando o que as linhas de cima
  // do mesmo produto já tiram. Lido uma vez (Date não roda no render).
  const fuso = useFuso()
  const [agora] = useState(() => new Date())
  const vencidoDoItem = (i: ItemDaComanda, n: number) => {
    const p = produtos?.find(x => x.id === i.produtoId)
    if (!p || i.vendido) return null
    const antes = itens.slice(0, n).filter(o => !o.vendido && o.produtoId === i.produtoId).reduce((s, o) => s + o.quantidade, 0)
    return textoDoVencidoNaVenda(partesVencidasDaSaida(p.lotes, i.quantidade, agora, fuso, antes), p.unidade)
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
      {itens.map((i, n) => (
        <div key={i.id} data-item-da-comanda data-estornado={i.estornadoEm ? 'true' : undefined} className="pdv-linha-da-comanda" style={{
          display: 'grid', gridTemplateColumns: produtos && !i.vendido ? 'minmax(0, 1fr) auto 110px' : 'minmax(0, 1fr) 40px 110px',
          gap: 10, alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--hairline)',
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, color: 'var(--text)' }}>{i.nome}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 2 }}>
              {situacaoDoItemDaComanda(i, aReceber, naoPontua)}
            </p>
            {vencidoDoItem(i, n) && (
              <span role="status" data-lote-vencido-na-venda style={{ display: 'block', marginTop: 2, fontSize: 'var(--text-2xs)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>
                {vencidoDoItem(i, n)}
              </span>
            )}
            {produtos && !i.vendido && avisoDaQuantidadeDoProduto(i.quantidade) && (
              <span role="status" data-acima-do-comum="quantidade-do-item" style={{ display: 'block', marginTop: 2, fontSize: 'var(--text-2xs)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>
                {avisoDaQuantidadeDoProduto(i.quantidade)}
              </span>
            )}
            {produtos && !i.vendido && (
              // A3 da 39ª: o "Tirar", o "−" e o "+" têm o alvo de toque (`.botao-de-toque`).
              <button type="button" className="btn-ghost botao-de-toque" aria-label={`Tirar ${i.nome}`}
                disabled={pendente} onClick={() => tirar(i.id)}
                style={{ marginTop: 4, fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                <X size={12} aria-hidden /> Tirar
              </button>
            )}
          </div>
          {produtos && !i.vendido ? (
            <span data-quantidade-do-item style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <button type="button" className="btn-ghost botao-de-toque" data-menos-um aria-label={`Um ${i.nome} a menos`} title="Um a menos"
                disabled={pendente} onClick={() => menosUm(i.id)}>
                <Minus size={12} aria-hidden />
              </button>
              <span style={{ minWidth: 20, color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>{i.quantidade}</span>
              <button type="button" className="btn-ghost botao-de-toque" data-mais-um aria-label={`Um ${i.nome} a mais`}
                title={noLimite(i) ? 'Não há mais na unidade' : 'Um a mais'}
                disabled={pendente || noLimite(i)} onClick={() => maisUm(i.produtoId)}>
                <Plus size={12} aria-hidden />
              </button>
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>{i.quantidade}</span>
          )}
          <span style={{
            textAlign: 'right', fontWeight: 800, color: i.estornadoEm ? 'var(--text-muted)' : 'var(--text)',
            textDecoration: i.estornadoEm ? 'line-through' : undefined,
          }}>{brl(i.preco * i.quantidade)}</span>
        </div>
      ))}

      {faltaNaComanda && (
        <p data-falta-de-estoque role="status" style={{
          marginTop: 8, color: 'var(--warning)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
          borderRadius: 'var(--radius-field-token)', padding: '8px 12px', fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)',
        }}>
          {faltaNaComanda} Tire ou diminua o produto para receber.
        </p>
      )}

      {produtos && avisoDosProdutos && (
        <span role="status" data-acima-do-comum="produtos-da-comanda" style={{ display: 'block', marginTop: 8, fontSize: 'var(--text-2xs)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>
          {avisoDosProdutos}
        </span>
      )}

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
              <input className="field" type="number" min={1} step={1} inputMode="numeric" aria-label="Quantidade"
                value={quantidade} onChange={ev => setQuantidade(ev.target.value)} />
            </div>
          )}
          {avisoDoAcrescentar && (
            <span role="status" data-acima-do-comum="quantidade-do-produto" style={{ fontSize: 'var(--text-2xs)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>
              {avisoDoAcrescentar}
            </span>
          )}
          {faltaDoAcrescentar && (
            <span role="status" data-falta-ao-acrescentar style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>
              {faltaDoAcrescentar}
            </span>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <MotivoDoBotao motivo={pendente ? null : motivoDaFaltaNoBotao(faltaDoAcrescentar)} />
            <button type="button" className="btn-secondary" onClick={() => { setAberto(false); setErro(null) }}>Cancelar</button>
            {produtos.length > 0 && (
              <button type="button" className="btn-primary" disabled={pendente || !!faltaDoAcrescentar} onClick={acrescentar}>
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
