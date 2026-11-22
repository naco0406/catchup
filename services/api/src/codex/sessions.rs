//! 코딩 세션의 표. 프로세스는 모르고 DB 만 만져요.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgConnection, types::Json};
use utoipa::ToSchema;
use uuid::Uuid;

use super::{account, repo};
use crate::{
    cards,
    db::{Db, emit},
    error::{Error, Result},
    model::{CardOption, Effect, NewCard, Risk},
};

const MAX_TASK: usize = 20_000;
/// 칸 하나가 줄까지 합쳐 가질 수 있는 세션
const MAX_OPEN: i64 = 5;

#[derive(Debug, Deserialize, ToSchema)]
pub struct StartInput {
    pub request_key: Uuid,
    pub task: String,
    /// `owner/name` · GitHub 주소. 없으면 빈 작업 폴더
    #[serde(default)]
    pub repo: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct AgentSession {
    pub id: Uuid,
    pub agent: String,
    pub title: String,
    pub repo: Option<String>,
    pub state: String,
    pub error_code: Option<String>,
    pub summary: Option<String>,
    pub has_patch: bool,
    pub cancel_wanted: bool,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
}

const VIEW: &str = "id, agent, title, repo, state, error_code, summary, COALESCE(patch, '') <> '' AS has_patch, cancel_wanted, \
    created_at, started_at, updated_at, finished_at";

pub fn title_of(task: &str) -> String {
    let line = task.trim().lines().next().unwrap_or_default().trim();
    let title: String = super::request::visible(line).chars().take(80).collect();
    if line.chars().count() > 80 { format!("{title}…") } else { title }
}

pub async fn create(db: &Db, cell: Uuid, input: &StartInput) -> Result<AgentSession> {
    let task = input.task.trim();
    if task.is_empty() || task.len() > MAX_TASK || task.contains('\0') {
        return Err(Error::Invalid("bad_task"));
    }
    let repo = match input.repo.as_deref().map(str::trim).filter(|r| !r.is_empty()) {
        Some(given) => Some(repo::parse(given).ok_or(Error::Invalid("bad_repo"))?),
        None => None,
    };
    let signed_in = account::load_status(db, cell).await? == "in";
    let mut tx = db.cell_tx(cell).await?;
    let seen: Option<AgentSession> = sqlx::query_as(&format!("SELECT {VIEW} FROM catchup.agent_sessions WHERE request_key = $1"))
        .bind(input.request_key)
        .fetch_optional(&mut *tx)
        .await?;
    if let Some(seen) = seen {
        return Ok(seen);
    }
    if !signed_in {
        return Err(Error::Conflict("signed_out"));
    }
    let open: i64 =
        sqlx::query_scalar("SELECT count(*) FROM catchup.agent_sessions WHERE state NOT IN ('done', 'failed', 'cancelled')")
            .fetch_one(&mut *tx)
            .await?;
    if open >= MAX_OPEN {
        return Err(Error::Conflict("too_many_sessions"));
    }
    let session = sqlx::query_as(&format!(
        "INSERT INTO catchup.agent_sessions (cell, request_key, title, task, repo) VALUES ($1, $2, $3, $4, $5) RETURNING {VIEW}"
    ))
    .bind(cell)
    .bind(input.request_key)
    .bind(title_of(task))
    .bind(task)
    .bind(repo)
    .fetch_one(&mut *tx)
    .await?;
    emit(&mut tx, "session", None).await?;
    tx.commit().await?;
    Ok(session)
}

pub async fn list(db: &Db, cell: Uuid) -> Result<Vec<AgentSession>> {
    let mut tx = db.cell_tx(cell).await?;
    let rows = sqlx::query_as(&format!(
        "SELECT {VIEW} FROM catchup.agent_sessions ORDER BY finished_at DESC NULLS FIRST, created_at DESC LIMIT 50"
    ))
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(rows)
}

pub async fn patch(db: &Db, cell: Uuid, id: Uuid) -> Result<String> {
    let mut tx = db.cell_tx(cell).await?;
    let patch: Option<Option<String>> =
        sqlx::query_scalar("SELECT patch FROM catchup.agent_sessions WHERE id = $1").bind(id).fetch_optional(&mut *tx).await?;
    tx.commit().await?;
    patch.flatten().ok_or(Error::NotFound)
}

pub async fn cancel(db: &Db, cell: Uuid, id: Uuid) -> Result<()> {
    let mut tx = db.cell_tx(cell).await?;
    let found = sqlx::query(
        "UPDATE catchup.agent_sessions
         SET cancel_wanted = cancel_wanted OR state NOT IN ('done', 'failed', 'cancelled'), updated_at = now()
         WHERE id = $1",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if found.rows_affected() == 0 {
        return Err(Error::NotFound);
    }
    emit(&mut tx, "session", None).await?;
    tx.commit().await?;
    Ok(())
}

// ─── 에이전트 일꾼이 쓰는 것

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct Session {
    pub id: Uuid,
    pub title: String,
    pub task: String,
    pub repo: Option<String>,
    pub state: String,
    pub outcome: Option<String>,
    pub cancel_wanted: bool,
    pub slot: Option<i32>,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub boot: Option<Uuid>,
    pub sandbox_boot: Option<Uuid>,
    pub resumes: i32,
    pub summary: Option<String>,
    pub error_code: Option<String>,
}

pub const SESSION: &str =
    "id, title, task, repo, state, outcome, cancel_wanted, slot, thread_id, turn_id, boot, sandbox_boot, resumes, summary, error_code";

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct Request {
    pub id: Uuid,
    pub boot: Uuid,
    pub rpc_id: Json<Value>,
    pub kind: String,
    pub question_id: String,
    pub params: Json<Value>,
    pub answer: Option<Json<Value>>,
    pub state: String,
}

pub const REQUEST: &str = "id, boot, rpc_id, kind, question_id, params, answer, state";

pub async fn active(db: &Db, cell: Uuid) -> Result<Vec<Session>> {
    let mut tx = db.cell_tx(cell).await?;
    let rows = sqlx::query_as(&format!(
        "SELECT {SESSION} FROM catchup.agent_sessions WHERE state NOT IN ('done', 'failed', 'cancelled') ORDER BY created_at, id"
    ))
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(rows)
}

pub async fn open_requests(db: &Db, cell: Uuid, session: Uuid) -> Result<Vec<Request>> {
    let mut tx = db.cell_tx(cell).await?;
    let rows = sqlx::query_as(&format!(
        "SELECT {REQUEST} FROM catchup.agent_requests WHERE session = $1 AND state IN ('waiting', 'answered') ORDER BY created_at, id"
    ))
    .bind(session)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(rows)
}

pub async fn set_state(conn: &mut PgConnection, id: Uuid, state: &str, error: Option<&str>) -> Result<()> {
    let changed = sqlx::query(
        "UPDATE catchup.agent_sessions SET state = $2, error_code = $3, updated_at = now()
         WHERE id = $1 AND (state, COALESCE(error_code, '')) IS DISTINCT FROM ($2, COALESCE($3, ''))
           AND state NOT IN ('finishing', 'done', 'failed', 'cancelled')",
    )
    .bind(id)
    .bind(state)
    .bind(error)
    .execute(&mut *conn)
    .await?;
    if changed.rows_affected() == 1 {
        emit(conn, "session", None).await?;
    }
    Ok(())
}

/// 차례가 끝났어요. 남은 요청은 닫고 카드도 닫아요
pub async fn finishing(conn: &mut PgConnection, id: Uuid, outcome: &str, error: Option<&str>, summary: Option<&str>) -> Result<()> {
    let changed = sqlx::query(
        "UPDATE catchup.agent_sessions
         SET state = 'finishing', outcome = $2, error_code = $3, summary = COALESCE($4, summary), updated_at = now()
         WHERE id = $1 AND state NOT IN ('finishing', 'done', 'failed', 'cancelled')",
    )
    .bind(id)
    .bind(outcome)
    .bind(error)
    .bind(summary)
    .execute(&mut *conn)
    .await?;
    if changed.rows_affected() == 1 {
        close_requests(conn, id).await?;
        emit(conn, "session", None).await?;
    }
    Ok(())
}

pub async fn close_requests(conn: &mut PgConnection, session: Uuid) -> Result<()> {
    let unanswered: Vec<Uuid> = sqlx::query_scalar("SELECT card FROM catchup.agent_requests WHERE session = $1 AND state = 'waiting'")
        .bind(session)
        .fetch_all(&mut *conn)
        .await?;
    sqlx::query(
        "UPDATE catchup.agent_requests SET state = 'closed' WHERE session = $1 AND state IN ('waiting', 'answered', 'preapproved')",
    )
    .bind(session)
    .execute(&mut *conn)
    .await?;
    for card in unanswered {
        let open: Option<Uuid> =
            sqlx::query_scalar("SELECT id FROM catchup.decision_cards WHERE id = $1 AND state IN ('open', 'snoozed') FOR UPDATE")
                .bind(card)
                .fetch_optional(&mut *conn)
                .await?;
        if let Some(card) = open {
            cards::set_state(&mut *conn, card, "expired", None, false).await?;
        }
    }
    Ok(())
}

/// 끝남 — 잘 끝나면 알려만, 실패면 카드
pub async fn finished(db: &Db, cell: Uuid, session: &Session, outcome: &str, patch: Option<&str>, error: Option<&str>) -> Result<()> {
    let mut tx = db.cell_tx(cell).await?;
    let changed = sqlx::query(
        "UPDATE catchup.agent_sessions
         SET state = $2, patch = $3, error_code = $4, finished_at = now(), updated_at = now()
         WHERE id = $1 AND state = 'finishing'",
    )
    .bind(session.id)
    .bind(outcome)
    .bind(patch)
    .bind(error)
    .execute(&mut *tx)
    .await?;
    if changed.rows_affected() == 0 {
        return Ok(());
    }
    if outcome != "cancelled" {
        let lang: String = sqlx::query_scalar("SELECT lang FROM catchup.cells").fetch_one(&mut *tx).await?;
        let ko = lang == "ko";
        let say = |k: &str, e: &str| if ko { k } else { e }.to_owned();
        let good = outcome == "done";
        let key = format!("codex-session:{}:end", session.id);
        let question = match (good, ko) {
            (true, true) => format!("Codex가 일을 마쳤어요: {}", session.title),
            (true, false) => format!("Codex finished: {}", session.title),
            (false, true) => format!("Codex가 일을 마치지 못했어요: {}", session.title),
            (false, false) => format!("Codex couldn’t finish: {}", session.title),
        };
        let mut summary = vec![];
        if let Some(text) = session.summary.as_deref() {
            let short: String = super::request::visible(text).chars().take(600).collect();
            summary.push(serde_json::json!({ "text": short }));
        }
        if patch.is_some_and(|p| !p.is_empty()) {
            let text = say("여기까지 바뀐 것은 코딩 세션 화면에 남겨 뒀어요.", "The changes are saved under Coding sessions.");
            summary.push(serde_json::json!({ "text": text, "dim": true }));
        }
        let ok = CardOption {
            label: say("알겠어요", "Got it"),
            detail: say("아무것도 실행하지 않아요", "Nothing runs"),
            risk: Risk::Low,
            done: say("확인했어요", "Noted"),
            effect: Effect::None,
        };
        let card = NewCard {
            dedupe_key: key.clone(),
            kind: if good { "fyi" } else { "failed" }.into(),
            source: serde_json::json!({ "type": "codex", "from": "Codex", "org": session.repo }),
            source_ref: key,
            source_version: "1".into(),
            question,
            body: serde_json::json!({ "summary": summary, "failed": { "code": error } }),
            options: if good { vec![] } else { vec![ok] },
            recommended: 0,
            risk: Risk::Low,
            reply_path: "none".into(),
            waiting: !good,
            due_at: None,
        };
        cards::create_in(&mut tx, cell, &card).await?;
    }
    emit(&mut tx, "session", None).await?;
    tx.commit().await?;
    Ok(())
}
