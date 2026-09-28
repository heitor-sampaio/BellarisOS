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
