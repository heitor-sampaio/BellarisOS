-- Termos e contratos — fase 4: o PDF assinado e a verificação pública.
--
-- Depois de assinado, o documento vira um PDF final (o texto ou o PDF enviado,
-- a assinatura e uma página de evidências com o código e o QR de verificação).
-- É gerado pelo app logo depois da assinatura (`after()`), e um cron recolhe o
-- que ficou para trás — reivindicando a linha, para duas passagens não
-- gerarem o mesmo PDF duas vezes.

-- ─── Código de verificação para o legado ─────────────────────────────────────
-- Os termos copiados de consent_terms (fase 3) nasceram sem código. Mesmo
-- alfabeto do app (lib/documentos/codigo.ts): base32 de Crockford, 12 letras.
create or replace function private.novo_codigo_de_verificacao()
returns text language plpgsql volatile set search_path = '' as $$
declare
  v_alfabeto constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea := decode(md5(gen_random_uuid()::text || clock_timestamp()::text), 'hex');
  v_s text := '';
begin
  for i in 0..11 loop
    v_s := v_s || substr(v_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return substr(v_s, 1, 4) || '-' || substr(v_s, 5, 4) || '-' || substr(v_s, 9, 4);
end $$;

update public.issued_documents d
   set verification_code = private.novo_codigo_de_verificacao()
 where d.verification_code is null and d.status = 'ASSINADO';

-- ─── Registrar o PDF final (uma vez só) ──────────────────────────────────────
create or replace function public.documento_registrar_pdf(p_doc uuid, p_tenant uuid, p_path text, p_sha256 text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update public.issued_documents d
     set signed_pdf_path = p_path, signed_pdf_sha256 = p_sha256
   where d.id = p_doc and d.tenant_id = p_tenant
     and d.status = 'ASSINADO' and d.signed_pdf_path is null;
  if not found then return false; end if;
  insert into public.issued_document_events (issued_document_id, tenant_id, kind, details)
  values (p_doc, p_tenant, 'PDF_GERADO', jsonb_build_object('sha256', p_sha256));
  return true;
end $$;

-- ─── Fila do cron: reivindicar o que está sem PDF ────────────────────────────
-- `for update skip locked` + o contador na mesma instrução: duas passagens
-- concorrentes nunca pegam a mesma linha, e o que falha 5 vezes para de ser
-- tentado (fica visível: assinado, sem PDF, com pdf_attempts = 5).
create or replace function public.documentos_pdf_reivindicar(p_limite int)
returns table (id uuid, tenant_id uuid)
language sql security definer set search_path = ''
as $$
  with alvo as (
    select d.id from public.issued_documents d
     where d.status = 'ASSINADO' and d.signed_pdf_path is null and d.pdf_attempts < 5
       and d.signed_at < now() - interval '2 minutes'
     order by d.signed_at
     limit greatest(1, least(p_limite, 50))
     for update skip locked
  )
  update public.issued_documents d
     set pdf_attempts = d.pdf_attempts + 1
    from alvo
   where d.id = alvo.id
  returning d.id, d.tenant_id
$$;

revoke execute on function public.documento_registrar_pdf(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.documentos_pdf_reivindicar(int) from public, anon, authenticated;
grant execute on function public.documento_registrar_pdf(uuid, uuid, text, text) to service_role;
grant execute on function public.documentos_pdf_reivindicar(int) to service_role;

notify pgrst, 'reload schema';
