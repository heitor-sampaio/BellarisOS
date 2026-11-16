
-- ─── O que o dump não leva (fica nos esquemas do Supabase) ───────────────────
-- Os gatilhos da sessão de suporte em auth (docs/regras/plataforma.md).
CREATE OR REPLACE TRIGGER trg_suporte_trava_usuario BEFORE UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION private.suporte_trava_usuario();
CREATE OR REPLACE TRIGGER trg_suporte_trava_identidade BEFORE INSERT ON auth.identities FOR EACH ROW EXECUTE FUNCTION private.suporte_trava_fator();
CREATE OR REPLACE TRIGGER trg_suporte_trava_fator BEFORE INSERT OR DELETE ON auth.mfa_factors FOR EACH ROW EXECUTE FUNCTION private.suporte_trava_fator();

-- Os buckets (todos privados; o servidor lê e grava pelo service role).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('anamnesis-photos', 'anamnesis-photos', false, null, null),
  ('client-documents', 'client-documents', false, null, null),
  ('documentos-assinados', 'documentos-assinados', false, null, null),
  ('inbox-media', 'inbox-media', false, null, null),
  ('lgpd-exports', 'lgpd-exports', false, null, null),
  ('modelos-de-documento', 'modelos-de-documento', false, null, null),
  ('suporte-anexos', 'suporte-anexos', false, 5242880, array['image/png','image/jpeg'])
ON CONFLICT (id) DO NOTHING;

notify pgrst, 'reload schema';
