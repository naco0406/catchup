//! 말로 만드는 기한 있는 감시 규칙(design.md 17장 제안 2, Q22).
//!
//! "다음 주까지 한빛 디자인 메일은 바로 물어봐 줘" — 토마토는 규칙을 **제안**만 하고, 내가 눌러야 켜져요.
//! 서버가 지키는 것:
//! - 규칙은 **올리는 쪽으로만** 보내요(넘겨요 → 알려만 드려요 → 물어봐요). 내리거나 알아서 하는 쪽으로는 못 넓혀요(원칙 5)
//! - 끝나는 날이 늘 있어요. 모델이 며칠을 말하든 1~30일 안으로 잘라요
//! - 무엇을 볼지는 두 가지뿐이에요: 보낸 사람(이름 · 주소 · 회사)과 낱말(제목 · 본문). 모델이 지은 다른 조건은 받지 않아요
//! - 모델이 쓴 글은 규칙이 되지 않아요. 규칙의 값은 서버가 다듬은 짧은 낱말이고, 화면에 그대로 보여요

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgConnection;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    codex::request::visible,
    db::{Db, emit},
    error::{Error, Result},
};

pub const MAX_DAYS: i64 = 30;
const DEFAULT_DAYS: i64 = 7;

/// 감시 규칙 하나
#[derive(Clone, Debug, Serialize, Deserialize, sqlx::FromRow, ToSchema)]
pub struct Rule {
    pub id: Uuid,
    /// from · words
    pub kind: String,
    pub value: String,
    /// ask · fyi
    pub lane: String,
    pub until: DateTime<Utc>,
    /// proposed · active · stopped
    pub state: String,
    pub created_at: DateTime<Utc>,
}

/// 모델이 고른 것. 믿지 않는 값이라 `clean` 이 다시 걸러요
#[derive(Clone, Debug, Default, Deserialize)]
pub struct Asked {
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub lane: String,
    #[serde(default)]
    pub days: i64,
}

/// 서버가 받아들인 규칙의 모양
#[derive(Clone, Debug, PartialEq)]
pub struct Clean {
    pub kind: &'static str,
    pub value: String,
    pub lane: &'static str,
    pub days: i64,
}

/// 모델이 고른 것을 규칙으로 다듬어요. 무엇을 볼지 모르면 규칙을 만들지 않아요
pub fn clean(asked: &Asked) -> Option<Clean> {
    let kind = match asked.kind.trim() {
        "from" => "from",
        "words" => "words",
        _ => return None,
    };
    let value: String = visible(asked.value.trim()).chars().take(100).collect::<String>().trim().to_owned();
    if value.chars().count() < 2 || value.contains('\n') {
        return None;
    }
    // 올리는 쪽으로만 — 모르는 갈래는 물어봐요로
    let lane = if asked.lane.trim() == "fyi" { "fyi" } else { "ask" };
    let days = if asked.days <= 0 { DEFAULT_DAYS } else { asked.days.min(MAX_DAYS) };
    Some(Clean { kind, value, lane, days })
}

/// 들어온 글이 규칙에 맞는지 — 대소문자는 가리지 않아요
pub fn matches(kind: &str, value: &str, sender: &str, org: &str, subject: &str, text: &str) -> bool {
    let needle = value.to_lowercase();
    match kind {
        "from" => sender.to_lowercase().contains(&needle) || (!org.is_empty() && org.to_lowercase().contains(&needle)),
        "words" => subject.to_lowercase().contains(&needle) || text.to_lowercase().contains(&needle),
        _ => false,
    }
}

/// 갈래를 올리기만 해요. skip < fyi < ask
pub fn raised(lane: &str, rule_lane: &str) -> bool {
    let rank = |l: &str| match l {
        "ask" => 2,
        "fyi" => 1,
        _ => 0,
    };
    rank(rule_lane) > rank(lane)
}

const VIEW: &str = "id, kind, value, lane, until, state, created_at";

/// 제안해 둬요(켜지 않아요). 같은 말에서는 하나만
pub async fn propose(conn: &mut PgConnection, cell: Uuid, message: Uuid, rule: &Clean) -> Result<Rule> {
    let until = Utc::now() + Duration::days(rule.days);
    Ok(sqlx::query_as(&format!(
        "INSERT INTO catchup.watch_rules (cell, message, kind, value, lane, until) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (cell, message) DO UPDATE SET kind = EXCLUDED.kind RETURNING {VIEW}"
    ))
    .bind(cell)
    .bind(message)
    .bind(rule.kind)
    .bind(&rule.value)
    .bind(rule.lane)
    .bind(until)
    .fetch_one(conn)
    .await?)
}

/// 그 말이 제안한 규칙
pub async fn of_message(conn: &mut PgConnection, message: Uuid) -> Result<Option<Rule>> {
    Ok(sqlx::query_as(&format!("SELECT {VIEW} FROM catchup.watch_rules WHERE message = $1")).bind(message).fetch_optional(conn).await?)
}

/// 내가 눌러서 켜요. 이미 켜졌으면 그대로, 멈췄거나 끝났으면 다시 켜지 않아요
pub async fn start(conn: &mut PgConnection, id: Uuid) -> Result<Rule> {
    let rule: Rule = sqlx::query_as(&format!("SELECT {VIEW} FROM catchup.watch_rules WHERE id = $1 FOR UPDATE"))
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?
        .ok_or(Error::NotFound)?;
    match rule.state.as_str() {
        "active" => return Ok(rule),
        "stopped" => return Err(Error::Conflict("stopped")),
        _ if rule.until <= Utc::now() => return Err(Error::Conflict("expired")),
        _ => {}
    }
    let rule = sqlx::query_as(&format!(
        "UPDATE catchup.watch_rules SET state = 'active', started_at = now() WHERE id = $1 RETURNING {VIEW}"
    ))
    .bind(id)
    .fetch_one(&mut *conn)
    .await?;
    emit(conn, "watch", None).await?;
    Ok(rule)
}

/// 멈춰요. 여러 번 눌러도 같아요
pub async fn stop(db: &Db, cell: Uuid, id: Uuid) -> Result<Rule> {
    let mut tx = db.cell_tx(cell).await?;
    let rule = sqlx::query_as(&format!(
        "UPDATE catchup.watch_rules SET state = 'stopped', stopped_at = COALESCE(stopped_at, now()) WHERE id = $1 RETURNING {VIEW}"
    ))
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(Error::NotFound)?;
    emit(&mut tx, "watch", None).await?;
    tx.commit().await?;
    Ok(rule)
}

/// 화면에 보일 것: 켜져 있고 아직 끝나지 않은 규칙
pub async fn list(db: &Db, cell: Uuid) -> Result<Vec<Rule>> {
    let mut tx = db.cell_tx(cell).await?;
    let rules = sqlx::query_as(&format!(
        "SELECT {VIEW} FROM catchup.watch_rules WHERE state = 'active' AND until > now() ORDER BY until, created_at"
    ))
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(rules)
}

/// 가를 때: 켜진 규칙 중 이 글에 맞고 갈래를 올리는 첫 규칙. 물어봐요로 올리는 규칙을 먼저 봐요
pub async fn raise_for(
    conn: &mut PgConnection,
    lane: &str,
    sender: &str,
    org: &str,
    subject: &str,
    text: &str,
) -> Result<Option<(Uuid, String)>> {
    let rules: Vec<(Uuid, String, String, String)> = sqlx::query_as(
        "SELECT id, kind, value, lane FROM catchup.watch_rules WHERE state = 'active' AND until > now()
         ORDER BY (lane = 'ask') DESC, created_at",
    )
    .fetch_all(conn)
    .await?;
    Ok(rules
        .into_iter()
        .find(|(_, kind, value, rule_lane)| raised(lane, rule_lane) && matches(kind, value, sender, org, subject, text))
        .map(|(id, _, _, rule_lane)| (id, rule_lane)))
}

/// 제안할 때 토마토가 하는 말 — 모델의 글이 아니라 서버가 써요
pub fn proposal(ko: bool, rule: &Rule, time_zone_day: &str) -> String {
    match (ko, rule.kind.as_str(), rule.lane.as_str()) {
        (true, "from", "ask") => format!("{time_zone_day}까지 '{}' 쪽에서 온 것은 바로 물어볼게요. 켤까요?", rule.value),
        (true, "from", _) => format!("{time_zone_day}까지 '{}' 쪽에서 온 것은 넘기지 않고 알려 드릴게요. 켤까요?", rule.value),
        (true, _, "ask") => format!("{time_zone_day}까지 '{}' 낱말이 들어간 글은 바로 물어볼게요. 켤까요?", rule.value),
        (true, _, _) => format!("{time_zone_day}까지 '{}' 낱말이 들어간 글은 넘기지 않고 알려 드릴게요. 켤까요?", rule.value),
        (false, "from", "ask") => format!("Until {time_zone_day}, I'll ask you about anything from “{}” right away. Turn this on?", rule.value),
        (false, "from", _) => format!("Until {time_zone_day}, I'll show you anything from “{}” instead of skipping it. Turn this on?", rule.value),
        (false, _, "ask") => format!("Until {time_zone_day}, I'll ask you about anything mentioning “{}” right away. Turn this on?", rule.value),
        (false, _, _) => format!("Until {time_zone_day}, I'll show you anything mentioning “{}” instead of skipping it. Turn this on?", rule.value),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asked(kind: &str, value: &str, lane: &str, days: i64) -> Asked {
        Asked { kind: kind.into(), value: value.into(), lane: lane.into(), days }
    }

    #[test]
    fn rules_only_ever_raise_a_lane() {
        assert!(raised("skip", "fyi") && raised("skip", "ask") && raised("fyi", "ask"));
        assert!(!raised("ask", "fyi") && !raised("ask", "ask") && !raised("fyi", "fyi"));
        // 모델이 '넘겨', '알아서'를 골라도 규칙은 물어봐요로 서요
        for lane in ["skip", "auto", "handle", ""] {
            assert_eq!(clean(&asked("from", "한빛 디자인", lane, 7)).unwrap().lane, "ask", "{lane}");
        }
        assert_eq!(clean(&asked("from", "한빛 디자인", "fyi", 7)).unwrap().lane, "fyi");
    }

    #[test]
    fn every_rule_ends_within_thirty_days() {
        assert_eq!(clean(&asked("words", "invoice", "ask", 365)).unwrap().days, MAX_DAYS);
        assert_eq!(clean(&asked("words", "invoice", "ask", 0)).unwrap().days, DEFAULT_DAYS);
        assert_eq!(clean(&asked("words", "invoice", "ask", -3)).unwrap().days, DEFAULT_DAYS);
        assert_eq!(clean(&asked("words", "invoice", "ask", 3)).unwrap().days, 3);
    }

    #[test]
    fn only_two_kinds_and_a_real_value_make_a_rule() {
        assert!(clean(&asked("regex", ".*", "ask", 7)).is_none());
        assert!(clean(&asked("from", " ", "ask", 7)).is_none());
        assert!(clean(&asked("from", "a", "ask", 7)).is_none());
        assert!(clean(&asked("from", "a\nb", "ask", 7)).is_none());
        assert_eq!(clean(&asked("from", &"x".repeat(300), "ask", 7)).unwrap().value.chars().count(), 100);
        assert!(clean(&asked("from", "ev\u{202e}il", "ask", 7)).unwrap().value.contains("\\u{202e}"), "숨은 글자는 보이게");
    }

    #[test]
    fn from_looks_at_sender_and_company_and_words_at_subject_and_text() {
        assert!(matches("from", "acmecorp.com", "Jane <jane@AcmeCorp.com>", "", "", ""));
        assert!(matches("from", "한빛 디자인", "박서연", "한빛 디자인", "", ""));
        assert!(!matches("from", "한빛 디자인", "박서연", "", "한빛 디자인 견적", ""));
        assert!(matches("words", "invoice", "x", "", "Your INVOICE", ""));
        assert!(matches("words", "견적", "x", "", "", "새 견적을 보내요"));
        assert!(!matches("words", "견적", "견적팀", "", "", ""));
    }
}
