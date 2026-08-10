-- Step 19 — Service Timing + If Failures Occurred fields on service reports.
--
-- Matches the reference PM checklist's time-tracking block: arrival time,
-- work start/end, a manual visit status, and (when something went wrong
-- mid-visit) diagnostic/repair start-end times. Added to both Preventive
-- and Corrective report forms, so these live on the shared service_records
-- table rather than being duplicated per report type.

alter table service_records
  add column if not exists time_arrived time,
  add column if not exists service_begin time,
  add column if not exists service_completed time,
  add column if not exists visit_status text,
  add column if not exists diagnostic_start time,
  add column if not exists diagnostic_done time,
  add column if not exists repair_start time,
  add column if not exists repair_end time;
