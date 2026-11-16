import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, podeVerAuditoria } from '@/lib/auth'
import { lerAuditoria } from '@/lib/auditoria/leitura'
import { linhasDoCsvDaAuditoria } from '@/lib/auditoria/frase'
import type { FiltrosDaAuditoria, NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A Auditoria em CSV (CF3a): os MESMOS filtros e a mesma abrangência da tela
 * (`lerAuditoria`), sem a página — lida em páginas de 1000 no banco, até um
 * teto que o arquivo diz quando alcança (princípio 3: nada some calado).
 *
 * Toda rota de /api se defende sozinha (§6): sessão e a Admin da rede (a
 * Auditoria é só dela, 2026-11-16).
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
  if (ctx.isClient || !ctx.tenantId || !podeVerAuditoria(ctx)) {
    return NextResponse.json({ error: 'Sem acesso.' }, { status: 403 })
  }

  const q = req.nextUrl.searchParams
  const filtros: FiltrosDaAuditoria = {
    period: q.get('period') ?? undefined, from: q.get('from') ?? undefined, to: q.get('to') ?? undefined,
    pessoa: q.get('pessoa') ?? undefined, tipo: q.get('tipo') ?? undefined,
    unidade: q.get('unidade') ?? undefined, cliente: q.get('cliente') ?? undefined,
  }

  // A38 da 16ª: a coluna "Gravação" leva a frase da gravação inteira (a da
  // tela). Uma gravação pode cair em duas páginas do banco: lê tudo, junta os
  // nomes, e só então agrupa.
  const linhas: string[] = ['Quando;Quem;O quê;Gravação;Unidade']
  const registros: RegistroDaAuditoria[] = []
  const nomes: NomesDaAuditoria = { clientes: {}, membros: {}, unidades: {} }
  // Com o filtro de unidade, a gravação se completa (A28 da 17ª): a que cai em
  // duas páginas vem inteira nas duas — o id não se repete no arquivo.
  const lidos = new Set<number>()
  let cortou = false
  for (let pagina = 1; ; pagina++) {
    const r = await lerAuditoria(ctx, { ...filtros, pagina: String(pagina) }, { porPagina: POR_PAGINA })
    for (const reg of r.registros) if (!lidos.has(reg.id)) { lidos.add(reg.id); registros.push(reg) }
    // Todos os nomes de cada página, os que vierem a existir também.
    for (const [chave, valores] of Object.entries(r.nomes) as [keyof NomesDaAuditoria, Record<string, unknown> | undefined][]) {
      Object.assign(((nomes as unknown as Record<string, Record<string, unknown>>)[chave] ??= {}), valores ?? {})
    }
    if (!r.temMais) break
    if (pagina >= PAGINAS_NO_MAXIMO) { cortou = true; break }
  }
  registros.sort((a, b) => b.id - a.id)
  for (const l of linhasDoCsvDaAuditoria(registros, nomes)) {
    linhas.push([l.quando, l.quem, l.oQue, l.gravacao, l.unidade ?? ''].map(celula).join(';'))
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
