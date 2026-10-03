import { describe, it, expect } from 'vitest'
import { situacaoDepois, contextoDoNavegador, tipoDaImagem, ehSituacao } from '@/lib/suporte/chamados-regras'

describe('situacaoDepois', () => {
  it('a clínica escrevendo abre (e reabre o resolvido)', () => {
    expect(situacaoDepois('aguardando_clinica', 'usuario')).toBe('aberto')
    expect(situacaoDepois('resolvido', 'usuario')).toBe('aberto')
  })

  it('a resposta do suporte espera a clínica, salvo escolha', () => {
    expect(situacaoDepois('aberto', 'suporte')).toBe('aguardando_clinica')
    expect(situacaoDepois('aberto', 'suporte', { escolhida: 'resolvido' })).toBe('resolvido')
  })

  it('nota interna não mexe na situação', () => {
    expect(situacaoDepois('aberto', 'suporte', { interna: true })).toBe('aberto')
    expect(situacaoDepois('em_andamento', 'suporte', { interna: true })).toBe('em_andamento')
  })
})

describe('contextoDoNavegador', () => {
  it('fica só com os campos conhecidos, em texto e curtos', () => {
    const c = contextoDoNavegador({ pagina: '/admin/agenda', tela: '1280×720', navegador: 'x'.repeat(1000), tenantId: 'outra', usuario: 'forjado' })
    expect(c).toEqual({ pagina: '/admin/agenda', tela: '1280×720', navegador: 'x'.repeat(300) })
  })

  it('lixo vira nulo', () => {
    expect(contextoDoNavegador(null)).toEqual({ pagina: null, tela: null, navegador: null })
    expect(contextoDoNavegador({ pagina: 42, tela: '  ' })).toEqual({ pagina: null, tela: null, navegador: null })
  })
})

describe('tipoDaImagem', () => {
  it('reconhece PNG e JPEG pelo cabeçalho', () => {
    expect(tipoDaImagem(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png')
    expect(tipoDaImagem(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg')
  })

  it('recusa o resto, mesmo com nome de imagem', () => {
    expect(tipoDaImagem(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull()
    expect(tipoDaImagem(new TextEncoder().encode('%PDF-1.7'))).toBeNull()
  })
})

describe('ehSituacao', () => {
  it('só as quatro', () => {
    expect(ehSituacao('resolvido')).toBe(true)
    expect(ehSituacao('fechado')).toBe(false)
    expect(ehSituacao(undefined)).toBe(false)
  })
})
