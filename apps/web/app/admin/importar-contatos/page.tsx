import { redirect } from 'next/navigation'

/** O importador mora em Configurações → Importações (2026-10-13). */
export default function AdminImportarContatosPage() {
  redirect('/admin/settings?tab=importacoes')
}
