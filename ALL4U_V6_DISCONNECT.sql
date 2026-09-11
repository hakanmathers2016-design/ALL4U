-- ALL4U v6 - Bağlantıyı Kes özelliği
-- Supabase > SQL Editor'da bir kez çalıştır.

create or replace function public.leave_current_couple()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_couple uuid;
begin
  if v_user is null then
    raise exception 'Oturum bulunamadı.';
  end if;

  select couple_id into v_couple
  from public.couple_members
  where user_id = v_user
  limit 1;

  if v_couple is null then
    return;
  end if;

  delete from public.statuses
  where user_id = v_user and couple_id = v_couple;

  delete from public.couple_members
  where user_id = v_user and couple_id = v_couple;
end;
$$;

revoke all on function public.leave_current_couple() from public;
grant execute on function public.leave_current_couple() to authenticated;
