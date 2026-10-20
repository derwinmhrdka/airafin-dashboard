-- Seed Info Update announcement for release 1.2 (text pages only, no photos).
DO $$
DECLARE
  update_id integer;
  stamp text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  IF EXISTS (SELECT 1 FROM info_updates WHERE title = 'New Update 1.2') THEN
    RETURN;
  END IF;

  UPDATE info_updates
  SET active = false, updated_at = stamp
  WHERE active = true;

  INSERT INTO info_updates (title, active, created_at, updated_at)
  VALUES ('New Update 1.2', true, stamp, stamp)
  RETURNING id INTO update_id;

  INSERT INTO info_update_pages (info_update_id, sort_order, body, photo) VALUES
  (
    update_id,
    0,
    E'What''s new in 1.2\n\n• Navigation switch — Settings lets you use Tab pane or Floating menu. Floating menu hides the tab bar.\n• Floating menu — the bottom button opens Overview, Detail, Transfer, Plan, and Settings in an even arc.\n• Donut — the button keeps a spent (dark gray) and remaining (light gray) ring. Idle shows the current page icon. Tap it to see the remaining percent. It updates when a transaction changes.',
    NULL
  );
END $$;
