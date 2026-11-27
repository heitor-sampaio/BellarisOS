/**
 * A edição do mapa de injetáveis que ainda não foi salva (D9 da 37ª simulação;
 * PT-15: "a edição não salva não entra, e a tela diz"). O retrato da ficha sai
 * do planejamento GRAVADO: o ponto posto sem salvar sumia do retrato calado. O
 * mapa aberto marca aqui o que não salvou, e o "Finalizar" do atendimento lê e
 * oferece salvar ali mesmo — o retorno da ação, não uma frase a mais na tela.
 *
 * Um registro por página (no navegador): quem marca é o `MapaInjetavel`, que
 * desmarca ao salvar e ao sair da tela.
 */

export interface EdicaoNaoSalva {
  mapId: string
  /** O nome do planejamento, para a tela dizer qual. */
  nome:  string
  /** Salva o planejamento como está na tela. */
  salvar: () => Promise<{ error?: string }>
}

const edicoes = new Map<string, EdicaoNaoSalva>()
const ouvintes = new Set<() => void>()
let retrato: readonly EdicaoNaoSalva[] = []
const NENHUMA: readonly EdicaoNaoSalva[] = []

/** Os pontos na tela diferem dos gravados (posto, mexido ou tirado). */
export function temEdicaoNaoSalva(salvos: readonly unknown[], naTela: readonly unknown[]): boolean {
  return JSON.stringify(salvos ?? []) !== JSON.stringify(naTela ?? [])
}

/** O mapa marca (ou, com `null`, desmarca) a sua edição não salva. */
export function marcarEdicaoNaoSalva(mapId: string, e: Omit<EdicaoNaoSalva, 'mapId'> | null): void {
  if (e) edicoes.set(mapId, { mapId, ...e })
  else if (!edicoes.delete(mapId)) return
  retrato = edicoes.size ? [...edicoes.values()] : NENHUMA
  for (const o of ouvintes) o()
}

/** As edições não salvas de agora — o mesmo retrato enquanto nada muda (`useSyncExternalStore`). */
export function edicoesNaoSalvas(): readonly EdicaoNaoSalva[] {
  return retrato
}

/** O retrato do servidor: nenhuma. */
export function semEdicoesNaoSalvas(): readonly EdicaoNaoSalva[] {
  return NENHUMA
}

export function assinarEdicoesNaoSalvas(fn: () => void): () => void {
  ouvintes.add(fn)
  return () => { ouvintes.delete(fn) }
}
