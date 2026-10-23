-- Limpeza do verificador de segurança do Supabase (2026-10-23).
--
-- Nada aqui muda comportamento: é para o verificador parar de acusar ruído e
-- o que ele mostrar de novo ser o que importa.
--
-- 1. As oito funções de GATILHO em `public` nasceram com `execute` para
--    `public`/`anon`/`authenticated` (o padrão do Postgres). O PostgREST não
--    as publica (responde PGRST202) e o Postgres recusa chamá-las fora de um
--    gatilho — não havia porta aberta. O gatilho dispara sem `execute` (o
--    privilégio só é conferido ao CRIAR o gatilho).
-- 2. Catorze funções sem `search_path` fixo. Ficam com o MESMO caminho que a
--    sessão usa hoje (`public, extensions`): fixar `''` quebraria a que cita
--    um tipo ou uma função sem o schema.

revoke execute on function public.fn_contato_aprende_da_conversa() from public, anon, authenticated;
revoke execute on function public.fn_conversa_ganha_contato()       from public, anon, authenticated;
revoke execute on function public.fn_oportunidade_ganha_contato()   from public, anon, authenticated;
revoke execute on function public.on_appointment_add_unit_tag()     from public, anon, authenticated;
revoke execute on function public.on_stock_below_min()              from public, anon, authenticated;
revoke execute on function public.on_stock_movement()               from public, anon, authenticated;
revoke execute on function public.on_transaction_paid()             from public, anon, authenticated;
revoke execute on function public.on_transaction_reversed()         from public, anon, authenticated;

alter function public.metrics_by_branch(uuid, timestamptz, timestamptz)                          set search_path = public, extensions;
alter function public.metrics_commissions_detail(uuid, uuid[], timestamptz, timestamptz)         set search_path = public, extensions;
alter function public.metrics_lead_funnel(uuid, uuid[], timestamptz, timestamptz, uuid)          set search_path = public, extensions;
alter function public.metrics_new_clients_series(uuid, uuid[], timestamptz, timestamptz, text)   set search_path = public, extensions;
alter function public.metrics_retention(uuid, uuid[], timestamptz, timestamptz)                  set search_path = public, extensions;
alter function public.metrics_series(uuid, uuid[], timestamptz, timestamptz, text)               set search_path = public, extensions;
alter function public.metrics_top_clients(uuid, uuid[], timestamptz, timestamptz, integer)       set search_path = public, extensions;
alter function public.metrics_top_procedures(uuid, uuid[], timestamptz, timestamptz, integer)    set search_path = public, extensions;
alter function public.metrics_top_professionals(uuid, uuid[], timestamptz, timestamptz, integer) set search_path = public, extensions;
alter function private.platform_audit_log_imutavel()             set search_path = public, extensions;
alter function private.support_access_log_imutavel()             set search_path = public, extensions;
alter function private.tags_padrao()                             set search_path = public, extensions;
alter function private.trocar_tag(text[], text, text)            set search_path = public, extensions;
alter function private.categorias_de_procedimento_padrao()       set search_path = public, extensions;

notify pgrst, 'reload schema';
