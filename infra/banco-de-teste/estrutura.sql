-- Uma linha por objeto: "tipo nome impressão". `banco-local.mjs conferir` roda
-- isto no banco local e no da nuvem e mostra o que difere.
-- As restrições se comparam sem os parênteses: o dump/restore reescreve o
-- agrupamento (o BETWEEN da nuvem vira AND solto aqui) sem mudar a regra.
select 'funcao '||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||') '||md5(p.prosrc||coalesce(p.proconfig::text,'')||p.prosecdef::text||coalesce(p.proacl::text,'')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
union all select 'politica '||schemaname||'.'||tablename||'.'||policyname||' '||md5(cmd||permissive||array_to_string(roles,',')||coalesce(qual,'')||coalesce(with_check,'')) from pg_policies where schemaname in ('public','private','storage')
union all select 'coluna '||table_schema||'.'||table_name||'.'||column_name||' '||md5(data_type||coalesce(udt_name,'')||coalesce(column_default,'')||is_nullable) from information_schema.columns where table_schema in ('public','private')
union all select 'tabela '||n.nspname||'.'||c.relname||' '||md5(c.relkind::text||c.relrowsecurity::text||c.relforcerowsecurity::text||coalesce(c.relacl::text,'')) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','S')
union all select 'gatilho '||n.nspname||'.'||c.relname||'.'||t.tgname||' '||md5(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and (n.nspname in ('public','private') or t.tgname like 'trg_suporte%')
union all select 'indice '||schemaname||'.'||indexname||' '||md5(indexdef) from pg_indexes where schemaname in ('public','private')
union all select 'restricao '||n.nspname||'.'||c.relname||'.'||k.conname||' '||md5(translate(pg_get_constraintdef(k.oid), '()', '')) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')
union all select 'tipo '||n.nspname||'.'||t.typname||' '||md5(coalesce((select string_agg(enumlabel, ',' order by enumsortorder) from pg_enum e where e.enumtypid=t.oid),'')) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private') and t.typtype in ('e','d')
union all select 'realtime '||schemaname||'.'||tablename||' x' from pg_publication_tables where pubname='supabase_realtime'
union all select 'bucket '||id||' '||md5(public::text||coalesce(file_size_limit::text,'')||coalesce(array_to_string(allowed_mime_types,','),'')) from storage.buckets
union all select 'extensao '||extname||' x' from pg_extension where extname not in ('pg_graphql','pg_stat_statements','supabase_vault','pgsodium','pg_net','pgjwt','plpgsql')
order by 1;
