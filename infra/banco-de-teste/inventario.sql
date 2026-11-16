select 'tabela' t, count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname in ('public','private')
union all select 'view', count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('v','m') and n.nspname in ('public','private')
union all select 'funcao', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
union all select 'politica', count(*) from pg_policies where schemaname in ('public','private')
union all select 'gatilho', count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','private','auth')
union all select 'indice', count(*) from pg_indexes where schemaname in ('public','private')
union all select 'tipo', count(*) from pg_type ty join pg_namespace n on n.oid=ty.typnamespace where n.nspname in ('public','private') and ty.typtype in ('e','d','c') and not exists (select 1 from pg_class c where c.reltype=ty.oid)
union all select 'publicacao', count(*) from pg_publication_tables where pubname='supabase_realtime'
union all select 'bucket', count(*) from storage.buckets
union all select 'md5_funcoes', ('x'||substr(md5(string_agg(n.nspname||p.proname||pg_get_function_identity_arguments(p.oid)||md5(p.prosrc), ',' order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))),1,8))::bit(32)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
union all select 'md5_politicas', ('x'||substr(md5(string_agg(schemaname||tablename||policyname||coalesce(qual,'')||coalesce(with_check,'')||array_to_string(roles,','), ',' order by schemaname,tablename,policyname)),1,8))::bit(32)::int from pg_policies where schemaname in ('public','private')
union all select 'md5_colunas', ('x'||substr(md5(string_agg(table_schema||table_name||column_name||data_type||coalesce(column_default,'')||is_nullable, ',' order by table_schema,table_name,column_name)),1,8))::bit(32)::int from information_schema.columns where table_schema in ('public','private');
