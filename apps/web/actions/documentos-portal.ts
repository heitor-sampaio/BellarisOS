'use server'

/**
 * O CLIENTE assinando pelo portal (ou pelo app, que é o portal).
 *
 * A identidade é a sessão dele (`SESSAO_PORTAL`): quem entrou com o e-mail e a
 * senha da conta. Só assina documento DELE — o id vem do navegador, e todo
 * export deste arquivo é endpoint público. A gravação é a mesma função dos
 * outros canais (`documento_assinar`), que confere o hash do que foi mostrado.
 */

import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { sha256 } from '@/lib/documentos/renderizar'
import { ipEAparelho, dadosDoAssinante, depoisDeAssinar, COLUNAS_ASSINAVEIS, type DocumentoAssinavel } from '@/lib/documentos/assinar'

export async function assinarNoPortal(input: {
  id: string
  assinatura: string
  hashExibido: string
  aceite: string
}): Promise<{ error?: string; codigo?: string | null }> {
  try {
    const ctx = await getTenantContext()
    assertClient(ctx)
    if (typeof input?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.id)) return { error: 'Documento não encontrado.' }
    if (typeof input.assinatura !== 'string' || !input.assinatura.startsWith('data:image/png;base64,')) {
      return { error: 'Faça a sua assinatura antes de confirmar.' }
    }
    if (input.assinatura.length > 400_000) return { error: 'A imagem da assinatura ficou grande demais. Limpe e assine de novo.' }

    const admin = createAdminClient()
    const doc = await ler(admin.from('issued_documents').select(COLUNAS_ASSINAVEIS)
      .eq('id', input.id).eq('client_id', ctx.clientId!).maybeSingle(), 'buscar o documento')
    // De outro cliente: como se não existisse.
    if (!doc) return { error: 'Documento não encontrado.' }
    const d = doc as unknown as DocumentoAssinavel

    const [assinante, rede] = await Promise.all([dadosDoAssinante(d.client_id), ipEAparelho()])
    const r = await gravar(admin.rpc('documento_assinar', {
      p_doc:           d.id,
      p_tenant:        d.tenant_id,
      p_canal:         'PORTAL',
      p_identidade:    'SESSAO_PORTAL',
      p_hash_exibido:  input.hashExibido,
      p_png:           input.assinatura,
      p_png_sha256:    sha256(input.assinatura),
      p_nome:          assinante.nome,
      p_documento:     assinante.documento,
      p_ip:            rede.ip,
      p_ua:            rede.ua,
      p_conduzido_por: null,
      p_link:          null,
      p_scan_path:     null,
      p_scan_sha256:   null,
      p_aceite:        (input.aceite ?? '').slice(0, 300) || null,
    }), 'registrar a assinatura') as { codigo: string | null }

    await depoisDeAssinar(d, null)
    return { codigo: r.codigo }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
