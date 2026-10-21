'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { HORARIO_PADRAO, type Horario, type Intervalo } from '@/lib/agenda/horario'

/**
 * O horário de funcionamento (2026-10-21): da unidade (Configurações →
 * Unidades) e do profissional (Equipe). Uma linha por dia — fechado, ou um
 * período com pausa opcional. Vai ao servidor num campo oculto (JSON), que a
 * action confere (`normalizarHorario`); vazio = sem cadastro (a unidade usa o
 * padrão; o profissional segue a unidade).
 */

const DIAS: { chave: string; nome: string }[] = [
  { chave: '1', nome: 'Segunda' }, { chave: '2', nome: 'Terça' }, { chave: '3', nome: 'Quarta' },
  { chave: '4', nome: 'Quinta' }, { chave: '5', nome: 'Sexta' }, { chave: '6', nome: 'Sábado' }, { chave: '0', nome: 'Domingo' },
]

const copiar = (h: Horario): Record<string, Intervalo[]> =>
  Object.fromEntries(DIAS.map(d => [d.chave, (h.dias[d.chave] ?? []).map(i => ({ ...i }))]))

export function EditorDeHorario({ nome, valor, seguir }: {
  /** O nome do campo oculto (o que a action lê). */
  nome:    string
  valor:   Horario | null
  /** Oferece "segue o horário da unidade" (o profissional): marcado = sem cadastro próprio. */
  seguir?: string
}) {
  const [segue, setSegue] = useState(!!seguir && !valor)
  const [dias, setDias]   = useState<Record<string, Intervalo[]>>(() => copiar(valor ?? HORARIO_PADRAO))

  const mudar = (dia: string, lista: Intervalo[]) => setDias(prev => ({ ...prev, [dia]: lista }))
  const rotulo = { fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input type="hidden" name={nome} value={segue ? '' : JSON.stringify({ dias })} />

      {seguir && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={segue} onChange={e => setSegue(e.target.checked)} />
          {seguir}
        </label>
      )}

      {!segue && DIAS.map(({ chave, nome: nomeDoDia }) => {
        const lista = dias[chave] ?? []
        const aberto = lista.length > 0
        return (
          <div key={chave} data-dia={chave} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 'var(--altura-controle)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, width: 120, cursor: 'pointer', ...rotulo }}>
              <input type="checkbox" checked={aberto} aria-label={`${nomeDoDia} abre`}
                onChange={e => mudar(chave, e.target.checked ? [{ de: '08:00', ate: '20:00' }] : [])} />
              {nomeDoDia}
            </label>
            {!aberto && <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>Fechado</span>}
            {lista.map((i, n) => (
              <span key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {n > 0 && <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>e</span>}
                <input type="time" className="field" style={{ width: 110 }} value={i.de} aria-label={`${nomeDoDia}, abre às`}
                  onChange={e => mudar(chave, lista.map((x, k) => k === n ? { ...x, de: e.target.value } : x))} />
                <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>às</span>
                <input type="time" className="field" style={{ width: 110 }} value={i.ate} aria-label={`${nomeDoDia}, fecha às`}
                  onChange={e => mudar(chave, lista.map((x, k) => k === n ? { ...x, ate: e.target.value } : x))} />
                {n > 0 && (
                  <button type="button" className="btn-ghost" aria-label={`Tirar a pausa de ${nomeDoDia}`} style={{ padding: '4px 6px' }}
                    onClick={() => mudar(chave, [{ de: lista[0]!.de, ate: i.ate }])}>
                    <X size={13} />
                  </button>
                )}
              </span>
            ))}
            {aberto && lista.length === 1 && (
              <button type="button" className="btn-ghost" style={{ gap: 4, fontSize: 'var(--text-xs-sz)' }}
                onClick={() => mudar(chave, [{ de: lista[0]!.de, ate: '12:00' }, { de: '13:00', ate: lista[0]!.ate }])}>
                <Plus size={12} /> Pausa
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
