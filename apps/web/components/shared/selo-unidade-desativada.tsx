import { SELO_DESATIVADA } from '@/lib/unidades/o-que-fica'

/**
 * O selo da unidade desativada (F72; H6 em `plataforma.md`): onde a tela
 * mostra uma unidade que saiu do ar mas ainda tem o que ficou (agenda,
 * estoque, a receber, comissão), ela diz que é — o número continua, o selo
 * explica de onde ele vem.
 */
export function SeloUnidadeDesativada() {
  return <span className="chip chip-warning" data-selo-unidade-desativada>{SELO_DESATIVADA}</span>
}
