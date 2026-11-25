import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

/**
 * D5 da 30ª (plataforma:UN-13; CLAUDE.md §6: "Redirecionamento por abrangência
 * leva o motivo"; princípio 7; Decisão do Claude 2, 25/11). O endereço da
 * unidade desativada dava "Página não encontrada": sem aviso para quem tem
 * outras unidades, e sem saída para quem só tinha ela (o login também levava a
 * ela). Agora:
 * - quem tem outras unidades vai à principal (a primeira ATIVA das dela), com
 *   o aviso "A unidade X foi desativada";
 * - quem tem "A rede inteira" vai ao portal da rede, com o aviso;
 * - quem só tinha ela cai numa tela que diz "A unidade X foi desativada. Fale
 *   com quem administra a rede.", com "Sair";
 * - endereço que não existe segue 404.
 */

const RAIZ = path.join(__dirname, '..')
const fonte = (...p: string[]) => readFileSync(path.join(RAIZ, ...p), 'utf8')

const todas = [
  { id: 'bM', slug: 'manaus', name: 'Jacarandá Manaus', is_active: false },
  { id: 'bC', slug: 'caruaru', name: 'Jacarandá Caruaru', is_active: true },
  { id: 'bN', slug: 'noronha', name: 'Jacarandá Noronha', is_active: true },
  { id: 'bV', slug: 'velha', name: 'Jacarandá Velha', is_active: false },
]

describe('a saída do endereço de uma unidade', () => {
  it('a unidade que não existe segue 404', async () => {
    const { saidaDoEndereco } = await import('@/lib/unidades/desativada-no-endereco')
    expect(saidaDoEndereco({ slug: 'nada', todas, unidades: ['bC'] })).toEqual({ tipo: 'nao-existe' })
    expect(saidaDoEndereco({ slug: 'nada', todas, unidades: null })).toEqual({ tipo: 'nao-existe' })
  })

  it('a ativa ao alcance abre', async () => {
    const { saidaDoEndereco } = await import('@/lib/unidades/desativada-no-endereco')
    expect(saidaDoEndereco({ slug: 'caruaru', todas, unidades: ['bC'] })).toEqual({ tipo: 'abre' })
    expect(saidaDoEndereco({ slug: 'caruaru', todas, unidades: null })).toEqual({ tipo: 'abre' })
  })

  it('a desativada, a quem tem outras: a principal ativa, com o aviso e o nome dela', async () => {
    const { saidaDoEndereco } = await import('@/lib/unidades/desativada-no-endereco')
    expect(saidaDoEndereco({ slug: 'manaus', todas, unidades: ['bM', 'bN'] }))
      .toEqual({ tipo: 'redirecionar', para: '/noronha/dashboard?desativada=manaus&aviso=unidade-desativada' })
    expect(saidaDoEndereco({ slug: 'manaus', todas, unidades: ['bC', 'bM'] }))
      .toEqual({ tipo: 'redirecionar', para: '/caruaru/dashboard?desativada=manaus&aviso=unidade-desativada' })
  })

  it('a desativada, a quem tem "A rede inteira": o portal da rede, com o aviso', async () => {
    const { saidaDoEndereco } = await import('@/lib/unidades/desativada-no-endereco')
    expect(saidaDoEndereco({ slug: 'manaus', todas, unidades: null }))
      .toEqual({ tipo: 'redirecionar', para: '/admin/dashboard?desativada=manaus&aviso=unidade-desativada-rede' })
  })

  it('a desativada, a quem só tinha ela: a tela da unidade desativada (nunca 404)', async () => {
    const { saidaDoEndereco } = await import('@/lib/unidades/desativada-no-endereco')
    expect(saidaDoEndereco({ slug: 'manaus', todas, unidades: ['bM'] }))
      .toEqual({ tipo: 'redirecionar', para: '/auth/unidade-desativada?unidade=manaus' })
  })

  it('outra unidade, fora do alcance: a principal ATIVA, com "outra-unidade"; sem nenhuma ativa, a tela', async () => {
    const { saidaDoEndereco } = await import('@/lib/unidades/desativada-no-endereco')
    expect(saidaDoEndereco({ slug: 'caruaru', todas, unidades: ['bM', 'bN'] }))
      .toEqual({ tipo: 'redirecionar', para: '/noronha/dashboard?aviso=outra-unidade' })
    expect(saidaDoEndereco({ slug: 'velha', todas, unidades: ['bN'] }))
      .toEqual({ tipo: 'redirecionar', para: '/noronha/dashboard?aviso=outra-unidade' })
    expect(saidaDoEndereco({ slug: 'caruaru', todas, unidades: ['bM'] }))
      .toEqual({ tipo: 'redirecionar', para: '/auth/unidade-desativada?unidade=manaus' })
  })

  it('o nome da tela: a unidade pedida, se é dela; senão a principal dela', async () => {
    const { unidadeDaTelaDesativada } = await import('@/lib/unidades/desativada-no-endereco')
    expect(unidadeDaTelaDesativada({ pedida: 'manaus', todas, unidades: ['bM', 'bV'] })).toEqual({ tipo: 'fechada', nome: 'Jacarandá Manaus' })
    expect(unidadeDaTelaDesativada({ pedida: 'caruaru', todas, unidades: ['bM'] })).toEqual({ tipo: 'fechada', nome: 'Jacarandá Manaus' })
    // Com uma ativa (reativada depois), a tela não prende: leva a ela.
    expect(unidadeDaTelaDesativada({ pedida: 'manaus', todas, unidades: ['bM', 'bC'] })).toEqual({ tipo: 'redirecionar', para: '/caruaru/dashboard' })
    expect(unidadeDaTelaDesativada({ pedida: 'manaus', todas, unidades: null })).toEqual({ tipo: 'redirecionar', para: '/admin/dashboard' })
  })
})

describe('a unidade de entrada do login prefere a ativa', () => {
  it('a última usada ativa; senão a principal ativa; senão a primeira ativa das dela; sem nenhuma, a principal', async () => {
    const { escolherUnidadeDeEntrada } = await import('@/lib/unidades/desativada-no-endereco')
    expect(escolherUnidadeDeEntrada({ minhas: ['bC', 'bN'], linhas: todas, ultima: 'noronha' })).toBe('noronha')
    expect(escolherUnidadeDeEntrada({ minhas: ['bC', 'bN'], linhas: todas, ultima: null })).toBe('caruaru')
    expect(escolherUnidadeDeEntrada({ minhas: ['bM', 'bN'], linhas: todas, ultima: 'manaus' })).toBe('noronha')
    expect(escolherUnidadeDeEntrada({ minhas: ['bM'], linhas: todas, ultima: null })).toBe('manaus')
    expect(escolherUnidadeDeEntrada({ minhas: ['bX'], linhas: todas, ultima: null })).toBeNull()
  })
  it('a leitura do login usa a escolha', () => {
    expect(fonte('lib', 'unidades', 'de-entrada.ts')).toContain('escolherUnidadeDeEntrada(')
  })
})

describe('os avisos e as telas', () => {
  it('o aviso diz o nome da unidade desativada (lido do banco, nunca da URL)', async () => {
    const { textoDoAviso, AVISOS_DA_URL } = await import('@/lib/aviso-da-url')
    expect(AVISOS_DA_URL['unidade-desativada']).toBe('Essa unidade foi desativada. Você está na sua unidade.')
    expect(textoDoAviso('unidade-desativada', 'Jacarandá Manaus')).toBe('A unidade Jacarandá Manaus foi desativada. Você está na sua unidade.')
    expect(textoDoAviso('unidade-desativada-rede', 'Jacarandá Manaus'))
      .toBe('A unidade Jacarandá Manaus foi desativada. O que ficou nela está no portal da rede, no filtro de unidade de cada tela.')
    expect(textoDoAviso('unidade-desativada')).toBe('Essa unidade foi desativada. Você está na sua unidade.')
    // O nome só entra nos avisos da unidade desativada.
    expect(textoDoAviso('outra-unidade', 'X')).toBe('Essa unidade não está entre as suas. Você está na sua unidade.')
  })

  it('o layout da unidade decide pela saída, e a faixa lê os nomes das desativadas da rede', () => {
    const layout = fonte('app', '[slug]', 'layout.tsx')
    expect(layout).toContain('saidaDoEndereco(')
    expect(layout).toContain('UnidadesDesativadasProvider')
    expect(fonte('app', 'admin', 'layout.tsx')).toContain('UnidadesDesativadasProvider')
    const faixa = fonte('components', 'shared', 'aviso-da-url.tsx')
    expect(faixa).toContain("get('desativada')")
    expect(faixa).toContain("delete('desativada')")
  })

  it('a tela de quem só tinha a unidade desativada diz o fato, quem procurar e tem o Sair', () => {
    const arq = path.join(RAIZ, 'app', 'auth', 'unidade-desativada', 'page.tsx')
    expect(existsSync(arq)).toBe(true)
    const f = readFileSync(arq, 'utf8')
    expect(f).toContain('foi desativada. Fale com quem administra a rede.')
    expect(f).toContain('logoutAction')
    expect(f).toContain('unidadeDaTelaDesativada(')
  })
})
