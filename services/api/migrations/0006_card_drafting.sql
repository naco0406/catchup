-- 말로 답하면 '말씀하신 대로'가 바로 서고, 비서가 다듬은 선택지가 뒤따라와요(카드 판이 올라가요).
ALTER TABLE catchup.card_turns ADD COLUMN drafting boolean NOT NULL DEFAULT false;

CREATE FUNCTION front.cells_with_drafting() RETURNS TABLE (cell uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT t.cell FROM catchup.card_turns t JOIN catchup.cells c ON c.cell = t.cell AND c.state = 'active'
  WHERE t.drafting GROUP BY t.cell ORDER BY min(t.created_at) LIMIT 500
$$;
REVOKE ALL ON FUNCTION front.cells_with_drafting() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION front.cells_with_drafting() TO catchup_app;
CREATE INDEX card_turns_drafting ON catchup.card_turns (cell, created_at) WHERE drafting;
