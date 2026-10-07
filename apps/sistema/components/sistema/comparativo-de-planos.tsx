import { Fragment } from 'react'
import { Check, Minus } from 'lucide-react'
import type { CelulaDoComparativo, Comparativo } from '@/lib/planos/comparativo'

/**
 * A tabela COMPARATIVA dos planos (2026-10-07, pedido do Heitor): uma coluna
 * por plano, uma linha por item — preço, funcionalidades por grupo, limites e
 * adicionais à venda. Só lê (o Gerente vê igual). A montagem é
 * `comparativoDosPlanos`; aqui, só o desenho.
 *
 * No celular a matriz não rola de lado (DEVLOG, 2026-09-21): é uma
 * `cards-mobile` — cada linha vira um bloco, e cada valor leva o nome do plano
 * no `data-label`.
 */
function Celula({ c }: { c: CelulaDoComparativo }) {
  if (c.tipo === 'texto') return <>{c.texto}</>
  const dentro = c.tipo === 'sim'
  return (
    <span className="comparativo-marca" data-dentro={dentro}>
      {dentro ? <Check size={16} aria-hidden /> : <Minus size={16} aria-hidden />}
      <span className="comparativo-oculto">{dentro ? 'Incluído' : 'Não incluído'}</span>
    </span>
  )
}

export function ComparativoDePlanos({ comparativo }: { comparativo: Comparativo }) {
  const { planos, secoes } = comparativo
  if (!planos.length) return null
  const nomeDaColuna = (p: Comparativo['planos'][number]) => (p.ativo ? p.nome : `${p.nome} (desativado)`)
  return (
    <section className="card comparativo-planos-card">
      <h2 className="overline comparativo-planos-titulo">Comparativo dos planos</h2>
      <div className="comparativo-planos-rolagem">
        <table className="cards-mobile suporte-tabela comparativo-planos" aria-label="Comparativo dos planos">
          <thead>
            <tr>
              <th scope="col" aria-label="Item" />
              {planos.map(p => (
                <th key={p.id} scope="col" data-ativo={p.ativo}>{nomeDaColuna(p)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {secoes.map(s => (
              <Fragment key={s.titulo}>
                <tr className="comparativo-grupo">
                  <th scope="colgroup" colSpan={planos.length + 1}>{s.titulo}</th>
                </tr>
                {s.linhas.map(l => (
                  <tr key={`${s.titulo}-${l.rotulo}`}>
                    <th scope="row">
                      {l.rotulo}{l.emBreve && <span className="chip-em-breve">em breve</span>}
                    </th>
                    {l.celulas.map((c, i) => (
                      <td key={planos[i]!.id} data-label={nomeDaColuna(planos[i]!)} data-par>
                        <Celula c={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
