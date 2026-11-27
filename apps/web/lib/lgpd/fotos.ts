import type { createAdminClient } from '@/lib/supabase/admin'
import { CLIENT_DOCS_BUCKET } from '@/lib/storage'

type Admin = ReturnType<typeof createAdminClient>

/** Um anexo da ficha, como o pacote o lê (`client_documents`). */
export interface DocumentoDaFoto {
  appointment_id: string | null
  category:       string
  name:           string | null
  file_name:      string | null
  file_path:      string | null
  created_at:     string
  apagado_em:     string | null
}

/** Uma foto no pacote: o nome, quando foi anexada e o link para baixá-la (nulo se o arquivo não existe mais). */
export interface FotoDoPacote {
  nome:      string
  anexadaEm: string
  link:      string | null
}

/**
 * As fotos do prontuário liberado (D14 da 39ª; LG-12: o prontuário leva "as
 * fotos (inclusive a foto clínica anexada)"): vinham só contadas. Cada foto
 * clínica viva da ficha vai com um link assinado do arquivo, com a validade do
 * pacote; a do atendimento (`appointment_id` de um registro do prontuário) fica
 * sob ele, as outras na ficha. O arquivo que não existe mais no armazenamento
 * diz isso (`link: null`) — a foto não some do pacote em silêncio.
 */
export async function fotosDoProntuario(
  admin: Admin,
  documentos: readonly DocumentoDaFoto[],
  atendimentosDoProntuario: ReadonlySet<string>,
  validadeEmSegundos: number,
): Promise<{ porAtendimento: Map<string, FotoDoPacote[]>; daFicha: FotoDoPacote[] }> {
  const fotos = documentos.filter(d => d.category === 'foto_clinica' && !d.apagado_em && d.file_path)
  const links = new Map<string, string>()
  if (fotos.length) {
    const { data, error } = await admin.storage.from(CLIENT_DOCS_BUCKET)
      .createSignedUrls(fotos.map(f => f.file_path as string), validadeEmSegundos)
    if (error) throw new Error(`Falha ao assinar as fotos do prontuário: ${error.message}`)
    for (const l of data ?? []) if (l.path && l.signedUrl && !l.error) links.set(l.path, l.signedUrl)
  }
  const porAtendimento = new Map<string, FotoDoPacote[]>()
  const daFicha: FotoDoPacote[] = []
  for (const f of fotos) {
    const foto: FotoDoPacote = { nome: f.name?.trim() || f.file_name || 'Foto', anexadaEm: f.created_at, link: links.get(f.file_path as string) ?? null }
    if (f.appointment_id && atendimentosDoProntuario.has(f.appointment_id)) {
      porAtendimento.set(f.appointment_id, [...(porAtendimento.get(f.appointment_id) ?? []), foto])
    } else {
      daFicha.push(foto)
    }
  }
  return { porAtendimento, daFicha }
}

/** As linhas do PDF: 'Foto "Antes" (20/11/2026 10:00): <link>'. `quando` é o formatador no fuso da rede (o do pacote). */
export function linhasDasFotosNoPdf(fotos: readonly FotoDoPacote[], quando: (iso: string) => string): string[] {
  return fotos.map(f => `   Foto "${f.nome}" (${quando(f.anexadaEm)}): ${f.link ?? 'o arquivo não foi encontrado'}`)
}
