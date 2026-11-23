import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Sai o "só os meus" (o Heitor, 2026-11-23: "pode tirar, as vistas pessoais
 * resolvem, no crm acho que não se aplica diretamente e talvez o melhor
 * caminho seja pelo filtro de dono da oportunidade"). O cargo fica com dois
 * eixos — módulo × nível e a abrangência da pessoa —, e nada no app recorta
 * por "os registros dela" a partir do cargo. O que é da pessoa (a Minha
 * agenda, as Minhas comissões) é uma vista pessoal, não um escopo.
 *
 * Esta varredura trava a volta: nenhum código do app lê um escopo de cargo.
 */
const WEB = path.resolve(__dirname, '..')
const TIPOS = path.resolve(WEB, '..', '..', 'packages', 'types', 'src')
const PASTAS = ['app', 'actions', 'lib', 'components'].map(p => path.join(WEB, p))

function arquivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}

const PROIBIDOS: [RegExp, string][] = [
  [/\bownerFilter\b/, 'ownerFilter'],
  [/\bisOwnScope\b/, 'isOwnScope'],
  [/\bSCOPED_MODULES\b/, 'SCOPED_MODULES'],
  [/\bSCOPE_LABELS\b/, 'SCOPE_LABELS'],
  [/\bresolveScopes\b/, 'resolveScopes'],
  [/\bctx\.scopes\b|\bscopes\s*\[/, 'ctx.scopes'],
  [/\brecorteDosModulos\b/, 'recorteDosModulos'],
  [/\binbox_visibilidade\b/, 'inbox_visibilidade (o refino do "só os meus" no inbox)'],
]

describe('sem o "só os meus" (2026-11-23)', () => {
  it('nenhum código do app lê um escopo de cargo', () => {
    const achados: string[] = []
    for (const f of PASTAS.flatMap(arquivos)) {
      const linhas = fs.readFileSync(f, 'utf8').split('\n')
      linhas.forEach((l, i) => {
        for (const [re, nome] of PROIBIDOS) if (re.test(l)) achados.push(`${path.relative(WEB, f)}:${i + 1} ${nome}`)
      })
    }
    expect(achados).toEqual([])
  })

  it('o contexto da pessoa não carrega escopo', () => {
    const auth = fs.readFileSync(path.join(TIPOS, 'auth.ts'), 'utf8')
    expect(auth).not.toMatch(/\bscopes\s*:/)
    expect(auth).not.toMatch(/ResolvedScopes/)
  })

  it('a tela de Cargos não oferece "Só os meus"', () => {
    const copia = fs.readFileSync(path.join(WEB, 'lib', 'permissions-copy.ts'), 'utf8')
    const editor = fs.readFileSync(path.join(WEB, 'components', 'admin', 'roles-editor.tsx'), 'utf8')
    for (const s of [copia, editor]) expect(s).not.toMatch(/[Ss]ó os (meus|próprios)|SCOPE_NOTE|SegmentedScope/)
  })
})
