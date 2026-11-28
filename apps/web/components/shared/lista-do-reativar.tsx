'use client'

import { useState, useTransition } from 'react'
import { erroParaTela } from '@/lib/erro-na-tela'
import {
  LinhaDoReativar, juntarClientesDoReativar, rotuloDoVerMais,
  type CarregarMaisDoReativar, type ClienteSumida,
} from '@/components/shared/quadros-de-clientes'

/**
 * As linhas do "Reativar clientes" e o "Ver mais" (A18 da 43ª; indicadores:CC-06,
 * princípio 3): o link diz quantas faltam e o total, e abre essas — a página
 * seguinte do MESMO recorte, no próprio quadro, pela action do quadro. Era um
 * link para a lista de Clientes inteira. Decisão do Claude, 28/11.
 *
 * Continua um link (`<a>`): o "Ver mais N (T no total)" é procurado como link
 * (e2e/ficha-uso-da-10.spec.ts, "A35"); sem JavaScript ele leva ao quadro.
 */
export function ListaDoReativar({ clientes, total, hrefAgendar, carregarMais, unidade, mostrarUnidade }: {
  clientes: ClienteSumida[]; total: number; hrefAgendar: string
  carregarMais: CarregarMaisDoReativar
  unidade: string | null; mostrarUnidade: boolean
}) {
  const [linhas, setLinhas] = useState(clientes)
  const [totalAgora, setTotalAgora] = useState(total)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, iniciar] = useTransition()

  // Dado novo do servidor (o refresh do tempo real) vale sobre o que foi aberto:
  // compara a REFERÊNCIA, como a fidelidade da ficha.
  const [daProp, setDaProp] = useState({ clientes, total })
  if (daProp.clientes !== clientes || daProp.total !== total) {
    setDaProp({ clientes, total })
    setLinhas(clientes)
    setTotalAgora(total)
    setErro(null)
  }

  function verMais() {
    if (carregando) return
    const mostradas = linhas
    iniciar(async () => {
      try {
        const r = await carregarMais({ deslocamento: mostradas.length, unidade })
        if (r.error !== undefined) { setErro(r.error); return }
        const juntas = juntarClientesDoReativar(mostradas,
          r.clientes.map(c => (mostrarUnidade ? c : { ...c, unidade: null })))
        setErro(null)
        setLinhas(juntas)
        // A lista mudou entre uma página e outra e não veio ninguém novo: ela acabou aqui.
        setTotalAgora(juntas.length > mostradas.length ? r.total : juntas.length)
      } catch (e) {
        setErro(erroParaTela(e, 'Não foi possível carregar mais clientes.'))
      }
    })
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        {linhas.map(c => <LinhaDoReativar key={c.id} c={c} hrefAgendar={hrefAgendar} />)}
      </div>

      {erro && (
        <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', marginTop: 12 }}>{erro}</p>
      )}

      {totalAgora > linhas.length && (
        <a href="#reativar-clientes" data-ver-mais-do-reativar aria-busy={carregando}
          onClick={e => { e.preventDefault(); verMais() }}
          style={{
            display: 'block', textAlign: 'center', marginTop: 16,
            padding: '8px', borderRadius: 10, border: '1px solid var(--border)',
            fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none',
            cursor: carregando ? 'progress' : 'pointer',
          }}>
          {/* A35 da 10ª: "Ver 5 clientes inativos" parecia o total (são as além das que o quadro lista). */}
          {carregando ? 'Carregando…' : rotuloDoVerMais(linhas.length, totalAgora)}
        </a>
      )}
    </>
  )
}
