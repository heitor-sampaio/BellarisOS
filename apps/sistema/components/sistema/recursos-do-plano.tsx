'use client'

import { useState } from 'react'
import {
  FUNCIONALIDADES, LIMITES, LIMITE_MAXIMO, ADICIONAIS, adicionalCabeNoPlano,
  type ChaveDeFuncionalidade, type ChaveDeAdicional, type RecursosDoPlano,
} from '@estetica-os/nucleo/lib/planos/recursos'
import { centavosDe, campoDeReais } from '@estetica-os/nucleo/lib/redes/valor'

/**
 * O que o plano inclui (2026-10-06): uma caixa por funcionalidade do catálogo,
 * em grupos, e um slider de 1 a 10 por limite, com "ilimitado" ao lado. O
 * catálogo é o de `lib/planos/recursos.ts` — a lista não se escreve aqui.
 *
 * Embaixo, os ADICIONAIS à venda (2026-10-07): o plano oferece, com o preço,
 * a conexão de WhatsApp além do limite e o Copilot avulso. A oferta que deixa
 * de caber (o WhatsApp ficou ilimitado, o Copilot entrou no plano) sai sozinha.
 */
export function RecursosDoPlanoCampos({ valor, mudar: mudarCru }: { valor: RecursosDoPlano; mudar: (r: RecursosDoPlano) => void }) {
  // O texto de cada preço, como a pessoa digita ("49,90").
  const [precos, setPrecos] = useState<Record<string, string>>(() => Object.fromEntries(
    ADICIONAIS.map(a => [a.chave, campoDeReais(valor.adicionais?.[a.chave]?.valor_centavos ?? null)])))

  function mudar(r: RecursosDoPlano) {
    const adicionais = { ...(r.adicionais ?? {}) }
    for (const a of ADICIONAIS) if (adicionais[a.chave] && !adicionalCabeNoPlano(r, a.chave)) delete adicionais[a.chave]
    mudarCru({ ...r, adicionais })
  }

  function oferecer(chave: ChaveDeAdicional, sim: boolean) {
    const adicionais = { ...(valor.adicionais ?? {}) }
    if (sim) adicionais[chave] = { valor_centavos: centavosDe(precos[chave]) ?? 0 }
    else delete adicionais[chave]
    mudar({ ...valor, adicionais })
  }

  function mudarPreco(chave: ChaveDeAdicional, texto: string) {
    setPrecos(p => ({ ...p, [chave]: texto }))
    if (valor.adicionais?.[chave]) mudar({ ...valor, adicionais: { ...valor.adicionais, [chave]: { valor_centavos: centavosDe(texto) ?? 0 } } })
  }

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

      <fieldset className="plano-grupo">
        <legend className="overline">Adicionais à venda</legend>
        <p className="suporte-texto-fraco">A rede contrata além do plano, e o valor soma na mensalidade. Quem já contratou mantém o preço da época.</p>
        {ADICIONAIS.map(a => {
          const cabe = adicionalCabeNoPlano(valor, a.chave)
          const oferecido = !!valor.adicionais?.[a.chave]
          return (
            <div key={a.chave} className="plano-adicional">
              <label className="ajuda-check">
                <input type="checkbox" checked={oferecido} disabled={!cabe} aria-label={`Oferecer: ${a.rotulo}`}
                  onChange={e => oferecer(a.chave, e.target.checked)} />
                <span>{a.rotulo}{'emBreve' in a && a.emBreve ? <span className="plano-em-breve"> · em breve</span> : null}</span>
              </label>
              {cabe ? (
                <label className="plano-adicional-preco">
                  <span className="suporte-texto-fraco">R$</span>
                  <input className="field" inputMode="decimal" placeholder="0,00" value={precos[a.chave] ?? ''} disabled={!oferecido}
                    aria-label={`Preço por mês: ${a.rotulo}`} onChange={e => mudarPreco(a.chave, e.target.value)} />
                  <span className="suporte-texto-fraco">{a.chave === 'whatsapp' ? 'por conexão, por mês' : 'por mês'}</span>
                </label>
              ) : (
                <span className="suporte-texto-fraco">
                  {a.chave === 'whatsapp' ? 'O plano já tem números de WhatsApp ilimitados.' : 'O plano já inclui o Copilot.'}
                </span>
              )}
            </div>
          )
        })}
      </fieldset>
    </div>
  )
}
