import type { CRMFunnel, CRMStage } from '@/lib/crm'

/**
 * Opções de um `<select>` de etapa, agrupadas por funil.
 *
 * É assim que se move um lead de funil: escolher uma etapa de outro grupo. Com
 * um funil só, o agrupamento é ruído — nesse caso a lista sai plana, igual ao
 * que existia antes.
 */
export function StageOptions({
  funnels, stages,
}: {
  funnels: Pick<CRMFunnel, 'id' | 'name'>[]
  stages:  Pick<CRMStage, 'id' | 'funnel_id' | 'name'>[]
}) {
  if (funnels.length <= 1) {
    return <>{stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</>
  }

  return (
    <>
      {funnels.map(f => {
        const doFunil = stages.filter(s => s.funnel_id === f.id)
        if (doFunil.length === 0) return null
        return (
          <optgroup key={f.id} label={f.name}>
            {doFunil.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </optgroup>
        )
      })}
    </>
  )
}
