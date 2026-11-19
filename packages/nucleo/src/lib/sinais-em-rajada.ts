/**
 * Junta uma rajada de sinais numa chamada só (19/11, ao Heitor: "o inbox que
 * pode ter muita atualização e vai atualizar toda rede").
 *
 * O primeiro sinal abre a janela; a chamada sai quando ela fecha, e cobre
 * todos os sinais que chegaram no meio (quem é chamado relê tudo do servidor).
 * O sinal que chega depois abre outra janela — então nada se perde, e uma
 * rajada sem fim chama uma vez por janela, em vez de adiar para sempre.
 */
export function juntarEmRajada(fn: () => void, esperaMs: number): { chamar: () => void; cancelar: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    chamar() {
      if (esperaMs <= 0) { fn(); return }
      if (timer) return
      timer = setTimeout(() => { timer = null; fn() }, esperaMs)
    },
    cancelar() {
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}
