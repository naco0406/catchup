//! 카드와 답(design.md 7 · 8장). 모든 함수는 칸 하나의 거래 안에서 카드 줄을 잠그고 시작해요.

use chrono::{DateTime, Utc};
use sqlx::{PgConnection, types::Json};
use uuid::Uuid;

use crate::{
    crypto::sha256,
    db::{Db, emit},
    error::{Error, Result},
    model::{AnswerInput, Card, CardOption, NewCard, Receipt, Risk, Surface, Turn},
};

/// 밖으로 나가는 일을 기다리는 시간
pub const HOLD_SECS: f64 = 10.0;
const MAX_TEXT: usize = 20_000;
const MAX_TURNS: i32 = 50;

const CARD: &str = "id, kind, source, question, body, options, recommended, risk, reply_path, waiting, due_at, state, snooze_until, version, created_at";
const RECEIPT: &str = "id, card, effect, state, undoable, run_after, \
    GREATEST(0, (EXTRACT(EPOCH FROM (run_after - clock_timestamp())) * 1000)::bigint) AS remaining_ms, \
    error_code, created_at, finished_at";

async fn lock(conn: &mut PgConnection, id: Uuid) -> Result<Card> {
    sqlx::query_as(&format!("SELECT {CARD} FROM catchup.decision_cards WHERE id = $1 FOR UPDATE"))
        .bind(id)
        .fetch_optional(conn)
        .await?
        .ok_or(Error::NotFound)
}

async fn turns(conn: &mut PgConnection, id: Uuid) -> Result<Vec<Turn>> {
    Ok(sqlx::query_as("SELECT seq, said, work, reply, options, recommended FROM catchup.card_turns WHERE card = $1 ORDER BY seq")
        .bind(id)
        .fetch_all(conn)
        .await?)
}

fn validate(options: &[CardOption], recommended: i32) -> Result<()> {
    if options.is_empty() || options.len() > 5 {
        return Err(Error::Invalid("bad_options"));
    }
    let pick = usize::try_from(recommended).ok().and_then(|i| options.get(i)).ok_or(Error::Invalid("bad_recommended"))?;
    if pick.risk != Risk::Low {
        return Err(Error::Invalid("risky_recommended"));
    }
    Ok(())
}

/// 새 카드. 같은 열쇠로 두 번 와도 카드는 하나예요
pub async fn create(db: &Db, cell: Uuid, card: &NewCard) -> Result<Uuid> {
    let mut tx = db.cell_tx(cell).await?;
    let id = create_in(&mut tx, cell, card).await?;
    tx.commit().await?;
    Ok(id)
}

pub async fn create_in(conn: &mut PgConnection, cell: Uuid, card: &NewCard) -> Result<Uuid> {
    if card.kind != "fyi" {
        validate(&card.options, card.recommended)?;
    }
    let created: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO catchup.decision_cards AS d
           (cell, dedupe_key, kind, source, source_ref, source_version, question, body, options, recommended, risk, reply_path, waiting, due_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (cell, dedupe_key) DO NOTHING
         RETURNING d.id",
    )
    .bind(cell)
    .bind(&card.dedupe_key)
    .bind(&card.kind)
    .bind(Json(&card.source))
    .bind(&card.source_ref)
    .bind(&card.source_version)
    .bind(&card.question)
    .bind(Json(if card.body.is_null() { serde_json::json!({}) } else { card.body.clone() }))
    .bind(Json(&card.options))
    .bind(card.recommended)
    .bind(card.risk.as_str())
    .bind(&card.reply_path)
    .bind(card.waiting)
    .bind(card.due_at)
    .fetch_optional(&mut *conn)
    .await?;

    let Some(id) = created else {
        return Ok(sqlx::query_scalar("SELECT id FROM catchup.decision_cards WHERE dedupe_key = $1")
            .bind(&card.dedupe_key)
            .fetch_one(conn)
            .await?);
    };
    // 알림은 누가 기다리는 카드(바로)와 기한이 오늘인 카드에만. 기한이 뒤면 그날 아침 9시까지 기다려요
    sqlx::query(
        "INSERT INTO catchup.push_jobs (cell, card, card_version, run_after)
         SELECT d.cell, d.id, d.version,
           CASE WHEN d.waiting THEN now()
                WHEN (d.due_at AT TIME ZONE c.time_zone)::date <= (now() AT TIME ZONE c.time_zone)::date THEN now()
                ELSE ((d.due_at AT TIME ZONE c.time_zone)::date + time '09:00') AT TIME ZONE c.time_zone END
         FROM catchup.decision_cards d JOIN catchup.cells c ON c.cell = d.cell
         WHERE d.id = $1 AND d.kind <> 'fyi' AND (d.waiting OR d.due_at IS NOT NULL)
         ON CONFLICT DO NOTHING",
    )
    .bind(id)
    .execute(&mut *conn)
    .await?;
    emit(conn, "card", Some(id)).await?;
    Ok(id)
}

/// 카드가 누구 · 어느 일에 대한 것인지 — 기억을 찾는 열쇠예요. 코딩 에이전트의 카드는 저장소(일 이름), 나머지는 보낸 사람
pub fn subject(source: &serde_json::Value) -> String {
    let coding = matches!(source["type"].as_str(), Some("codex" | "claude"));
    source[if coding { "org" } else { "from" }].as_str().unwrap_or_default().to_owned()
}

pub async fn list(db: &Db, cell: Uuid, state: &str) -> Result<Vec<Card>> {
    if !matches!(state, "open" | "answered" | "snoozed" | "handed_off" | "expired" | "read") {
        return Err(Error::Invalid("bad_state"));
    }
    let mut tx = db.cell_tx(cell).await?;
    let mut cards: Vec<Card> = sqlx::query_as(&format!(
        "SELECT {CARD} FROM catchup.decision_cards WHERE state = $1 ORDER BY front_at DESC NULLS LAST, created_at, id LIMIT 200"
    ))
    .bind(state)
    .fetch_all(&mut *tx)
    .await?;
    let asking: Vec<(Uuid, String)> =
        cards.iter().filter(|c| state == "open" && c.kind != "fyi").map(|c| (c.id, subject(&c.source))).collect();
    let mut remembered = crate::memory::about_each(&mut tx, &asking, crate::memory::ON_CARD).await?;
    for card in &mut cards {
        card.turns = turns(&mut tx, card.id).await?;
        card.remembered = remembered.remove(&card.id).unwrap_or_default();
    }
    tx.commit().await?;
    Ok(cards)
}

async fn replayed(conn: &mut PgConnection, key: Uuid, hash: &[u8]) -> Result<Option<Uuid>> {
    let row: Option<(Uuid, Vec<u8>)> = sqlx::query_as("SELECT id, request_hash FROM catchup.card_answers WHERE request_key = $1")
        .bind(key)
        .fetch_optional(conn)
        .await?;
    match row {
        Some((id, stored)) if stored == hash => Ok(Some(id)),
        Some(_) => Err(Error::Conflict("request_key_reused")),
        None => Ok(None),
    }
}

pub async fn answer(db: &Db, cell: Uuid, id: Uuid, input: &AnswerInput) -> Result<Receipt> {
    let hash = sha256(&serde_json::to_vec(&(id, input)).map_err(|e| Error::Internal(e.into()))?);
    let mut tx = db.cell_tx(cell).await?;
    let card = lock(&mut tx, id).await?;

    if let Some(answer) = replayed(&mut tx, input.request_key, &hash).await? {
        let receipt = sqlx::query_as(&format!("SELECT {RECEIPT} FROM catchup.action_receipts WHERE answer = $1"))
            .bind(answer)
            .fetch_one(&mut *tx)
            .await?;
        tx.commit().await?;
        return Ok(receipt);
    }
    if card.state != "open" {
        return Err(Error::Conflict("card_not_open"));
    }
    if card.version != input.version {
        return Err(Error::Conflict("card_changed"));
    }
    let turns = turns(&mut tx, id).await?;
    if input.turn_seq != turns.last().map_or(0, |t| t.seq) {
        return Err(Error::Conflict("options_changed"));
    }
    let options = turns.last().and_then(|t| t.options.as_ref()).unwrap_or(&card.options);
    let chosen = usize::try_from(input.option).ok().and_then(|i| options.get(i)).ok_or(Error::Invalid("bad_option"))?;

    if chosen.risk != Risk::Low {
        // 위험한 답은 알림 단추로 못 해요. 화면에서는 한 번 더 확인해요
        if input.surface == Surface::Notification {
            return Err(Error::Invalid("risky_from_notification"));
        }
        if !input.confirmed {
            return Err(Error::ConfirmRequired);
        }
    } else if input.surface == Surface::Notification && card.risk != "low" {
        return Err(Error::Invalid("risky_from_notification"));
    }
    let effect = match input.draft.as_deref() {
        None => chosen.effect.clone(),
        Some(draft) if draft.trim().is_empty() || draft.len() > MAX_TEXT => return Err(Error::Invalid("bad_draft")),
        Some(draft) => chosen.effect.with_draft(draft).ok_or(Error::Invalid("draft_not_allowed"))?,
    };

    let answer: Uuid = sqlx::query_scalar(
        "INSERT INTO catchup.card_answers
           (cell, card, request_key, request_hash, card_version, kind, turn_seq, option_index, chosen, draft, surface)
         VALUES ($1, $2, $3, $4, $5, 'option', $6, $7, $8, $9, $10) RETURNING id",
    )
    .bind(cell)
    .bind(id)
    .bind(input.request_key)
    .bind(&hash)
    .bind(card.version)
    .bind(input.turn_seq)
    .bind(input.option)
    .bind(Json(chosen))
    .bind(&input.draft)
    .bind(input.surface.as_str())
    .fetch_one(&mut *tx)
    .await?;

    let now = effect.immediate();
    // clock_timestamp: 잠금을 기다린 시간만큼 10초가 줄지 않게
    let receipt: Receipt = sqlx::query_as(&format!(
        "INSERT INTO catchup.action_receipts (cell, card, answer, effect, undoable, source_ref, source_version, state, run_after, finished_at)
         SELECT cell, id, $2, $3, $4, source_ref, source_version, $5,
           clock_timestamp() + make_interval(secs => $6), CASE WHEN $7 THEN clock_timestamp() END
         FROM catchup.decision_cards WHERE id = $1
         RETURNING {RECEIPT}"
    ))
    .bind(id)
    .bind(answer)
    .bind(Json(&effect))
    .bind(effect.undoable())
    .bind(if now { "succeeded" } else { "waiting" })
    .bind(if now { 0.0 } else { HOLD_SECS })
    .bind(now)
    .fetch_one(&mut *tx)
    .await?;

    set_state(&mut tx, id, "answered", None, false).await?;
    tx.commit().await?;
    Ok(receipt)
}

pub async fn set_state(conn: &mut PgConnection, id: Uuid, state: &str, until: Option<DateTime<Utc>>, to_front: bool) -> Result<()> {
    sqlx::query(
        "UPDATE catchup.decision_cards
         SET state = $2, snooze_until = $3, version = version + 1, updated_at = now(),
             front_at = CASE WHEN $4 THEN clock_timestamp() ELSE front_at END
         WHERE id = $1",
    )
    .bind(id)
    .bind(state)
    .bind(until)
    .bind(to_front)
    .execute(&mut *conn)
    .await?;
    emit(conn, "card", Some(id)).await?;
    Ok(())
}

pub enum Aside {
    Snooze(DateTime<Utc>),
    Handoff,
    /// 알려만 드려요를 읽음으로 — 결정이 없는 소식만
    Read,
}

pub async fn put_aside(db: &Db, cell: Uuid, id: Uuid, key: Uuid, version: i32, aside: Aside, surface: Surface) -> Result<()> {
    let (kind, state, until) = match aside {
        Aside::Snooze(t) => ("snooze", "snoozed", Some(t)),
        Aside::Handoff => ("handoff", "handed_off", None),
        Aside::Read => ("read", "read", None),
    };
    let hash = sha256(format!("{id}:{version}:{kind}:{until:?}").as_bytes());
    let mut tx = db.cell_tx(cell).await?;
    let card = lock(&mut tx, id).await?;
    if replayed(&mut tx, key, &hash).await?.is_some() {
        return Ok(());
    }
    if card.state != "open" {
        return Err(Error::Conflict("card_not_open"));
    }
    if card.version != version {
        return Err(Error::Conflict("card_changed"));
    }
    if state == "read" && card.kind != "fyi" {
        // 결정이 필요한 카드는 읽음으로 넘길 수 없어요
        return Err(Error::Invalid("not_news"));
    }
    if until.is_some_and(|t| t <= Utc::now()) {
        return Err(Error::Invalid("bad_time"));
    }
    sqlx::query(
        "INSERT INTO catchup.card_answers (cell, card, request_key, request_hash, card_version, kind, surface) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(cell)
    .bind(id)
    .bind(key)
    .bind(&hash)
    .bind(version)
    .bind(kind)
    .bind(surface.as_str())
    .execute(&mut *tx)
    .await?;
    set_state(&mut tx, id, state, until, false).await?;
    tx.commit().await?;
    Ok(())
}

/// 되돌리기. `receipt` 를 주면 그 실행만 — 늦게 닿은 요청이 다음 답을 되돌리지 않게
pub async fn undo(db: &Db, cell: Uuid, id: Uuid, receipt: Option<Uuid>) -> Result<Card> {
    let mut tx = db.cell_tx(cell).await?;
    let card = lock(&mut tx, id).await?;
    match card.state.as_str() {
        "snoozed" | "handed_off" | "read" if receipt.is_none() => set_state(&mut tx, id, "open", None, true).await?,
        "answered" => undo_answer(&mut tx, id, receipt).await?,
        // 같은 되돌리기를 두 번 보낸 것
        "open" => {}
        _ => return Err(Error::Conflict("cannot_undo")),
    }
    let mut card = lock(&mut tx, id).await?;
    card.turns = turns(&mut tx, id).await?;
    tx.commit().await?;
    Ok(card)
}

async fn undo_answer(conn: &mut PgConnection, id: Uuid, wanted: Option<Uuid>) -> Result<()> {
    let last: Receipt = sqlx::query_as(&format!(
        "SELECT {RECEIPT} FROM catchup.action_receipts WHERE card = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE"
    ))
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?
    .ok_or(Error::Conflict("cannot_undo"))?;
    if wanted.is_some_and(|w| w != last.id) {
        return Err(Error::Conflict("receipt_changed"));
    }
    let next = match last.state.as_str() {
        "waiting" => "cancelled",
        "running" => return Err(Error::Conflict("too_late")),
        "reverting" => return Ok(()),
        "succeeded" if !last.undoable => return Err(Error::Conflict("too_late")),
        // 밖의 것을 바꾼 일은 일꾼이 영수증의 값으로 되돌린 다음에 카드를 열어요
        "succeeded" if matches!(last.effect.0, crate::model::Effect::Change { .. }) => {
            sqlx::query("UPDATE catchup.action_receipts SET state = 'reverting', lease_until = clock_timestamp() WHERE id = $1")
                .bind(last.id)
                .execute(&mut *conn)
                .await?;
            emit(conn, "receipt", Some(id)).await?;
            return Ok(());
        }
        "succeeded" => "reverted",
        _ => return Err(Error::Conflict("cannot_undo")),
    };
    sqlx::query("UPDATE catchup.action_receipts SET state = $2, finished_at = clock_timestamp() WHERE id = $1")
        .bind(last.id)
        .bind(next)
        .execute(&mut *conn)
        .await?;
    set_state(conn, id, "open", None, true).await
}

/// 말로 답하기. 3단계에서 LLM 창구가 붙기 전까지는 '말씀하신 대로'를 맨 위에 얹어요
pub async fn say(db: &Db, cell: Uuid, id: Uuid, key: Uuid, text: &str) -> Result<Card> {
    let said = text.trim();
    if said.is_empty() || said.len() > MAX_TEXT {
        return Err(Error::Invalid("bad_text"));
    }
    let mut tx = db.cell_tx(cell).await?;
    let mut card = lock(&mut tx, id).await?;
    let seen: Option<(Uuid, String)> =
        sqlx::query_as("SELECT card, said FROM catchup.card_turns WHERE request_key = $1").bind(key).fetch_optional(&mut *tx).await?;
    match seen {
        Some((c, s)) if c == id && s == said => {}
        Some(_) => return Err(Error::Conflict("request_key_reused")),
        None => {
            if card.state != "open" {
                return Err(Error::Conflict("card_not_open"));
            }
            let seq = turns(&mut tx, id).await?.last().map_or(0, |t| t.seq) + 1;
            if seq > MAX_TURNS {
                return Err(Error::Invalid("too_many_turns"));
            }
            let lang: String = sqlx::query_scalar("SELECT lang FROM catchup.cells").fetch_one(&mut *tx).await?;
            let risk = Risk::parse(&card.risk);
            let options = as_said(&lang, &card.options, card.recommended, risk, said)?;
            // 위험한 카드에서 추천은 '말씀하신 대로'가 아니라 처음 추천
            let recommended = if risk == Risk::Low { 0 } else { card.recommended + 1 };
            let source_ref: String =
                sqlx::query_scalar("SELECT source_ref FROM catchup.decision_cards WHERE id = $1").bind(id).fetch_one(&mut *tx).await?;
            let signed_in: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM catchup.codex_logins WHERE state = 'in')")
                .fetch_one(&mut *tx)
                .await?;
            let drafting = signed_in && crate::codex::drafts::applies(&source_ref, &card.options, card.recommended);
            sqlx::query(
                "INSERT INTO catchup.card_turns (cell, card, seq, request_key, said, options, recommended, drafting)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            )
            .bind(cell)
            .bind(id)
            .bind(seq)
            .bind(key)
            .bind(said)
            .bind(Json(options))
            .bind(recommended)
            .bind(drafting)
            .execute(&mut *tx)
            .await?;
            emit(&mut tx, "card", Some(id)).await?;
        }
    }
    card.turns = turns(&mut tx, id).await?;
    tx.commit().await?;
    Ok(card)
}

fn as_said(lang: &str, options: &[CardOption], recommended: i32, risk: Risk, said: &str) -> Result<Vec<CardOption>> {
    let base = usize::try_from(recommended).ok().and_then(|i| options.get(i)).ok_or(Error::Invalid("no_options"))?;
    let ko = lang == "ko";
    let first = CardOption {
        label: if ko { "말씀하신 대로 답해요" } else { "Answer the way you said" }.to_owned(),
        detail: format!("“{said}”"),
        // 말로 바꾼 답은 카드의 위험을 물려받아요: 위험한 카드에서는 늘 한 번 더 확인
        risk,
        done: if ko { format!("말한 대로 답했어요: “{said}”") } else { format!("Answered in your words: “{said}”") },
        effect: base.effect.as_said(said),
    };
    Ok(std::iter::once(first).chain(options.iter().take(4).cloned()).collect())
}

/// 알려만 → 카드로
pub async fn promote(db: &Db, cell: Uuid, id: Uuid) -> Result<Card> {
    let mut tx = db.cell_tx(cell).await?;
    let card = lock(&mut tx, id).await?;
    if card.kind == "fyi" {
        if card.state != "open" {
            return Err(Error::Conflict("card_not_open"));
        }
        let lang: String = sqlx::query_scalar("SELECT lang FROM catchup.cells").fetch_one(&mut *tx).await?;
        let ko = lang == "ko";
        let pair = |k: &str, e: &str| if ko { k } else { e }.to_owned();
        let option = |label: String, detail: String, done: String| CardOption {
            label,
            detail,
            risk: Risk::Low,
            done,
            effect: crate::model::Effect::None,
        };
        let options = [
            option(
                pair("확인했다고 표시해요", "Mark it as seen"),
                pair("아무것도 보내지 않아요", "Nothing is sent"),
                pair("확인했다고 표시했어요", "Marked as seen"),
            ),
            option(
                pair("내가 나중에 챙길게요", "I’ll take care of it"),
                pair("기록만 남겨요", "Only noted"),
                pair("직접 챙기기로 했어요", "Left for you"),
            ),
        ];
        sqlx::query(
            "UPDATE catchup.decision_cards
             SET kind = 'choose', body = body || jsonb_build_object('summary', jsonb_build_array(jsonb_build_object('text', question))),
                 question = $2, options = $3, recommended = 0
             WHERE id = $1",
        )
        .bind(id)
        .bind(pair("이 소식에 할 일이 있을까요?", "Anything to do about this?"))
        .bind(Json(&options))
        .execute(&mut *tx)
        .await?;
        set_state(&mut tx, id, "open", None, false).await?;
    }
    let mut card = lock(&mut tx, id).await?;
    card.turns = turns(&mut tx, id).await?;
    tx.commit().await?;
    Ok(card)
}
