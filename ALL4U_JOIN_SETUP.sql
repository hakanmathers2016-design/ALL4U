-- ALL4U güvenli çift-koduyla katılma fonksiyonu
-- Supabase SQL Editor'da bir kez çalıştır.

create or replace function public.join_couple_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_count integer;
begin
  select id into v_couple_id
  from public.couples
  where upper(couple_code) = upper(trim(p_code))
  limit 1;

  if v_couple_id is null then
    return null;
  end if;

  select count(*) into v_count
  from public.couple_members
  where couple_id = v_couple_id;

  if v_count >= 2 then
    raise exception 'Bu çift zaten iki kişiden oluşuyor.';
  end if;

  if exists (
    select 1 from public.couple_members
    where user_id = auth.uid()
  ) then
    raise exception 'Bu kullanıcı zaten bir çifte bağlı.';
  end if;

  insert into public.couple_members(couple_id, user_id, display_name)
  values (v_couple_id, auth.uid(), 'Partner');

  return v_couple_id;
end;
$$;

revoke all on function public.join_couple_by_code(text) from public;
grant execute on function public.join_couple_by_code(text) to authenticated;

-- Realtime publication daha önce eklenmişse hata vermemesi için kontrol:
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='statuses'
  ) then alter publication supabase_realtime add table public.statuses; end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='interactions'
  ) then alter publication supabase_realtime add table public.interactions; end if;
end $$;
