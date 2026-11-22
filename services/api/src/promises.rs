//! 약속의 기억(3.6단계). 약속은 **내가 보낸 글**에서만 뽑아요 — 밖에서 온 글의 "언제까지 해 주세요"는 약속이 아니에요.
//! 나간 답 하나는 한 번만 살펴요. 낌새가 없는 글은 모델에 묻지 않고 넘겨요(한도를 아껴요).

use chrono::NaiveDate;
use uuid::Uuid;

use crate::{
    cards,
    codex::request::visible,
    db::Db,
    error::Result,
    model::{CardOption, Effect, NewCard, Risk},
};

const MAX_FOUND: usize = 3;
const MAX_TEXT: usize = 300;

/// 살필 글 — 사람에게 나간 것
#[derive(Debug)]
pub struct Sent {
    pub answer: Uuid,
    pub to: String,
    pub text: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Promise {
    pub what: String,
    pub due: Option<NaiveDate>,
}

const KOREAN: [&str; 14] =
    ["게요", "겠습니다", "겠어요", "까지", "내일", "모레", "오늘", "이번 주", "다음 주", "요일", "주말", "월 중", "드릴", "보낼"];
const ENGLISH: [&str; 20] = [
    "i'll",
    "i will",
    "we'll",
    "we will",
    " by ",
    "tomorrow",
    "tonight",
    "next week",
    "this week",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "eod",
    "end of day",
    "deadline",
    "get back to you",
];

/// 약속이 있을 낌새(때 · 하겠다는 말)
pub fn maybe(text: &str) -> bool {
    let lower = format!(" {} ", text.to_lowercase().replace('’', "'"));
    KOREAN.iter().chain(ENGLISH.iter()).any(|word| lower.contains(word))
}

async fn mark(db: &Db, cell: Uuid, answer: Uuid, state: &str) -> Result<bool> {
    let mut tx = db.cell_tx(cell).await?;
    let done = sqlx::query("INSERT INTO catchup.promise_scans (cell, answer, state) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING")
        .bind(cell)
        .bind(answer)
        .bind(state)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(done.rows_affected() == 1)
}

/// 다음에 살필 글. 낌새가 없는 글은 여기서 넘겨요
pub async fn next(db: &Db, cell: Uuid) -> Result<Option<Sent>> {
    for _ in 0..50 {
        let mut tx = db.cell_tx(cell).await?;
        let found: Option<(Uuid, Option<String>, String)> =
            sqlx::query_as("SELECT answer, recipient, text FROM catchup.promise_candidates ORDER BY finished_at LIMIT 1")
                .fetch_optional(&mut *tx)
                .await?;
        tx.commit().await?;
        let Some((answer, to, text)) = found else { return Ok(None) };
        if maybe(&text) {
            return Ok(Some(Sent { answer, to: to.unwrap_or_default(), text }));
        }
        mark(db, cell, answer, "none").await?;
    }
    Ok(None)
}

/// 찾은 약속을 남겨요. 같은 답은 한 번만
pub async fn settle(db: &Db, cell: Uuid, answer: Uuid, found: &[Promise]) -> Result<()> {
    let found: Vec<(String, Option<NaiveDate>)> = found
        .iter()
        .map(|p| (visible(p.what.trim()).chars().take(MAX_TEXT).collect::<String>(), p.due))
        .filter(|(what, _)| !what.is_empty())
        .take(MAX_FOUND)
        .collect();
    let mut tx = db.cell_tx(cell).await?;
    let first = sqlx::query("INSERT INTO catchup.promise_scans (cell, answer, state) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING")
        .bind(cell)
        .bind(answer)
        .bind(if found.is_empty() { "none" } else { "found" })
        .execute(&mut *tx)
        .await?;
    if first.rows_affected() == 1 {
        for (what, due) in &found {
            sqlx::query("INSERT INTO catchup.memory_promises (cell, answer, text, due) VALUES ($1, $2, $3, $4)")
                .bind(cell)
                .bind(answer)
                .bind(what)
                .bind(due)
                .execute(&mut *tx)
                .await?;
        }
    }
    tx.commit().await?;
    Ok(())
}

/// 모델이 답하지 못했어요. 다시 묻지 않아요(한도를 헛돌리지 않게)
pub async fn skip(db: &Db, cell: Uuid, answer: Uuid) -> Result<()> {
    mark(db, cell, answer, "failed").await.map(|_| ())
}

#[derive(sqlx::FromRow)]
struct Due {
    id: Uuid,
    text: String,
    subject: Option<String>,
    day: String,
    until: chrono::DateTime<chrono::Utc>,
    ko: bool,
}

/// 약속한 날이 된 것을 카드로 한 번 올려요. 답을 되돌렸거나 지운 약속은 올리지 않고 넘겨요.
/// 카드는 아무것도 보내지 않아요 — 했는지 묻고, 답은 그 사람의 기억으로 남아요
pub async fn raise_due(db: &Db, cell: Uuid) -> Result<usize> {
    let mut tx = db.cell_tx(cell).await?;
    let due: Vec<Due> = sqlx::query_as(
        "SELECT p.id, p.text, m.subject, to_char(p.due, 'FMMM/FMDD') AS day,
                ((p.due + 1)::timestamp AT TIME ZONE z.time_zone) AS until, z.lang = 'ko' AS ko
         FROM catchup.memory_promises p JOIN catchup.cells z ON z.cell = p.cell
         LEFT JOIN catchup.memories m ON m.cell = p.cell AND m.key = 'promise:' || p.id
         WHERE p.raised_at IS NULL AND p.due IS NOT NULL AND p.due <= (now() AT TIME ZONE z.time_zone)::date
         ORDER BY p.due LIMIT 20 FOR UPDATE OF p SKIP LOCKED",
    )
    .fetch_all(&mut *tx)
    .await?;
    let mut raised = 0;
    for d in due {
        if let Some(subject) = &d.subject {
            let say = |k: String, e: String| if d.ko { k } else { e };
            let option = |k: &str, e: &str, dk: &str, de: &str, done_k: &str, done_e: &str| CardOption {
                label: say(k.into(), e.into()),
                detail: say(dk.into(), de.into()),
                risk: Risk::Low,
                done: say(done_k.into(), done_e.into()),
                effect: Effect::None,
            };
            let key = format!("promise:{}", d.id);
            let card = NewCard {
                dedupe_key: key.clone(),
                kind: "choose".into(),
                source: serde_json::json!({ "type": "local", "from": subject }),
                source_ref: key,
                source_version: "1".into(),
                question: say(
                    format!("‘{}’ — {}까지 하기로 한 약속이에요. 했나요?", d.text, d.day),
                    format!("“{}” — you promised this by {}. Is it done?", d.text, d.day),
                ),
                body: serde_json::json!({ "summary": [say(
                    "보낸 글에서 뽑은 약속이에요. 이 카드는 아무것도 보내지 않아요.".into(),
                    "Picked up from a message you sent. This card sends nothing.".into(),
                )] }),
                options: vec![
                    option("했어요", "Done", "지켰다고 적어 둬요", "Notes it as kept", "약속을 지켰다고 적었어요", "Noted as kept"),
                    option("아직이에요", "Not yet", "적어만 둬요", "Just notes it", "아직이라고 적었어요", "Noted as not yet"),
                ],
                recommended: 0,
                risk: Risk::Low,
                reply_path: "none".into(),
                waiting: false,
                due_at: Some(d.until),
            };
            cards::create_in(&mut tx, cell, &card).await?;
            raised += 1;
        }
        sqlx::query("UPDATE catchup.memory_promises SET raised_at = now() WHERE id = $1").bind(d.id).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(raised)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_replies_that_hint_at_a_promise_are_scanned() {
        for text in [
            "금요일까지 견적서 보내 드릴게요",
            "내일 다시 연락드리겠습니다",
            "I'll send it by Friday",
            "Will do tomorrow",
            "I’ll check",
        ] {
            assert!(maybe(text), "{text}");
        }
        for text in ["네, 확인했어요", "감사합니다", "Thanks, looks good", "B안이 좋아요", "Standby"] {
            assert!(!maybe(text), "{text}");
        }
    }
}
