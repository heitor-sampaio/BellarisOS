import { Check, Minus } from 'lucide-react'
import { FUNCIONALIDADES, LIMITES, type RecursosDoPlano } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * O que o plano da rede inclui, do lado da CLÍNICA (Configurações →
 * Assinatura): cada funcionalidade do catálogo, dentro ou fora, e o uso de
 * cada limite ("2 de 3"). Sem plano, tudo liberado. Mudar de plano é com o
 * BellarisOS — a tela não oferece nada além de mostrar.
 */
export function PlanoDaRede({ recursos, uso }: {
  recursos: RecursosDoPlano | null
  uso: Record<'unidades' | 'membros' | 'whatsapp', number>
}) {
  const grupos = [...new Set(FUNCIONALIDADES.map(f => f.grupo))]
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="overline">O que o seu plano inclui</p>
      {recursos === null ? (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>Todas as funcionalidades, sem limite.</p>
      ) : (
        <>
          <ul className="plano-da-rede-limites">
            {LIMITES.map(l => {
              const limite = recursos.limites[l.chave]
              return (
                <li key={l.chave}>
                  {limite === null ? `${l.rotulo}: ${uso[l.chave]} · ilimitado` : `${l.rotulo}: ${uso[l.chave]} de ${limite}`}
                </li>
              )
            })}
          </ul>
          <div className="plano-da-rede-grupos">
            {grupos.map(g => (
              <div key={g}>
                <p className="overline" style={{ marginBottom: 6 }}>{g}</p>
                <ul className="plano-da-rede-lista">
                  {FUNCIONALIDADES.filter(f => f.grupo === g).map(f => {
                    const dentro = recursos.funcionalidades.includes(f.chave)
                    return (
                      <li key={f.chave} data-dentro={dentro}>
                        {dentro ? <Check size={14} aria-hidden /> : <Minus size={14} aria-hidden />}
                        <span>{f.rotulo}</span>
                        <span className="plano-da-rede-estado">
                          {dentro ? ('emBreve' in f && f.emBreve ? 'Incluído · em breve' : 'Incluído') : 'Fora do plano'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
            Para incluir uma funcionalidade ou ampliar um limite, fale com o BellarisOS pela Ajuda.
          </p>
        </>
      )}
    </section>
  )
}
