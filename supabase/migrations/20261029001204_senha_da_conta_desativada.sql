-- J-68 (2026-10-30): a pessoa desativada pela clínica via "E-mail ou senha
-- incorretos" e achava que errou a senha. O Auth responde `user_banned` — mas
-- ANTES de conferir a senha: dizer "desativado" a quem errou a senha contaria
-- a qualquer um que aquele e-mail tem conta. O login só diz "desativado"
-- quando a senha CONFERE, e esta função é a conferência (o hash bcrypt do
-- próprio Auth, pelo crypt do pgcrypto).
--
-- Só o servidor a chama (service role), e só depois de o Auth responder
-- `user_banned`: o limite de tentativas do Auth vem antes dela.

create or replace function public.senha_da_conta_confere(p_email text, p_senha text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select u.encrypted_password is not null
       and u.encrypted_password <> ''
       and u.encrypted_password = extensions.crypt(p_senha, u.encrypted_password)
      from auth.users u
     where lower(u.email) = lower(trim(p_email))
     limit 1
  ), false)
$$;

revoke execute on function public.senha_da_conta_confere(text, text) from public, anon, authenticated;
grant execute on function public.senha_da_conta_confere(text, text) to service_role;

notify pgrst, 'reload schema';
