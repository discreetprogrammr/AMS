-- HorizonCare360 (AMS) — PPA Demo Seed
-- Adds a second demo "tenant" — Philippine Ports Authority — alongside the
-- existing BOC demo data, for the Sept 8, 2026 PPA presentation.
--
-- This does NOT touch the BOC organization or its assets. It's additive:
-- one new organization, 5 sites (PPA-operated ports), 10 assets (Smiths
-- Detection screening equipment), a couple of compliance certificates,
-- and two open service tickets, so the dashboard KPI panels, Fleet Map,
-- and Certificates/Service-Due widgets all have something realistic to show.
--
-- NOTE ON PORT SELECTION: Manila North/South Harbor, MICT, Subic, and Cebu
-- are commonly thought of as "PPA ports" but are legally operated by private
-- concessionaires or separate port authorities (ICTSI, ATI, MNHPI, SBMA, CPA).
-- To avoid an awkward "that's not actually ours" moment in front of PPA
-- officials, this seed uses five ports that are directly PPA-operated:
-- Batangas, Cagayan de Oro, Iloilo, Zamboanga, and General Santos (Makar Wharf).
--
-- All equipment models are Smiths Detection / CEIA / Garrett product lines
-- that are plausible for port cargo & passenger security screening — they
-- are NOT confirmed real deployments at these specific ports. This is mock
-- demo data, same as the existing BOC demo assets.
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → paste this whole file → Run.
-- Safe to re-run only after deleting the org first (see cleanup note at the
-- bottom) — running it twice as-is will create a duplicate PPA organization.

do $$
declare
  v_org_id             uuid;
  v_site_batangas      uuid;
  v_site_cdo           uuid;
  v_site_iloilo        uuid;
  v_site_zamboanga     uuid;
  v_site_gensan        uuid;
  v_asset_bat_xry01    uuid;
  v_asset_bat_xry02    uuid;
  v_asset_cdo_xry01    uuid;
  v_asset_cdo_pts01    uuid;
  v_asset_ilo_xry01    uuid;
  v_asset_ilo_pts01    uuid;
  v_asset_zam_xry01    uuid;
  v_asset_zam_pts01    uuid;
  v_asset_ges_xry01    uuid;
  v_asset_ges_xry02    uuid;
begin

  -- ── Organization ──────────────────────────────────────────────────────
  insert into organizations (name, sector, primary_contact, email)
  values (
    'Philippine Ports Authority',
    'government / ports',
    'Port Police and Security Division',
    'info@ppa.gov.ph'
  )
  returning id into v_org_id;

  -- ── Sites (PPA-operated ports, with coordinates for the Fleet Map) ─────
  insert into sites (organization_id, address, site_contact, latitude, longitude)
  values (v_org_id, 'Batangas International Port, Batangas City, Batangas', 'Port Manager, Batangas Port Management Office', 13.7565, 121.0583)
  returning id into v_site_batangas;

  insert into sites (organization_id, address, site_contact, latitude, longitude)
  values (v_org_id, 'Cagayan de Oro Port, Cagayan de Oro City, Misamis Oriental', 'Port Manager, CDO Port Management Office', 8.4822, 124.6472)
  returning id into v_site_cdo;

  insert into sites (organization_id, address, site_contact, latitude, longitude)
  values (v_org_id, 'Iloilo Commercial Port Complex, Iloilo City, Iloilo', 'Port Manager, Iloilo Port Management Office', 10.7042, 122.5693)
  returning id into v_site_iloilo;

  insert into sites (organization_id, address, site_contact, latitude, longitude)
  values (v_org_id, 'Zamboanga Port, Zamboanga City', 'Port Manager, Zamboanga Port Management Office', 6.9077, 122.0620)
  returning id into v_site_zamboanga;

  insert into sites (organization_id, address, site_contact, latitude, longitude)
  values (v_org_id, 'Makar Wharf, General Santos Port, General Santos City, South Cotabato', 'Port Manager, GenSan Port Management Office', 6.0785, 125.1467)
  returning id into v_site_gensan;

  -- ── Assets ───────────────────────────────────────────────────────────

  -- Batangas
  insert into assets (organization_id, site_id, asset_tag, equipment_type, brand, model, serial_number, sold_by, install_date, status, warranty_end_date, custodian, pnri_license_number, next_service_due)
  values (v_org_id, v_site_batangas, 'PPA-BAT-XRY-01', 'xray_screening', 'Smiths Detection', 'HCVM 6100', 'SD-HCVM-88213', 'third_party', '2022-03-15', 'operational', '2025-03-15', 'Port Engineer, Batangas Port Management Office', 'PNRI-XRD-2022-0198', '2026-09-10')
  returning id into v_asset_bat_xry01;

  insert into assets (organization_id, site_id, asset_tag, equipment_type, brand, model, serial_number, sold_by, install_date, status, warranty_end_date, custodian, pnri_license_number, next_service_due)
  values (v_org_id, v_site_batangas, 'PPA-BAT-XRY-02', 'xray_screening', 'Smiths Detection', 'HI-SCAN 100100T-2is', 'SD-HS100T-40217', 'third_party', '2021-11-02', 'under_maintenance', '2024-11-02', 'Port Engineer, Batangas Port Management Office', 'PNRI-XRD-2021-0099', '2026-08-15')
  returning id into v_asset_bat_xry02;

  -- Cagayan de Oro
  insert into assets (organization_id, site_id, asset_tag, equipment_type, brand, model, serial_number, sold_by, install_date, status, warranty_end_date, custodian, pnri_license_number, next_service_due)
  values (v_org_id, v_site_cdo, 'PPA-CDO-XRY-01', 'xray_screening', 'Smiths Detection', 'HI-SCAN 6040aTiX', 'SD-HS6040-55129', 'third_party', '2023-07-20', 'operational', '2026-07-20', 'Port Engineer, CDO Port Management Office', 'PNRI-XRD-2023-0512', '2026-12-01')
  returning id into v_asset_cdo_xry01;

  insert into assets (organization_id, site_id, asset_tag, equipment_type, brand, model, serial_number, sold_by, install_date, status, warranty_end_date, custodian, next_service_due)
  values (v_org_id, v_site_cdo, 'PPA-CDO-PTS-01', 'people_threat_screening', 'CEIA', 'OPENGATE', 'CEIA-OG-30871', 'third_party', '2023-07-20', 'operational', '2026-07-20', 'Port Engineer, CDO Port Management Office', '2027-01-10')
  returning id into v_asset_cdo_pts01;

  -- Iloilo
  insert into assets (organization_id, site_id, asset_tag, equipment_type, brand, model, serial_number, sold_by, install_date, status, warranty_end_date, custodian, pnri_license_number, next_service_due)
  values (v_org_id, v_site_iloilo, 'PPA-ILO-XRY-01', 'xray_screening', 'Smiths Detection', 'HCVP 3D', 'SD-HCVP-30044', 'third_party', '2020-09-05', 'operational', '2023-09-05', 'Port Engineer, Iloilo Port Management Office', 'PNRI-XRD-2020-0077', '2026-09-05')
  returning id into v_asset_ilo_xry01;

  insert into assets (organization_id, site_id, asset_tag, equipment_type, brand, model, serial_number, sold_by, install_date, status, warranty_end_date, custodian, next_service_due)
  values (v_org_id, v_site_iloilo, 'PPA-ILO-PTS-01', 'people_threat_screening', 'CEIA', 'OPENGATE', 'CEIA-OG-30872', 'third_party', '2020-09-05', 'operational', '2023-09-05', 'Port Engineer, Iloilo Port Management Office', '2026-12-20')
  returning id into v_asset_ilo_pts01;

  -- Zamboanga
  insert into assets (organization_id, site_id, asset_tag, equipment_type, brand, model, serial_number, sold_by, install_date, status, warranty_end_date, custodian, pnri_license_number, next_service_due)
  values (v_org_id, v_site_zamboanga, 'PPA-ZAM-XRY-01', 'xray_screening', 'Smiths Detection', 'HI-SCAN 5030si', 'SD-HS5030-19964', 'third_party', '2019-04-12', 'unserviceable', '2022-04-12', 'Port Engineer, Zamboanga Port Management Office', 'PNRI-XRD-2019-0033', '2026-07-01')
  returning id into v_asset_zam_xry01;

  insert into assets (organization_id, site_id, asset_tag, equipment_type, brand, model, serial_number, sold_by, install_date, status, warranty_end_date, custodian, next_service_due)
  values (v_org_id, v_site_zamboanga, 'PPA-ZAM-PTS-01', 'people_threat_screening', 'Garrett', 'PD 6500i', 'GAR-PD6500-77102', 'third_party', '2019-04-12', 'operational', '2022-04-12', 'Port Engineer, Zamboanga Port Management Office', '2026-11-30')
  returning id into v_asset_zam_pts01;

  -- General Santos (Makar Wharf)
  insert into assets (organization_id, site_id, asset_tag, equipment_type, brand, model, serial_number, sold_by, install_date, status, warranty_end_date, custodian, pnri_license_number, next_service_due)
  values (v_org_id, v_site_gensan, 'PPA-GES-XRY-01', 'xray_screening', 'Smiths Detection', 'HCVM 6100', 'SD-HCVM-91004', 'third_party', '2024-01-18', 'operational', '2027-01-18', 'Port Engineer, GenSan Port Management Office', 'PNRI-XRD-2024-0210', '2027-01-18')
  returning id into v_asset_ges_xry01;

  insert into assets (organization_id, site_id, asset_tag, equipment_type, brand, model, serial_number, sold_by, install_date, status, warranty_end_date, custodian, pnri_license_number, next_service_due)
  values (v_org_id, v_site_gensan, 'PPA-GES-XRY-02', 'xray_screening', 'Smiths Detection', 'HI-SCAN 100100V-2is', 'SD-HS100V-91005', 'third_party', '2024-01-18', 'operational', '2027-01-18', 'Port Engineer, GenSan Port Management Office', 'PNRI-XRD-2024-0211', '2027-01-18')
  returning id into v_asset_ges_xry02;

  -- ── Compliance certificates (two expiring within 30 days of 2026-08-28,
  --    so the dashboard's "Certificates Expiring" panel has something to show) ──
  insert into compliance_certificates (asset_id, certificate_type, issue_date, expiry_date)
  values (v_asset_zam_xry01, 'PNRI Radiation License', '2023-09-15', '2026-09-15');

  insert into compliance_certificates (asset_id, certificate_type, issue_date, expiry_date)
  values (v_asset_bat_xry01, 'Calibration Certificate', '2025-09-20', '2026-09-20');

  insert into compliance_certificates (asset_id, certificate_type, issue_date, expiry_date)
  values (v_asset_ges_xry01, 'Warranty', '2024-01-18', '2027-01-18');

  -- ── Service records (one pass, for a bit of history on the busiest unit) ──
  insert into service_records (asset_id, service_type, date_performed, performed_by, findings, result, next_due_date)
  values (v_asset_bat_xry01, 'preventive_maintenance', '2026-06-10', 'PHTek Field Engineer', 'Routine PM completed, conveyor and imaging calibration within spec.', 'pass', '2026-09-10');

  insert into service_records (asset_id, service_type, date_performed, performed_by, findings, result, next_due_date)
  values (v_asset_zam_xry01, 'radiation_survey', '2026-07-01', 'PHTek Radiation Safety Officer', 'Shielding leak detected exceeding threshold; unit taken offline pending part replacement.', 'fail', '2026-09-15');

  -- ── Open service tickets (so "Open Service Tickets" on the dashboard isn't zero) ──
  insert into service_tickets (asset_id, description, status, priority)
  values (v_asset_bat_xry02, 'Feeder belt intermittently jamming during cargo screening; needs technician dispatch.', 'open', 'high');

  insert into service_tickets (asset_id, description, status, priority)
  values (v_asset_zam_xry01, 'Unit flagged unserviceable pending PNRI clearance and replacement part for shielding.', 'open', 'high');

  raise notice 'PPA demo organization created with id: %', v_org_id;

end $$;

-- ── Cleanup (only if you need to re-run this script) ─────────────────────
-- Deleting the organization cascades to its sites and assets (schema.sql
-- has `on delete cascade` on both), and assets cascade to their service
-- records, certificates, and tickets. Uncomment and run this FIRST if you
-- need a clean re-seed:
--
-- delete from organizations where name = 'Philippine Ports Authority';
