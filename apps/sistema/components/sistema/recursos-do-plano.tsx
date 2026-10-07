'use client'

import {
  FUNCIONALIDADES, LIMITES, LIMITE_MAXIMO,
  type ChaveDeFuncionalidade, type RecursosDoPlano,
} from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * O que o plano inclui (2026-10-06): uma caixa por funcionalidade do catálogo,
 * em grupos, e um slider de 1 a 10 por limite, com "ilimitado" ao lado. O
 * catálogo é o de `lib/planos/recursos.ts` — a lista não se escreve aqui.
 */
export function RecursosDoPlanoCampos({ valor, mudar }: { valor: RecursosDoPlano; mudar: (r: RecursosDoPlano) => void }) {
  const grupos = [...new Set(FUNCIONALIDADES.map(f => f.grupo))]
  const marcadas = new Set<string>(valor.funcionalidades)

  function alternar(chave: ChaveDeFuncionalidade, ligada: boolean) {
    const nova = new Set(marcadas)
    if (ligada) nova.add(chave); else nova.delete(chave)
    mudar({ ...valor, funcionalidades: FUNCIONALIDADES.map(f => f.chave).filter(c => nova.has(c)) })
  }

  return (
    <div className="plano-recursos">
      <div className="plano-recursos-grupos">
        {grupos.map(g => (
          <fieldset key={g} className="plano-grupo">
            <legend className="overline">{g}</legend>
            {FUNCIONALIDADES.filter(f => f.grupo === g).map(f => (
              <label key={f.chave} className="ajuda-check">
                <input type="checkbox" checked={marcadas.has(f.chave)} onChange={e => alternar(f.chave, e.target.checked)} />
                <span>{f.rotulo}{'emBreve' in f && f.emBreve ? <span className="plano-em-breve"> · em breve</span> : null}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      <fieldset className="plano-grupo">
        <legend className="overline">Limites</legend>
        {LIMITES.map(l => {
          const atual = valor.limites[l.chave]
          const ilimitado = atual === null
          return (
            <div key={l.chave} className="plano-limite">
              <span className="field-label">{l.rotulo}</span>
              <input
                type="range" min={1} max={LIMITE_MAXIMO} step={1} aria-label={l.rotulo}
                value={atual ?? LIMITE_MAXIMO} disabled={ilimitado}
                onChange={e => mudar({ ...valor, limites: { ...valor.limites, [l.chave]: Number(e.target.value) } })}
              />
              <span className="plano-limite-valor">{ilimitado ? '∞' : atual}</span>
              <label className="ajuda-check">
                <input
                  type="checkbox" checked={ilimitado} aria-label={`${l.rotulo}: ilimitado`}
                  onChange={e => mudar({ ...valor, limites: { ...valor.limites, [l.chave]: e.target.checked ? null : 1 } })}
                />
                <span>Ilimitado</span>
              </label>
            </div>
          )
        })}
      </fieldset>
    </div>
  )
}
