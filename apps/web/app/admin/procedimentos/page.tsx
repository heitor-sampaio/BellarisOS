import { redirect } from 'next/navigation'

/** A29 da 16ª: `/admin/procedimentos` leva a `/admin/procedures`; a página de destino confere a permissão. */
export default function ProcedimentosRedirect() {
  redirect('/admin/procedures')
}
