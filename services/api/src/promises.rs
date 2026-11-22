//! 약속의 기억(3.6단계). 약속은 **내가 보낸 글**에서만 뽑아요 — 밖에서 온 글의 "언제까지 해 주세요"는 약속이 아니에요.
//! 나간 답 하나는 한 번만 살펴요. 낌새가 없는 글은 모델에 묻지 않고 넘겨요(한도를 아껴요).

use chrono::NaiveDate;
use uuid::Uuid;

use crate::{codex::request::visible, db::Db, error::Result};

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
