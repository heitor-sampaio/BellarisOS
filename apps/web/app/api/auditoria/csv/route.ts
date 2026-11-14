import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, can } from '@/lib/auth'
import { lerAuditoria } from '@/lib/auditoria/leitura'
import { linhaDaAuditoria } from '@/lib/auditoria/frase'
import type { FiltrosDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A Auditoria em CSV (CF3a): os MESMOS filtros e a mesma abrangência da tela
 * (`lerAuditoria`), sem a página — lida em páginas de 1000 no banco, até um
 * teto que o arquivo diz quando alcança (princípio 3: nada some calado).
 *
 * Toda rota de /api se defende sozinha (§6): sessão e a Auditoria em Ver.
 */

export const dynamic = 'force-dynamic'

const POR_PAGINA = 1000
const PAGINAS_NO_MAXIMO = 20

const celula = (v: string | number) => {
  // Um nome que começa com = + - @ vira fórmula na planilha (injeção de CSV):
  // o apóstrofo o mantém texto.
  const bruto = String(v)
  const t = /^[=+\-@\t\r]/.test(bruto) ? `'${bruto}` : bruto
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export async function GET(req: NextRequest) {
  let ctx
  try {
    ctx = await getTenantContext()
  } catch {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }
  if (ctx.isClient || !ctx.tenantId || !can(ctx, 'audit', 'VIEW')) {
    return NextResponse.json({ error: 'Sem acesso.' }, { status: 403 })
  }

  const q = req.nextUrl.searchParams
  const filtros: FiltrosDaAuditoria = {
    period: q.get('period') ?? undefined, from: q.get('from') ?? undefined, to: q.get('to') ?? undefined,
    pessoa: q.get('pessoa') ?? undefined, tipo: q.get('tipo') ?? undefined,
    unidade: q.get('unidade') ?? undefined, cliente: q.get('cliente') ?? undefined,
  }

  const linhas: string[] = ['Quando;Quem;O quê;Unidade']
  let cortou = false
  for (let pagina = 1; ; pagina++) {
    const r = await lerAuditoria(ctx, { ...filtros, pagina: String(pagina) }, { porPagina: POR_PAGINA })
    for (const reg of r.registros) {
      const l = linhaDaAuditoria(reg, r.nomes, '/admin/auditoria', null)
      linhas.push([l.quando, l.quem, l.oQue, l.unidade ?? ''].map(celula).join(';'))
    }
    if (!r.temMais) break
    if (pagina >= PAGINAS_NO_MAXIMO) { cortou = true; break }
  }
  if (cortou) linhas.push(celula(`Parou em ${POR_PAGINA * PAGINAS_NO_MAXIMO} linhas: escolha um período menor para ver o resto.`))

  // O BOM faz o Excel abrir o UTF-8 com os acentos certos.
  return new NextResponse('\uFEFF' + linhas.join('\r\n') + '\r\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="auditoria.csv"',
      'cache-control': 'no-store',
    },
  })
}
