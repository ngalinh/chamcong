-- A checkout shortly after a morning-online window closes is the end of that
-- online segment, not an early departure from the afternoon office segment.
-- Also invalidate affected payroll snapshots while the raw check-ins still
-- exist so historical payroll is recalculated from the corrected values.
with corrected as (
  update public.check_ins as ci
  set early_minutes = null
  from public.leave_requests as lr
  where ci.employee_id = lr.employee_id
    and ci.kind = 'out'
    and ci.early_minutes > 0
    and lr.category in ('online_rain', 'online_wfh', 'online_paid')
    and lr.start_time is not null
    and lr.end_time is not null
    and lr.start_time < time '12:00'
    and lr.end_time <= time '13:30'
    and (ci.checked_in_at at time zone 'Asia/Ho_Chi_Minh')::date = lr.leave_date
    and (ci.checked_in_at at time zone 'Asia/Ho_Chi_Minh')::time >= lr.end_time
    and (ci.checked_in_at at time zone 'Asia/Ho_Chi_Minh')::time < time '15:00'
  returning ci.employee_id,
            to_char(ci.checked_in_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as year_month
)
delete from public.payroll_snapshots as ps
using (select distinct employee_id, year_month from corrected) as affected
where ps.employee_id = affected.employee_id
  and ps.year_month = affected.year_month;
