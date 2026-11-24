//! 비서에게 말하기 — 명령이 들어오는 셋째 길(design.md 3-1장 '명령을 내리는 길').
//!
//! 말은 먼저 받아 두고(thinking), 모델은 갈래와 답만 정해요. 서버는 정해진 일만 해요:
//! - 기억해 → **내 말 그대로** 기억에 남겨요(모델이 쓴 글은 기억이 되지 않아요)
//! - 물어봐 → 답만 해요. 아무것도 바꾸지 않아요
//! - 일 맡겨 → 제안까지만. 내가 눌러야 코딩 세션이 생겨요
//! - 카드 → 그 카드를 찾아 주기만. 내가 눌러야 내 말이 그 카드의 답(말로 답하기)으로 가고, 그 뒤는 카드의 규칙 그대로예요
//!
//! 모델에 닿지 못해도 말은 남고, 그대로 기억해 둘 수 있어요.
//!
//! 덱에서 한 말은 그때 보고 있던 카드(`seen_card`)를 같이 남겨요. '이 사람' · '이 카드'를 그 카드로 풀기 위한 것이고,
//! 그것만으로는 카드에 아무 일도 일어나지 않아요.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgConnection;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    codex::{
        repo,
        request::visible,
        sessions::{self, StartInput},
    },
    db::{Db, emit},
    error::{Error, Result},
    watch,
};

const MAX_WORDS: usize = 2000;
const MAX_NOTE: usize = 600;
const MAX_REPLY: usize = 1200;
/// 답을 기다리는 말은 이만큼까지(모델 한도를 한꺼번에 쓰지 않게)
const MAX_THINKING: i64 = 5;
const SHOWN: i64 = 30;

/// 비서와 주고받은 한 번
#[derive(Clone, Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct Message {
    pub id: Uuid,
    pub said: String,
    /// thinking · done · failed
    pub state: String,
    /// remember · ask · task · card · unclear
    pub intent: Option<String>,
    pub reply: Option<String>,
    /// 맡길 일의 제안. `session` 이 없으면 아직 맡기지 않은 것이에요
    pub task: Option<String>,
    pub repo: Option<String>,
    /// 이 말로 생긴 기억의 key. 지웠으면 없어요
    pub memory: Option<String>,
    pub session: Option<Uuid>,
    /// 이 말이 가리킨 카드와 그 질문
    pub card: Option<Uuid>,
    pub card_question: Option<String>,
    /// 가리킨 카드에 이 말을 전했어요
    pub accepted: bool,
    /// 이 말이 제안한 감시 규칙(갈래가 watch 일 때). 내가 켜기 전까지 state 는 proposed 예요
    #[sqlx(json(nullable))]
    #[schema(value_type = Option<watch::Rule>)]
    pub watch: Option<watch::Rule>,
    pub error_code: Option<String>,
    pub created_at: DateTime<Utc>,
}

const VIEW: &str = "m.id, m.said, m.state, m.intent, m.reply, m.task, m.repo, \
    CASE WHEN m.note IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catchup.memory_edits e \
      WHERE e.cell = m.cell AND e.key = 'note:' || m.note AND e.state = 'forgotten') THEN 'note:' || m.note END AS memory, \
    m.session, m.card, (SELECT d.question FROM catchup.decision_cards d WHERE d.cell = m.cell AND d.id = m.card) AS card_question, \
    m.accepted_at IS NOT NULL AS accepted, \
    (SELECT jsonb_build_object('id', w.id, 'kind', w.kind, 'value', w.value, 'lane', w.lane, 'until', w.until, 'state', \
      CASE WHEN w.state = 'proposed' AND w.until <= now() THEN 'stopped' ELSE w.state END, 'created_at', w.created_at) \
      FROM catchup.watch_rules w WHERE w.cell = m.cell AND w.message = m.id) AS watch, \
    m.error_code, m.created_at";

/// 모델이 정한 것. 믿지 않는 값이라 서버가 다시 걸러요
#[derive(Clone, Debug, Default, Deserialize)]
pub struct Routed {
    pub intent: String,
    #[serde(default)]
    pub reply: String,
    #[serde(default)]
    pub task: String,
    #[serde(default)]
    pub repo: String,
    /// 가리킨 카드(모델은 번호만 고르고, 부르는 쪽이 id 로 바꿔 넣어요)
    #[serde(skip)]
    pub card: Option<Uuid>,
    /// 기억할 것이 '보고 있던 카드의 사람 · 일'에 대한 것인지. 보고 있던 카드가 없으면 쓰지 않아요
    #[serde(default, rename = "about_looking_at")]
    pub about_seen: bool,
    /// 감시 규칙(갈래가 watch 일 때만). 서버가 `watch::clean` 으로 다시 걸러요
    #[serde(default)]
    pub watch: watch::Asked,
}

#[derive(Deserialize, ToSchema)]
pub struct SayInput {
    pub request_key: Uuid,
    pub text: String,
    /// 말할 때 화면에 있던 카드(덱에서 말했을 때)
    pub card: Option<Uuid>,
}

/// 말할 때 보고 있던 카드
pub struct Seen {
    pub card: Uuid,
    /// 그 카드의 사람 · 일
    pub subject: String,
    pub question: String,
    /// 지금도 정할 수 있는 카드인지
    pub open: bool,
}

pub async fn looking_at(conn: &mut PgConnection, id: Uuid) -> Result<Option<Seen>> {
    let found: Option<(Uuid, String, serde_json::Value, bool)> = sqlx::query_as(
        "SELECT d.id, d.question, d.source, d.state = 'open' AND d.kind <> 'fyi'
         FROM catchup.assistant_messages m JOIN catchup.decision_cards d ON d.cell = m.cell AND d.id = m.seen_card WHERE m.id = $1",
    )
    .bind(id)
    .fetch_optional(conn)
    .await?;
    Ok(found.map(|(card, question, source, open)| Seen { card, subject: crate::cards::subject(&source), question, open }))
}

fn clip(text: &str, max: usize) -> String {
    let text = visible(text.trim());
    if text.chars().count() <= max { text } else { format!("{}…", text.chars().take(max).collect::<String>()) }
}

async fn one(conn: &mut PgConnection, id: Uuid) -> Result<Message> {
    sqlx::query_as(&format!("SELECT {VIEW} FROM catchup.assistant_messages m WHERE m.id = $1"))
        .bind(id)
        .fetch_optional(conn)
        .await?
        .ok_or(Error::NotFound)
}

/// 말을 받아 둬요. 같은 요청이 다시 와도 하나예요
pub async fn say(db: &Db, cell: Uuid, request_key: Uuid, text: &str) -> Result<Message> {
    say_at(db, cell, request_key, text, None).await
}

/// 덱에서 한 말 — 그때 보고 있던 카드를 같이 남겨요. 이 칸의 카드가 아니면 없는 것으로 쳐요
pub async fn say_at(db: &Db, cell: Uuid, request_key: Uuid, text: &str, on_screen: Option<Uuid>) -> Result<Message> {
    let text = text.trim();
    if text.is_empty() || text.chars().count() > MAX_WORDS || text.contains('\0') {
        return Err(Error::Invalid("bad_words"));
    }
    let mut tx = db.cell_tx(cell).await?;
    let seen: Option<Uuid> = sqlx::query_scalar("SELECT id FROM catchup.assistant_messages WHERE request_key = $1")
        .bind(request_key)
        .fetch_optional(&mut *tx)
        .await?;
    let id = match seen {
        Some(id) => id,
        None => {
            let thinking: i64 = sqlx::query_scalar("SELECT count(*) FROM catchup.assistant_messages WHERE state = 'thinking'")
                .fetch_one(&mut *tx)
                .await?;
            if thinking >= MAX_THINKING {
                return Err(Error::Conflict("still_thinking"));
            }
            let id = sqlx::query_scalar(
                "INSERT INTO catchup.assistant_messages (cell, request_key, said, seen_card)
                 VALUES ($1, $2, $3, (SELECT d.id FROM catchup.decision_cards d WHERE d.id = $4)) RETURNING id",
            )
            .bind(cell)
            .bind(request_key)
            .bind(text)
            .bind(on_screen)
            .fetch_one(&mut *tx)
            .await?;
            emit(&mut tx, "assistant", None).await?;
            id
        }
    };
    let message = one(&mut tx, id).await?;
    tx.commit().await?;
    Ok(message)
}

/// 바로 앞에 주고받은 것(말을 이어 가게). 기억을 지운 뒤에는 그전의 대화를 넣지 않아요 —
/// 지운 것이 앞선 대화를 타고 모델에 다시 들어가면 '지우면 다음부터 쓰지 않아요'가 깨져요(2026-11-22 평가 11번에서 발견)
pub async fn earlier(conn: &mut PgConnection) -> Result<Vec<(String, Option<String>)>> {
    let mut rows: Vec<(String, Option<String>)> = sqlx::query_as(
        "SELECT said, reply FROM catchup.assistant_messages
         WHERE state = 'done' AND created_at > now() - interval '1 hour'
           AND created_at > COALESCE((SELECT max(updated_at) FROM catchup.memory_edits WHERE state = 'forgotten'), '-infinity')
         ORDER BY created_at DESC LIMIT 4",
    )
    .fetch_all(conn)
    .await?;
    rows.reverse();
    Ok(rows)
}

/// 최근에 주고받은 것(오래된 것부터)
pub async fn list(db: &Db, cell: Uuid) -> Result<Vec<Message>> {
    let mut tx = db.cell_tx(cell).await?;
    let mut rows: Vec<Message> =
        sqlx::query_as(&format!("SELECT {VIEW} FROM catchup.assistant_messages m ORDER BY m.created_at DESC, m.id LIMIT $1"))
            .bind(SHOWN)
            .fetch_all(&mut *tx)
            .await?;
    tx.commit().await?;
    rows.reverse();
    Ok(rows)
}

#[derive(sqlx::FromRow)]
struct Held {
    said: String,
    state: String,
    intent: Option<String>,
    note: Option<Uuid>,
    session: Option<Uuid>,
    task: Option<String>,
    repo: Option<String>,
    card: Option<Uuid>,
    accepted: bool,
    ko: bool,
}

async fn hold(conn: &mut PgConnection, id: Uuid) -> Result<Held> {
    sqlx::query_as(
        "SELECT m.said, m.state, m.intent, m.note, m.session, m.task, m.repo, m.card, m.accepted_at IS NOT NULL AS accepted, c.lang = 'ko' AS ko
         FROM catchup.assistant_messages m JOIN catchup.cells c ON c.cell = m.cell WHERE m.id = $1 FOR UPDATE OF m",
    )
    .bind(id)
    .fetch_optional(conn)
    .await?
    .ok_or(Error::NotFound)
}

/// 내 말 그대로 기억에. 같은 말은 한 번만 남아요. `subject` 는 누구 · 어느 일에 대한 것인지(비면 두루 쓰는 것)
async fn remember(conn: &mut PgConnection, cell: Uuid, id: Uuid, said: &str, subject: &str) -> Result<Uuid> {
    let text: String = said.chars().take(MAX_NOTE).collect();
    sqlx::query(
        "INSERT INTO catchup.memory_notes (cell, request_key, text, subject) VALUES ($1, $2, $3, $4)
         ON CONFLICT (cell, request_key) DO NOTHING",
    )
    .bind(cell)
    .bind(id)
    .bind(text)
    .bind(subject.chars().take(200).collect::<String>())
    .execute(&mut *conn)
    .await?;
    Ok(sqlx::query_scalar("SELECT id FROM catchup.memory_notes WHERE request_key = $1").bind(id).fetch_one(conn).await?)
}

/// 기억했다는 말은 서버가 써요. 누구의 것으로 남겼는지도 말해요
fn remembered(ko: bool, subject: &str) -> String {
    let subject = visible(subject.trim());
    match (ko, subject.is_empty()) {
        (true, true) => "기억했어요. 다음 초안과 맡긴 일에 써요.".to_owned(),
        (false, true) => "Got it. I'll use this in future drafts and tasks.".to_owned(),
        (true, false) => format!("{subject}에 대한 것으로 기억했어요. 다음 초안과 맡긴 일에 써요."),
        (false, false) => format!("Got it. I'll keep this for {subject} and use it in future drafts and tasks."),
    }
}

async fn finish(
    conn: &mut PgConnection,
    id: Uuid,
    intent: &str,
    reply: &str,
    task: Option<&str>,
    repo: Option<&str>,
    note: Option<Uuid>,
) -> Result<()> {
    sqlx::query(
        "UPDATE catchup.assistant_messages SET state = 'done', intent = $2, reply = $3, task = $4, repo = $5, note = $6,
           error_code = NULL, answered_at = COALESCE(answered_at, now()) WHERE id = $1",
    )
    .bind(id)
    .bind(intent)
    .bind(reply)
    .bind(task)
    .bind(repo)
    .bind(note)
    .execute(&mut *conn)
    .await?;
    emit(conn, "assistant", None).await?;
    Ok(())
}

/// 규칙이 끝나는 날을 그 칸의 시간대로(12월 1일 · Dec 1)
async fn until_day(conn: &mut PgConnection, rule: &watch::Rule, ko: bool) -> Result<String> {
    let (month, day): (i32, i32) = sqlx::query_as(
        "SELECT EXTRACT(MONTH FROM $1 AT TIME ZONE c.time_zone)::int, EXTRACT(DAY FROM $1 AT TIME ZONE c.time_zone)::int
         FROM catchup.cells c WHERE c.cell = catchup.current_cell()",
    )
    .bind(rule.until)
    .fetch_one(conn)
    .await?;
    const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    Ok(if ko { format!("{month}월 {day}일") } else { format!("{} {day}", MONTHS[(month.clamp(1, 12) - 1) as usize]) })
}

/// 가리킬 수 있는 카드인지 — 이 칸의, 열려 있는, 정할 일이 있는 카드만
async fn open_card(conn: &mut PgConnection, card: Option<Uuid>) -> Result<bool> {
    let Some(card) = card else { return Ok(false) };
    Ok(sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM catchup.decision_cards WHERE id = $1 AND state = 'open' AND kind <> 'fyi')")
        .bind(card)
        .fetch_one(conn)
        .await?)
}

/// 모델이 정한 갈래대로 처리해요. 이미 처리된 말에는 얹지 않아요
pub async fn settle(db: &Db, cell: Uuid, id: Uuid, routed: &Routed) -> Result<()> {
    let mut tx = db.cell_tx(cell).await?;
    let held = hold(&mut tx, id).await?;
    if held.state != "thinking" {
        return Ok(());
    }
    let task = clip(&routed.task, MAX_WORDS);
    match routed.intent.as_str() {
        "remember" => {
            // 누구의 것인지는 서버가 아는 카드에서만 와요. 모델은 '보고 있던 카드의 것인지'만 골라요
            let subject = match routed.about_seen {
                true => looking_at(&mut tx, id).await?.map(|seen| seen.subject).unwrap_or_default(),
                false => String::new(),
            };
            let note = remember(&mut tx, cell, id, &held.said, &subject).await?;
            finish(&mut tx, id, "remember", &remembered(held.ko, &subject), None, None, Some(note)).await?;
        }
        "card" if open_card(&mut tx, routed.card).await? => {
            let reply = if held.ko { "이 카드에 그렇게 답할까요?" } else { "Answer this card that way?" };
            finish(&mut tx, id, "card", reply, None, None, None).await?;
            sqlx::query("UPDATE catchup.assistant_messages SET card = $2 WHERE id = $1")
                .bind(id)
                .bind(routed.card)
                .execute(&mut *tx)
                .await?;
        }
        "watch" if watch::clean(&routed.watch).is_some() => {
            let clean = watch::clean(&routed.watch).expect("checked");
            let rule = watch::propose(&mut tx, cell, id, &clean).await?;
            let day = until_day(&mut tx, &rule, held.ko).await?;
            finish(&mut tx, id, "watch", &watch::proposal(held.ko, &rule, &day), None, None, None).await?;
        }
        "task" if !task.is_empty() => {
            let reply = if held.ko { "코딩 세션으로 맡길까요?" } else { "Start a coding session for this?" };
            finish(&mut tx, id, "task", reply, Some(&task), repo::parse(&routed.repo).as_deref(), None).await?;
        }
        intent => {
            let reply = clip(&routed.reply, MAX_REPLY);
            let (intent, reply) = match (intent, reply.is_empty()) {
                ("ask", false) => ("ask", reply),
                (_, false) => ("unclear", reply),
                (_, true) if held.ko => {
                    ("unclear", "무엇을 할지 잘 모르겠어요. 기억할 것, 궁금한 것, 맡길 일을 말해 주세요.".to_owned())
                }
                (_, true) => ("unclear", "I'm not sure what to do. Tell me something to remember, ask, or hand off.".to_owned()),
            };
            finish(&mut tx, id, intent, &reply, None, None, None).await?;
        }
    }
    tx.commit().await?;
    Ok(())
}

/// 모델에 닿지 못했어요. 말은 남아요
pub async fn fail(db: &Db, cell: Uuid, id: Uuid, code: &str) -> Result<()> {
    let mut tx = db.cell_tx(cell).await?;
    let changed = sqlx::query(
        "UPDATE catchup.assistant_messages SET state = 'failed', error_code = $2, answered_at = now() WHERE id = $1 AND state = 'thinking'",
    )
    .bind(id)
    .bind(code)
    .execute(&mut *tx)
    .await?;
    if changed.rows_affected() == 1 {
        emit(&mut tx, "assistant", None).await?;
    }
    tx.commit().await?;
    Ok(())
}

/// 답을 기다리지 않고 내 말 그대로 기억해 둬요
pub async fn keep(db: &Db, cell: Uuid, id: Uuid) -> Result<Message> {
    let mut tx = db.cell_tx(cell).await?;
    let held = hold(&mut tx, id).await?;
    if held.session.is_some() {
        return Err(Error::Conflict("nothing_to_keep"));
    }
    if held.note.is_none() {
        // 갈래를 모르는 채로 남기는 말이에요. 카드를 보며 한 말이면 그 사람의 것으로 둬요 — '이 사람은…'이 모두에게 퍼지지 않게
        let subject = looking_at(&mut tx, id).await?.map(|seen| seen.subject).unwrap_or_default();
        let note = remember(&mut tx, cell, id, &held.said, &subject).await?;
        finish(&mut tx, id, "remember", &remembered(held.ko, &subject), None, None, Some(note)).await?;
    }
    let message = one(&mut tx, id).await?;
    tx.commit().await?;
    Ok(message)
}

/// 제안을 받아들여요. 일 → 코딩 세션이 생겨요 · 카드 → 내 말이 그 카드의 답으로 가요. 두 번 눌러도 한 번만이에요
pub async fn accept(db: &Db, cell: Uuid, id: Uuid) -> Result<Message> {
    let mut tx = db.cell_tx(cell).await?;
    let held = hold(&mut tx, id).await?;
    tx.commit().await?;
    match (held.intent.as_deref(), held.task, held.card) {
        (Some("task"), Some(task), _) => {
            if held.session.is_none() {
                let started = sessions::create(db, cell, &StartInput { request_key: id, task, repo: held.repo }).await?;
                let mut tx = db.cell_tx(cell).await?;
                sqlx::query("UPDATE catchup.assistant_messages SET session = $2 WHERE id = $1 AND session IS NULL")
                    .bind(id)
                    .bind(started.id)
                    .execute(&mut *tx)
                    .await?;
                emit(&mut tx, "assistant", None).await?;
                tx.commit().await?;
            }
        }
        (Some("card"), _, Some(card)) => {
            if !held.accepted {
                // 말로 답하기와 같은 길 — 위험한 카드에서 말이 승인이 되지 않는 규칙도 그대로예요
                crate::cards::say(db, cell, card, id, &held.said).await?;
                let mut tx = db.cell_tx(cell).await?;
                sqlx::query("UPDATE catchup.decision_cards SET front_at = clock_timestamp() WHERE id = $1 AND state = 'open'")
                    .bind(card)
                    .execute(&mut *tx)
                    .await?;
                sqlx::query("UPDATE catchup.assistant_messages SET accepted_at = now() WHERE id = $1 AND accepted_at IS NULL")
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                emit(&mut tx, "card", Some(card)).await?;
                emit(&mut tx, "assistant", None).await?;
                tx.commit().await?;
            }
        }
        (Some("watch"), _, _) => {
            // 감시 규칙을 켜요. 이 말이 제안한 규칙만, 끝나는 날 전에만
            let mut tx = db.cell_tx(cell).await?;
            let rule = watch::of_message(&mut tx, id).await?.ok_or(Error::Conflict("nothing_to_accept"))?;
            watch::start(&mut tx, rule.id).await?;
            sqlx::query("UPDATE catchup.assistant_messages SET accepted_at = now() WHERE id = $1 AND accepted_at IS NULL")
                .bind(id)
                .execute(&mut *tx)
                .await?;
            emit(&mut tx, "assistant", None).await?;
            tx.commit().await?;
        }
        _ => return Err(Error::Conflict("nothing_to_accept")),
    }
    let mut tx = db.cell_tx(cell).await?;
    let message = one(&mut tx, id).await?;
    tx.commit().await?;
    Ok(message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replies_are_clipped_and_hidden_characters_shown() {
        assert_eq!(clip("  네  ", 10), "네");
        assert_eq!(clip("가나다라", 2), "가나…");
        assert!(clip("a\u{202e}b", 10).contains("\\u{202e}"));
    }
}
