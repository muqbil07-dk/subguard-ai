begin;
grant delete on public.notifications to authenticated;
create policy own_delete on public.notifications for delete to authenticated
using ((select auth.uid()) = user_id);
commit;
