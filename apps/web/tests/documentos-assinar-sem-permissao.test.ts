import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { MODULE_LEVELS, MODULE_LABELS } from '@/lib/permissions'
import { MODULE_GROUPS, LEVEL_COPY } from '@/lib/permissions-copy'
import { ABAS_DE_CONFIGURACAO, MODULOS_DAS_ABAS } from '@/lib/configuracoes/abas'

/**
 * A decisão do Heitor de 2026-11-16 sobre os Documentos: "A permissão de
 * gerenciar documentos serve para alguém poder criar/editar/excluir os modelos
 * de documentos. É uma proteção para que os documentos não sejam modificados
 * por quem não deve. Um procedimento/plano/pacote que tenha documentos que
 * precisam de assinatura, os documentos precisam ser assinados. É só uma
 * questão de disponibilizar para o cliente assinar e isso não representa
 * risco."
 *
 * - `documents` = os MODELOS de documento (Sem acesso / Gerenciar);
 * - `forms` = só as fichas;
 * - colher a assinatura não pede permissão de documento (a trava é chegar ao
 *   documento: rede, unidade, cliente no escopo);
 * - dispensar é de quem responde pelos modelos (`documents` em Gerenciar).
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')

/** O corpo de uma função exportada (até a próxima `export` do arquivo). */
function corpoDe(arquivo: string, funcao: string): string {
  const f = ler(arquivo)
  const i = f.indexOf(`export async function ${funcao}(`)
  expect(i, `${funcao} existe em ${arquivo}`).toBeGreaterThanOrEqual(0)
  const resto = f.slice(i + 10)
  const fim = resto.search(/\nexport /)
  return fim < 0 ? resto : resto.slice(0, fim)
}

describe('o módulo Documentos é o dos MODELOS', () => {
  it('só tem Sem acesso e Gerenciar', () => {
    expect(MODULE_LEVELS.documents).toEqual(['NONE', 'MANAGE'])
  })
  it('a tela de Cargos diz que Gerenciar é criar, editar e desativar os modelos — e que colher não pede', () => {
    expect(MODULE_LABELS.documents).toMatch(/modelos de documento/i)
    const manage = LEVEL_COPY.documents.MANAGE ?? ''
    expect(manage).toMatch(/cria, edita e desativa os modelos de documento/i)
    expect(manage).toMatch(/dispensa/i)
    expect(manage).toMatch(/colher a assinatura não pede/i)
    expect(LEVEL_COPY.documents.VIEW).toBeUndefined()
  })
  it('fica em Gestão, ao lado das fichas', () => {
    const gestao = MODULE_GROUPS.find(g => g.modules.includes('forms'))!
    expect(gestao.modules).toContain('documents')
  })
  it('as fichas não falam mais dos modelos de documento', () => {
    expect(MODULE_LABELS.forms).toBe('Modelos de ficha')
    expect(LEVEL_COPY.forms.MANAGE ?? '').not.toMatch(/documento/i)
  })
})

describe('Configurações → Documentos é do módulo Documentos', () => {
  it('a aba pede os Documentos em Gerenciar', () => {
    const aba = ABAS_DE_CONFIGURACAO.find(a => a.key === 'documentos')!
    expect(aba.module).toBe('documents')
    expect(MODULOS_DAS_ABAS).toContain('documents')
  })
  it('o menu leva às Configurações quem só tem os modelos de documento', () => {
    const menu = ler('lib/menu.ts')
    expect(menu).toMatch(/has\(p, 'forms'\) \|\| has\(p, 'documents'\)/)
  })
  it('as actions dos modelos conferem os Documentos em Gerenciar, não as fichas', () => {
    const f = ler('actions/modelos-de-documento.ts')
    expect(f).not.toContain("assertPermission(ctx, 'forms'")
    for (const fn of ['salvarModeloDoEditor', 'salvarModeloDeArquivo', 'definirModeloAtivo', 'tornarContratoAtivo', 'enviarImagemDoModelo', 'definirEnvioDoLinkPelaConversa', 'linkDoArquivoDoModelo']) {
      expect(corpoDe('actions/modelos-de-documento.ts', fn), fn).toContain("assertPermission(ctx, 'documents', 'MANAGE')")
    }
  })
})

describe('colher a assinatura não pede permissão de documento', () => {
  const COLHER = [
    'assinarNaTela', 'assinarJuntosNaTela', 'marcarAssinadoEmPapel', 'definirPagamentoDoContrato',
    'documentoParaAssinar', 'pedirAssinaturaNoPortal', 'gerarLinkDeAssinatura', 'enviarLinkPelaConversa',
    'revogarLinkDeAssinatura', 'montarDocumentoDeNovo',
  ]
  it.each(COLHER)('%s: sem o módulo documents, e com o documento ao alcance', fn => {
    const corpo = corpoDe('actions/documentos.ts', fn)
    expect(corpo).not.toContain("'documents'")
    expect(corpo).not.toContain('assertPodeColher')
    expect(corpo).toContain('documentoAoAlcance(')
  })
  it('a exceção do checkout saiu (virou a regra)', () => {
    expect(ler('actions/documentos.ts')).not.toContain('assertPodeColher')
  })
  it('dispensar é de quem responde pelos modelos', () => {
    expect(corpoDe('actions/documentos.ts', 'dispensarDocumento')).toContain("assertPermission(ctx, 'documents', 'MANAGE')")
  })
})

describe('nenhuma tela manda falar com quem tem os Documentos', () => {
  function arquivos(dir: string): string[] {
    return readdirSync(dir).flatMap(n => {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) return n === 'node_modules' || n.startsWith('.') ? [] : arquivos(p)
      return /\.(ts|tsx)$/.test(n) ? [p] : []
    })
  }
  it('nem "fale com quem tem os Documentos", nem "quem tem os Documentos em Gerenciar"', () => {
    const todos = ['app', 'components', 'lib', 'actions'].flatMap(d => arquivos(join(WEB, d)))
    const comOTexto = todos.filter(p => /fale com quem tem os Documentos|colhida por quem tem os Documentos|quem tem os Documentos em Gerenciar/.test(readFileSync(p, 'utf8')))
    expect(comOTexto.map(p => p.slice(WEB.length + 1))).toEqual([])
  })
  it('quemColheOsDocumentos e a contagem dos que esperam saíram', () => {
    expect(ler('lib/equipe/quem-desfaz.ts')).not.toContain('quemColheOsDocumentos')
    expect(existsSync(join(WEB, 'lib/documentos/esperando.ts'))).toBe(false)
  })
})
