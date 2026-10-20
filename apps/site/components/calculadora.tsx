'use client'

import { useId, useMemo, useState } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import { reaisDe } from '@estetica-os/nucleo/lib/redes/valor'
import type { PlanoDoSite } from '@/lib/planos'
import { recomendar, escolhasDaCalculadora } from '@/lib/calculadora'

/**
 * A calculadora de plano (2026-10-19, pedido do Heitor): unidades, equipe,
 * números de WhatsApp e o que muda de plano para plano (hoje, o Copilot) → o
 * plano de menor total que cabe, com a conta (lib/calculadora.ts). Nasce com
 * a clínica de uma unidade já calculada: sem JavaScript, a resposta está lá.
 */
export function Calculadora({ planos, comecar }: { planos: PlanoDoSite[]; comecar: string }) {
  const [unidades, setUnidades] = useState(1)
  const [pessoas, setPessoas] = useState(5)
  const [whatsapp, setWhatsapp] = useState(1)
  const [quer, setQuer] = useState<string[]>([])
  const escolhas = useMemo(() => escolhasDaCalculadora(planos), [planos])
  // Todos os planos com equipe ilimitada: a pergunta fica, e a página diz.
  const equipeLivre = planos.every(p => p.recursos.limites.membros === null)

  const { indicado, todos } = recomendar(planos, { unidades, pessoas, whatsapp, funcionalidades: quer })
  const outros = todos.filter(o => o.plano !== indicado?.plano)

  return (
    <div id="calculadora" className="site-calc" data-revelar>
      <div className="site-calc-perguntas">
        <span className="site-overline">✦ Calculadora</span>
        <h3 className="site-h3">Qual plano é o da sua clínica?</h3>
        <p className="site-muted" style={{ fontSize: 'var(--site-pequeno)' }}>
          Diga o tamanho da clínica: a conta já soma o que for preciso contratar à parte.
        </p>
        <Contador rotulo="Unidades" valor={unidades} minimo={1} maximo={50} mudar={setUnidades} />
        <Contador rotulo="Pessoas na equipe" valor={pessoas} minimo={1} maximo={500} mudar={setPessoas}
          dica={equipeLivre ? 'Todos os planos têm equipe ilimitada.' : undefined} />
        <Contador rotulo="Números de WhatsApp" valor={whatsapp} minimo={1} maximo={30} mudar={setWhatsapp} />
        {escolhas.map(e => (
          <label key={e.chave} className="site-calc-opcao">
            <input type="checkbox" checked={quer.includes(e.chave)}
              onChange={ev => setQuer(q => (ev.target.checked ? [...q, e.chave] : q.filter(c => c !== e.chave)))} />
            <span>Quero o {e.rotulo}</span>
          </label>
        ))}
      </div>

      <div className="site-calc-resposta" aria-live="polite">
        {indicado ? (
          <div key={`${indicado.plano}-${indicado.totalCentavos}`} className="site-calc-indicado" data-indicado>
            <span className="site-calc-rotulo">Indicado para você</span>
            <strong className="site-calc-plano" data-plano>{indicado.plano}</strong>
            <p className="site-calc-total"><span data-total>{reaisDe(indicado.totalCentavos)}</span><small>/mês</small></p>
            {indicado.itens.length > 1 && (
              <ul className="site-calc-conta">
                {indicado.itens.map(i => (
                  <li key={i.rotulo}><span>{i.rotulo}</span><span>{reaisDe(i.centavos)}</span></li>
                ))}
              </ul>
            )}
            <a className="site-botao site-botao-claro" href={comecar}>Começar grátis</a>
          </div>
        ) : (
          <div className="site-calc-nenhum" data-nenhum>
            <strong>Nenhum plano de hoje cobre tudo isso de uma vez.</strong>
            <p>Comece o teste grátis, com tudo liberado por 14 dias, e fale com a gente pela Ajuda, dentro do sistema.</p>
            <a className="site-botao site-botao-primario" href={comecar}>Começar grátis</a>
          </div>
        )}

        {outros.length > 0 && (
          <ul className="site-calc-outros" aria-label="Os outros planos">
            {outros.map(o => (
              <li key={o.plano}>
                <span className="site-calc-outro-nome">{o.plano}</span>
                {o.cabe
                  ? <span>{reaisDe(o.totalCentavos)}/mês</span>
                  : <span className="site-muted">Não cabe: {o.motivo.toLowerCase()}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Contador({ rotulo, valor, minimo, maximo, mudar, dica }: {
  rotulo: string; valor: number; minimo: number; maximo: number; mudar: (n: number) => void; dica?: string
}) {
  const id = useId()
  // O que se digita fica como texto até sair do campo: apagar para digitar
  // outro número não pode virar 1 no meio do caminho.
  const [texto, setTexto] = useState<string | null>(null)
  const limitar = (n: number) => Math.min(maximo, Math.max(minimo, Number.isFinite(n) ? Math.round(n) : minimo))

  return (
    <div className="site-calc-campo">
      <label htmlFor={id}>{rotulo}</label>
      <div className="site-calc-contador">
        <button type="button" aria-label={`Menos: ${rotulo.toLowerCase()}`} disabled={valor <= minimo}
          onClick={() => { setTexto(null); mudar(limitar(valor - 1)) }}><Minus size={16} aria-hidden="true" /></button>
        <input id={id} type="number" inputMode="numeric" min={minimo} max={maximo}
          value={texto ?? String(valor)}
          onChange={e => {
            setTexto(e.target.value)
            const n = parseInt(e.target.value, 10)
            if (!Number.isNaN(n)) mudar(limitar(n))
          }}
          onBlur={() => setTexto(null)} />
        <button type="button" aria-label={`Mais: ${rotulo.toLowerCase()}`} disabled={valor >= maximo}
          onClick={() => { setTexto(null); mudar(limitar(valor + 1)) }}><Plus size={16} aria-hidden="true" /></button>
      </div>
      {dica && <span className="site-calc-dica"><Check size={13} aria-hidden="true" /> {dica}</span>}
    </div>
  )
}
