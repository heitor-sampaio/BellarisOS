import { ehSemAcesso } from '@/lib/sem-acesso'
import { ehLimiteDoPlano } from '@estetica-os/nucleo/lib/planos/limite-digest'

/**
 * O texto a mostrar quando uma action LANÇOU (em vez de devolver `{ error }`).
 *
 * `e.message` não serve: em produção o Next troca a mensagem de todo erro que
 * vem do servidor por um aviso genérico, em inglês, sobre "Server Components"
 * — e no dev ela é o detalhe técnico da consulta, que também não diz nada a
 * quem está atendendo. Erro do servidor chega com `digest`; esse vira o texto
 * da própria tela. Falta de permissão é reconhecida pelo digest de
 * `semAcesso()` e ganha o texto dela.
 *
 * Mensagem que a pessoa PRECISA ler (regra de negócio) não passa por aqui: a
 * action a devolve em `{ error }`.
 */
export function erroParaTela(e: unknown, padrao: string): string {
  if (ehActionDeOutroDeploy(e)) {
    return recarregarUmaVez()
      ? 'O BellarisOS foi atualizado. Recarregando a página…'
      : 'O BellarisOS foi atualizado. Recarregue a página.'
  }
  if (e && typeof e === 'object' && ehSemAcesso(e as { message?: string; digest?: string })) {
    return 'Seu cargo não libera esta ação.'
  }
  if (e && typeof e === 'object' && ehLimiteDoPlano(e as { digest?: string })) {
    return 'O plano da sua rede chegou ao limite. Para ampliar, fale com o BellarisOS.'
  }
  if (e instanceof Error && !('digest' in e) && e.message && !/server components/i.test(e.message)) {
    return e.message
  }
  return padrao
}

/**
 * A página foi aberta ANTES de um deploy: os ids das actions mudam a cada
 * build, e o Next lança `UnrecognizedActionError` no navegador (2026-10-08: o
 * "Conectar por aqui" girava para sempre). O script do layout recarrega o que
 * escapa sem tratamento; quem PEGA o erro passa por aqui.
 */
function ehActionDeOutroDeploy(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  return e.name === 'UnrecognizedActionError'
    || (/Server Action/.test(e.message) && /was not found on the server/.test(e.message))
}

const CHAVE_DA_RECARGA = 'bellaris:recarga-de-versao'
/** Uma recarga a cada 30 s no máximo: se o build novo ainda falha, não vira laço. */
const INTERVALO_DA_RECARGA = 30_000

function recarregarUmaVez(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const ultima = Number(window.sessionStorage.getItem(CHAVE_DA_RECARGA) ?? 0)
    if (Date.now() - ultima < INTERVALO_DA_RECARGA) return false
    window.sessionStorage.setItem(CHAVE_DA_RECARGA, String(Date.now()))
  } catch {
    // Sem sessionStorage (aba privada, bloqueio): recarrega mesmo assim — o
    // `_reloading` do layout e a página nova seguram a repetição.
  }
  window.location.reload()
  return true
}
