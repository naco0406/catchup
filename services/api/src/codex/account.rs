//! 로그인 상태(표 `codex_logins`). 토큰 · 코드는 칸 키로 잠가서만 DB 에 둬요.

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::types::Json;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    cards,
    crypto::Key,
    db::{Db, emit},
    error::{Error, Result},
    model::{CardOption, Effect, NewCard, Risk},
    vault,
};

const AUTH: &str = "codex-auth";
const CODE: &str = "codex-code";

#[derive(Debug, Serialize, ToSchema)]
pub struct CodexStatus {
    pub state: String,
    /// 기다리는 동안만. ChatGPT 화면에 넣을 코드
    pub code: Option<String>,
    pub verification_url: Option<String>,
    pub plan: Option<String>,
    #[schema(value_type = Option<Object>)]
    pub limits: Option<Value>,
    pub error_code: Option<String>,
    pub busy: bool,
    pub updated_at: Option<DateTime<Utc>>,
}

type SealedAuth = (Option<Vec<u8>>, Option<Vec<u8>>);
type StatusRow = (String, Option<Vec<u8>>, Option<String>, Option<String>, Option<Json<Value>>, Option<String>, bool, DateTime<Utc>);

pub async fn status(db: &Db, master: &Key, cell: Uuid) -> Result<CodexStatus> {
    let mut tx = db.cell_tx(cell).await?;
    let row: Option<StatusRow> = sqlx::query_as(
        "SELECT state, code, verification_url, plan, limits, error_code, wanted IS NOT NULL, updated_at FROM catchup.codex_logins",
    )
    .fetch_optional(&mut *tx)
    .await?;
    let status = match row {
        None => CodexStatus {
            state: "none".into(),
            code: None,
            verification_url: None,
            plan: None,
            limits: None,
            error_code: None,
            busy: false,
            updated_at: None,
        },
        Some((state, code, verification_url, plan, limits, error_code, busy, updated)) => {
            let code = match code {
                Some(sealed) => {
                    let plain = vault::cell_key(master, &mut tx, cell).await?.open(cell, CODE, &sealed)?;
                    Some(String::from_utf8_lossy(&plain).into_owned())
                }
                None => None,
            };
            CodexStatus {
                state,
                code,
                verification_url,
                plan,
                limits: limits.map(|l| l.0),
                error_code,
                busy,
                updated_at: Some(updated),
            }
        }
    };
    tx.commit().await?;
    Ok(status)
}

pub async fn load_status(db: &Db, cell: Uuid) -> Result<String> {
    let mut tx = db.cell_tx(cell).await?;
    let state: Option<String> = sqlx::query_scalar("SELECT state FROM catchup.codex_logins").fetch_optional(&mut *tx).await?;
    tx.commit().await?;
    Ok(state.unwrap_or_else(|| "none".into()))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Want {
    Login,
    Cancel,
    Logout,
}

impl Want {
    fn as_str(self) -> &'static str {
        match self {
            Self::Login => "login",
            Self::Cancel => "cancel",
            Self::Logout => "logout",
        }
    }
}

pub async fn want(db: &Db, cell: Uuid, want: Want) -> Result<()> {
    let mut tx = db.cell_tx(cell).await?;
    sqlx::query("INSERT INTO catchup.codex_logins (cell) VALUES ($1) ON CONFLICT DO NOTHING").bind(cell).execute(&mut *tx).await?;
    let state: String = sqlx::query_scalar("SELECT state FROM catchup.codex_logins FOR UPDATE").fetch_one(&mut *tx).await?;
    if want == Want::Login && state == "in" {
        return Err(Error::Conflict("already_signed_in"));
    }
    // 두 번 눌러도 코드는 하나
    if want == Want::Login && matches!(state.as_str(), "starting" | "waiting") {
        return Ok(());
    }
    sqlx::query(
        "UPDATE catchup.codex_logins
         SET wanted = $1, state = CASE WHEN $1 = 'login' THEN 'starting' ELSE state END, error_code = NULL, updated_at = now()",
    )
    .bind(want.as_str())
    .execute(&mut *tx)
    .await?;
    emit(&mut tx, "connection", None).await?;
    tx.commit().await?;
    Ok(())
}

/// 바라는 일을 꺼내요(한 번만). 없으면 지금 상태만
pub async fn take(db: &Db, cell: Uuid) -> Result<(Option<Want>, String)> {
    let mut tx = db.cell_tx(cell).await?;
    let row: Option<(Option<String>, String)> =
        sqlx::query_as("SELECT wanted, state FROM catchup.codex_logins FOR UPDATE").fetch_optional(&mut *tx).await?;
    let Some((wanted, state)) = row else { return Ok((None, "none".into())) };
    sqlx::query("UPDATE catchup.codex_logins SET wanted = NULL WHERE wanted IS NOT NULL").execute(&mut *tx).await?;
    tx.commit().await?;
    let want = wanted.map(|w| match w.as_str() {
        "login" => Want::Login,
        "cancel" => Want::Cancel,
        _ => Want::Logout,
    });
    Ok((want, state))
}

pub async fn waiting(db: &Db, master: &Key, cell: Uuid, code: &str, url: &str) -> Result<()> {
    let mut tx = db.cell_tx(cell).await?;
    let sealed = vault::cell_key(master, &mut tx, cell).await?.seal(cell, CODE, code.as_bytes())?;
    sqlx::query(
        "UPDATE catchup.codex_logins SET state = 'waiting', code = $1, verification_url = $2, error_code = NULL, updated_at = now()",
    )
    .bind(sealed)
    .bind(url)
    .execute(&mut *tx)
    .await?;
    emit(&mut tx, "connection", None).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn set(db: &Db, cell: Uuid, state: &str, error: Option<&str>) -> Result<()> {
    let mut tx = db.cell_tx(cell).await?;
    sqlx::query(
        "UPDATE catchup.codex_logins SET state = $1, code = NULL, verification_url = NULL, error_code = $2, updated_at = now()",
    )
    .bind(state)
    .bind(error)
    .execute(&mut *tx)
    .await?;
    emit(&mut tx, "connection", None).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn signed_in(db: &Db, cell: Uuid, plan: Option<&str>) -> Result<()> {
    let mut tx = db.cell_tx(cell).await?;
    sqlx::query(
        "UPDATE catchup.codex_logins
         SET state = 'in', code = NULL, verification_url = NULL, error_code = NULL, plan = $1, updated_at = now()",
    )
    .bind(plan)
    .execute(&mut *tx)
    .await?;
    // 다시 로그인했으면 '로그인이 풀렸어요' 카드는 할 일이 없어요
    let stale: Vec<Uuid> = sqlx::query_scalar(
        "SELECT id FROM catchup.decision_cards WHERE state = 'open' AND dedupe_key LIKE 'codex:expired:%' FOR UPDATE",
    )
    .fetch_all(&mut *tx)
    .await?;
    for card in stale {
        cards::set_state(&mut tx, card, "expired", None, false).await?;
    }
    emit(&mut tx, "connection", None).await?;
    tx.commit().await?;
    Ok(())
}

/// 알림은 바뀐 칸만 실어 올 때가 있어서 겹쳐 써요
pub async fn set_limits(db: &Db, cell: Uuid, limits: &Value) -> Result<()> {
    if !limits.is_object() {
        return Ok(());
    }
    let mut tx = db.cell_tx(cell).await?;
    sqlx::query("UPDATE catchup.codex_logins SET limits = COALESCE(limits, '{}'::jsonb) || jsonb_strip_nulls($1)")
        .bind(Json(limits))
        .execute(&mut *tx)
        .await?;
    emit(&mut tx, "connection", None).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn load_auth(db: &Db, master: &Key, cell: Uuid) -> Result<Option<(Vec<u8>, Vec<u8>)>> {
    let mut tx = db.cell_tx(cell).await?;
    let row: Option<SealedAuth> =
        sqlx::query_as("SELECT auth, auth_fingerprint FROM catchup.codex_logins").fetch_optional(&mut *tx).await?;
    let found = match row {
        Some((Some(sealed), Some(fingerprint))) => {
            Some((vault::cell_key(master, &mut tx, cell).await?.open(cell, AUTH, &sealed)?, fingerprint))
        }
        _ => None,
    };
    tx.commit().await?;
    Ok(found)
}

/// 내가 읽은 것 위에만 써요. false 면 그사이 다른 쪽이 갱신했어요
pub async fn save_auth(db: &Db, master: &Key, cell: Uuid, auth: &[u8], fingerprint: &[u8], read: Option<&[u8]>) -> Result<bool> {
    let mut tx = db.cell_tx(cell).await?;
    let sealed = vault::cell_key(master, &mut tx, cell).await?.seal(cell, AUTH, auth)?;
    let changed =
        sqlx::query("UPDATE catchup.codex_logins SET auth = $1, auth_fingerprint = $2 WHERE auth_fingerprint IS NOT DISTINCT FROM $3")
            .bind(sealed)
            .bind(fingerprint)
            .bind(read)
            .execute(&mut *tx)
            .await?
            .rows_affected();
    tx.commit().await?;
    Ok(changed == 1)
}

pub async fn forget_auth(db: &Db, cell: Uuid) -> Result<()> {
    let mut tx = db.cell_tx(cell).await?;
    sqlx::query("UPDATE catchup.codex_logins SET auth = NULL, auth_fingerprint = NULL, plan = NULL, limits = NULL")
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

#[derive(Debug, Clone, Copy)]
pub enum Trouble {
    Expired,
    Limit { resets_at: Option<i64> },
}

/// 로그인 풀림 · 한도 참은 그 칸에 카드로
pub async fn raise(db: &Db, cell: Uuid, trouble: Trouble) -> Result<()> {
    let mut tx = db.cell_tx(cell).await?;
    let (lang, zone): (String, String) = sqlx::query_as("SELECT lang, time_zone FROM catchup.cells").fetch_one(&mut *tx).await?;
    let ko = lang == "ko";
    let say = |k: &str, e: &str| if ko { k } else { e }.to_owned();
    let (key, question, summary) = match trouble {
        Trouble::Expired => {
            let since: i64 =
                sqlx::query_scalar("SELECT COALESCE((SELECT extract(epoch FROM updated_at)::bigint FROM catchup.codex_logins), 0)")
                    .fetch_one(&mut *tx)
                    .await?;
            (
                format!("codex:expired:{since}"),
                say("ChatGPT 로그인이 풀렸어요. 어떻게 할까요?", "ChatGPT signed out. What now?"),
                say("연결 화면에서 다시 로그인하면 이어져요.", "Sign in again under Connections to continue."),
            )
        }
        Trouble::Limit { resets_at } => {
            let when: Option<String> = match resets_at {
                Some(at) => Some(
                    sqlx::query_scalar("SELECT to_char(to_timestamp($1) AT TIME ZONE $2, 'MM/DD HH24:MI')")
                        .bind(at as f64)
                        .bind(&zone)
                        .fetch_one(&mut *tx)
                        .await?,
                ),
                None => None,
            };
            let period = resets_at.unwrap_or_else(|| Utc::now().timestamp() / 3600);
            let summary = match when {
                Some(when) => say(&format!("{when}에 풀려요."), &format!("It resets at {when}.")),
                None => say("잠시 뒤 다시 돼요.", "It will work again later."),
            };
            (format!("codex:limit:{period}"), say("ChatGPT 사용 한도가 찼어요.", "You’ve hit your ChatGPT limit."), summary)
        }
    };
    let option = CardOption {
        label: say("알겠어요", "Got it"),
        detail: say("아무것도 실행하지 않아요", "Nothing runs"),
        risk: Risk::Low,
        done: say("확인했어요", "Noted"),
        effect: Effect::None,
    };
    let card = NewCard {
        dedupe_key: key.clone(),
        kind: "failed".into(),
        source: serde_json::json!({ "type": "codex", "from": "Codex" }),
        source_ref: key,
        source_version: "1".into(),
        question,
        body: serde_json::json!({ "summary": [{ "text": summary }] }),
        options: vec![option],
        recommended: 0,
        risk: Risk::Low,
        reply_path: "none".into(),
        waiting: true,
        due_at: None,
    };
    cards::create_in(&mut tx, cell, &card).await?;
    tx.commit().await?;
    Ok(())
}
