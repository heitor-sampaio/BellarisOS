'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { SegSelect } from '@/components/shared/seg-select'
import { useFala } from '@/components/shared/uma-unidade'
import { AtendeNasUnidades } from '@/components/shared/atende-nas-unidades'
import { principalDasMarcadas } from '@/lib/unidades/do-membro'
import { estadoDoAtende } from '@/lib/equipe/atende'
import { Dica } from '@/components/shared/dica'

interface Unidade { id: string; name: string }

/** O valor do campo "Unidades": a rede inteira, ou as marcadas (a principal primeiro). */
export type ValorDasUnidades = 'rede' | string[]

/**
 * "Unidades" no cadastro da Equipe (EQ1a do Bloco Equipe, 2026-11-14; o
 * Heitor, 2026-11-13: "permitir linkar a pessoa em mais de uma unidade").
 * "A rede inteira" (todas, inclusive as que vierem) ou as unidades marcadas,
 * uma ou mais. Quem não tem a rede inteira não a dá, e marca só as DELA (as
 * outras aparecem travadas — o servidor também só muda as dela).
 *
 * Vai ao servidor em campos ocultos (`scope`, `_unidades=1`, `unidades` com os
 * ids separados por vírgula): controlado, porque o React 19 limpa o campo solto
 * a cada envio.
 */
export function UnidadesDoMembro({ unidades, editaveis, valor, aoMudar, id = 'unidades', principalDeAntes = null }: {
  /** As unidades que a tela mostra (as ativas da rede, ou as de quem edita). */
  unidades:  Unidade[]
  /** As que quem edita marca; null = tem a rede inteira (e dá a rede inteira). */
  editaveis: string[] | null
  valor:     ValorDasUnidades
  aoMudar:   (v: ValorDasUnidades) => void
  id?:       string
  /** A20 da 17ª: na edição, a principal de hoje — fica enquanto estiver marcada. */
  principalDeAntes?: string | null
}) {
  const fala = useFala()
  // A escolha de antes volta quando se sai da "rede inteira" e se volta.
  const [lembradas, setLembradas] = useState<string[]>(Array.isArray(valor) ? valor : (unidades.length === 1 ? [unidades[0]!.id] : []))
  const marcadas = Array.isArray(valor) ? valor : []
  const pode = (u: string) => editaveis === null || editaveis.includes(u)
  const alternar = (u: string, ligar: boolean) => {
    const novas = ligar ? [...marcadas.filter(x => x !== u), u] : marcadas.filter(x => x !== u)
    setLembradas(novas)
    aoMudar(novas)
  }
  const titulo = `${id}-titulo`
  const principalId = principalDasMarcadas(marcadas, unidades.map(u => u.id), principalDeAntes)
  const principal = unidades.find(u => u.id === principalId)?.name ?? null

  return (
    <div role="group" aria-labelledby={titulo} data-unidades-do-membro
      style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input type="hidden" name="scope" value={valor === 'rede' ? 'network' : 'branch'} />
      <input type="hidden" name="_unidades" value="1" />
      <input type="hidden" name="unidades" value={marcadas.join(',')} />
      {/* O "o que vale" de cada escolha mora na dica (2026-11-16). */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
        <span id={titulo} className="overline">Unidades</span>
        {(valor === 'rede' || unidades.length > 1) && (
          <Dica rotulo="Sobre o acesso às unidades">
            {valor === 'rede'
              ? fala('Acesso a todas as unidades, inclusive as que a rede abrir depois.')
              : 'A pessoa abre e opera só as unidades marcadas. Com mais de uma, ela troca de unidade pelo topo da tela.'}
          </Dica>
        )}
      </span>
      {editaveis === null && (
        <SegSelect
          options={[
            { key: 'rede',     label: fala('A rede inteira') },
            { key: 'escolher', label: unidades.length > 1 ? 'Escolher as unidades' : 'Só a unidade' },
          ]}
          value={valor === 'rede' ? 'rede' : 'escolher'}
          onSelect={k => aoMudar(k === 'rede' ? 'rede' : lembradas)}
          ariaLabel="Unidades do membro"
        />
      )}
      {valor !== 'rede' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
            {unidades.map(u => (
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: pode(u.id) ? 'pointer' : 'default' }}
                title={pode(u.id) ? undefined : 'Essa unidade não é sua: quem a marca é quem tem acesso a ela.'}>
                <input type="checkbox" checked={marcadas.includes(u.id)} disabled={!pode(u.id)}
                  onChange={e => alternar(u.id, e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} />
                <span style={{ fontSize: 'var(--text-sm-sz)', color: pode(u.id) ? 'var(--text)' : 'var(--text-muted)' }}>{u.name}</span>
              </label>
            ))}
          </div>
          {/* A20 da 17ª (princípio 3): a tela não dizia qual era a principal. O login abre na
              última unidade usada, e na principal só quando não há uma (PO1; EQ-06 do catálogo de 24/11). */}
          {marcadas.length > 1 && principal && (
            <span data-unidade-principal style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
              Principal: <b style={{ color: 'var(--text)' }}>{principal}</b> — o login abre na última unidade que ela usou; sem uma, nesta.
            </span>
          )}
        </>
      )}
    </div>
  )
}

/**
 * O estado do "Atende" (EQ1c): UMA caixa — marcada, a pessoa atende em todas
 * as unidades dela. "Escolher em quais unidades atende" abre a lista.
 * D9 da 32ª (decisão do Claude, 26/11; a regra é a do Heitor, 8ª: "as que
 * estiverem marcadas ficam disponiveis"): a caixa fechada só acompanha a
 * mudança das unidades quando quem edita a ligou agora (ou pediu "Atender em
 * todas as unidades dela"); na edição de quem já atende, a lista dela fica, e a
 * unidade acrescentada aparece desmarcada na lista (`estadoDoAtende`).
 */
export function useAtendeDoMembro(inicial: string[], unidadesDela: string[]) {
  const mesmas = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))
  const [ligadoNaCaixa, setLigado] = useState(inicial.length > 0)
  // Aberta de saída só quando a lista de hoje não é "as unidades dela".
  const [abertoPedido, setAberto] = useState(inicial.length > 0 && !mesmas(inicial, unidadesDela))
  const [marcadas, setMarcadas] = useState<string[]>(inicial)
  // Quem ainda não atende (o cadastro novo) acompanha as unidades ao ligar a caixa.
  const [acompanha, setAcompanha] = useState(inicial.length === 0)
  // O "Atende" só vale nas unidades da pessoa (o Heitor, 2026-11-23): tirada
  // uma unidade dela no campo "Unidades", a marca ali sai do que se envia.
  const e = estadoDoAtende({ ligado: ligadoNaCaixa, aberto: abertoPedido, acompanha, marcadas, unidadesDela })
  const aberto = e.listaAVista
  // A lista que se abriu sozinha (a unidade nova) parte do que se envia.
  const marcadasNaTela = aberto && !abertoPedido ? e.efetivo : marcadas
  // Mexer na lista (a aberta sozinha também) a deixa aberta: ela não fecha no meio do clique.
  const marcarNaLista = (v: string[]) => { setMarcadas(v); setAberto(true) }
  return {
    ligado: e.caixa || (ligadoNaCaixa && acompanha), setLigado,
    aberto, setAberto, marcadas: marcadasNaTela, setMarcadas, marcarNaLista, efetivo: e.efetivo, setAcompanha,
  }
}

export function AtendeDoMembro({ estado, unidades, unidadesDela, editaveis = null, id = 'atende' }: {
  estado: ReturnType<typeof useAtendeDoMembro>
  /** Todas as unidades ativas da rede (para os nomes). */
  unidades: Unidade[]
  /** As unidades da pessoa (a rede inteira: todas as ativas). */
  unidadesDela: string[]
  /** As que quem edita pode mudar; null = todas. */
  editaveis?: string[] | null
  id?: string
}) {
  const { ligado, setLigado, aberto, setAberto, marcadas, setMarcadas, marcarNaLista, efetivo, setAcompanha } = estado
  // A lista: só as unidades DELA, as escolhidas no campo "Unidades" ("A rede
  // inteira" = todas) — o "Atende" só vale nelas (o Heitor, 2026-11-23).
  const naLista = unidades.filter(u => unidadesDela.includes(u.id))
  const podeEscolher = naLista.length > 1
  const pode = (u: string) => editaveis === null || editaveis.includes(u)
  const caixaTravada = editaveis !== null && !unidadesDela.some(pode)

  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="hidden" name="_atendeEm" value="1" />
      <input type="hidden" name="atendeEm" value={efetivo.join(',')} />
      {aberto && podeEscolher ? (
        <AtendeNasUnidades id={id} unidades={naLista} marcadas={marcadas} aoMudar={marcarNaLista} editaveis={editaveis} semCampos />
      ) : (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: caixaTravada ? 'default' : 'pointer' }}>
          <input type="checkbox" checked={ligado} disabled={caixaTravada}
            onChange={e => { setLigado(e.target.checked); setAcompanha(e.target.checked); setMarcadas(e.target.checked ? unidadesDela : []) }}
            style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} />
          <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
            Atende clientes (aparece na agenda como profissional e gera comissão)
          </span>
        </label>
      )}
      {podeEscolher && (
        <button type="button" className="btn-ghost" data-escolher-onde-atende aria-expanded={aberto}
          onClick={() => {
            // "Atender em todas as unidades dela": a caixa volta e acompanha as unidades.
            if (aberto) { setLigado(efetivo.length > 0); setAcompanha(true); setAberto(false); return }
            setMarcadas(efetivo)
            setAberto(true)
          }}
          style={{ alignSelf: 'flex-start', padding: '2px 0', color: 'var(--text-muted)', fontSize: 'var(--text-2xs)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {aberto ? 'Atender em todas as unidades dela' : 'Escolher em quais unidades atende'}
          <ChevronDown size={12} aria-hidden style={{ transform: aberto ? 'rotate(180deg)' : 'none' }} />
        </button>
      )}
    </div>
  )
}
