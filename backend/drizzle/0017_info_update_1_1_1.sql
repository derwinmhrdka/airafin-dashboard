-- Seed Info Update announcement for release 1.1.1 (text pages only, no photos).
DO $$
DECLARE
  update_id integer;
  stamp text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  IF EXISTS (SELECT 1 FROM info_updates WHERE title = 'New Update 1.1.1') THEN
    RETURN;
  END IF;

  INSERT INTO info_updates (title, active, created_at, updated_at)
  VALUES ('New Update 1.1.1', true, stamp, stamp)
  RETURNING id INTO update_id;

  INSERT INTO info_update_pages (info_update_id, sort_order, body, photo) VALUES
  (
    update_id,
    0,
    E'What''s new in 1.1.1\n\n• Info Update — admin can broadcast multi-page announcements to all users (skip to hide forever).\n• Detail Quick Insert — clearer form order, remaining balance on sub category, PIC badges for Paid By, and smart suggestions while typing.\n• Overview charts — Spent vs Remaining as a horizontal bar; Plan Allocation pie filters By Category when tapped.\n• Transfer auto-checklist — matching Detail spends (same sub category + amount) check off transfer items automatically, either way.',
    NULL
  );
END $$;
