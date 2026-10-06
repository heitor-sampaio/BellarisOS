import { rotuloDaRede } from '@estetica-os/nucleo/lib/redes/situacao'

/** O selo da situação de uma rede (desligada vence a assinatura). */
export function SituacaoDaRede({ ativa, planStatus }: { ativa: boolean; planStatus: string | null }) {
  return (
    <span className="sistema-situacao" data-situacao={ativa ? planStatus ?? '' : 'desligada'}>
      {rotuloDaRede({ ativa, planStatus })}
    </span>
  )
}
