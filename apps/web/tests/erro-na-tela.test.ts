import { describe, it, expect } from 'vitest'
import { erroParaTela } from '@/lib/erro-na-tela'
import { semAcesso } from '@/lib/sem-acesso'

// O que o Next entrega ao navegador, em produção, quando uma action lança.
function erroDoServidorEmProducao(digest = '123456') {
  const e = new Error('An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.') as Error & { digest: string }
  e.digest = digest
  return e
}

describe('erroParaTela', () => {
  it('erro do servidor vira o texto da tela, nunca o aviso do Next', () => {
    expect(erroParaTela(erroDoServidorEmProducao(), 'Não foi possível salvar.')).toBe('Não foi possível salvar.')
  })

  it('falta de permissão é reconhecida pelo digest, mesmo com a mensagem trocada', () => {
    const e = erroDoServidorEmProducao(semAcesso().digest)
    expect(erroParaTela(e, 'Não foi possível salvar.')).toBe('Seu cargo não libera esta ação.')
  })

  it('erro do próprio navegador mantém a mensagem', () => {
    expect(erroParaTela(new Error('Arquivo grande demais.'), 'x')).toBe('Arquivo grande demais.')
  })

  it('o que não é Error vira o texto da tela', () => {
    expect(erroParaTela('falhou', 'Não foi possível carregar.')).toBe('Não foi possível carregar.')
  })
})

/**
 * A página aberta ANTES de um deploy chama a action pelo id do build velho, e
 * o Next lança `UnrecognizedActionError` no navegador (2026-10-08: o "Conectar
 * por aqui" girava para sempre). A tela que pega o erro precisa recarregar a
 * página — o script do layout só vê o que escapa sem tratamento.
 */
describe('erroParaTela com a página de um deploy anterior', () => {
  function acaoDoBuildVelho() {
    const e = new Error('Server Action "406fa8fcdfd806dba77e14e42d6928a4644014d707" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action')
    e.name = 'UnrecognizedActionError'
    return e
  }
  function comJanela(agora: number, ultimaRecarga: string | null) {
    const recargas: number[] = []
    const guardado = new Map<string, string>(ultimaRecarga ? [['bellaris:recarga-de-versao', ultimaRecarga]] : [])
    const janela = {
      location: { reload: () => { recargas.push(agora) } },
      sessionStorage: {
        getItem: (k: string) => guardado.get(k) ?? null,
        setItem: (k: string, v: string) => { guardado.set(k, v) },
      },
    }
    ;(globalThis as { window?: unknown }).window = janela
    return { recargas, guardado, desfazer: () => { delete (globalThis as { window?: unknown }).window } }
  }

  it('recarrega a página e diz que o sistema foi atualizado', () => {
    const j = comJanela(Date.now(), null)
    try {
      expect(erroParaTela(acaoDoBuildVelho(), 'Não foi possível consultar a conexão.'))
        .toBe('O BellarisOS foi atualizado. Recarregando a página…')
      expect(j.recargas).toHaveLength(1)
    } finally { j.desfazer() }
  })

  it('não entra em laço: recarregou há pouco, só avisa', () => {
    const agora = Date.now()
    const j = comJanela(agora, String(agora - 5_000))
    try {
      expect(erroParaTela(acaoDoBuildVelho(), 'x')).toBe('O BellarisOS foi atualizado. Recarregue a página.')
      expect(j.recargas).toHaveLength(0)
    } finally { j.desfazer() }
  })
})
