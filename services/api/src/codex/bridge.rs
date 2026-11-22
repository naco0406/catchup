//! 카드의 답 → 에이전트의 요청. 2단계 일꾼(10초 · 되돌리기 · 한 번만 · 낡음)을 그대로 타요.

use std::sync::Arc;

use serde_json::json;
use sqlx::types::Json;

use super::request::{self, Kind};
use crate::{
    db::{Db, emit},
    error::Result,
    executor::{Action, Executor, Found, Outcome, Revision, Source, Task},
    model::{CardOption, Effect, Risk},
};

pub struct Bridge {
    db: Db,
    others: Arc<dyn Executor>,
}

impl Bridge {
    /// 에이전트 요청이 아닌 카드는 `others` 로
    pub fn new(db: Db, others: Arc<dyn Executor>) -> Self {
        Self { db, others }
    }

    async fn current(&self, a: &Action) -> Result<Source> {
        let mut tx = self.db.cell_tx(a.cell).await?;
        let found: Option<(String, Option<uuid::Uuid>)> =
            sqlx::query_as("SELECT state, answered_by FROM catchup.agent_requests WHERE id = $1")
                .bind(request::request_of(&a.source_ref))
                .fetch_optional(&mut *tx)
                .await?;
        let lang: String = sqlx::query_scalar("SELECT lang FROM catchup.cells").fetch_one(&mut *tx).await?;
        tx.commit().await?;
        // '알겠어요'만 남은 카드(version closed)는 그대로 통과
        let waiting = found.as_ref().is_some_and(|(state, by)| state == "waiting" || *by == Some(a.id));
        if waiting {
            return Ok(Source { version: "waiting".into(), revision: None });
        }
        let ko = lang == "ko";
        let say = |k: &str, e: &str| if ko { k } else { e }.to_owned();
        let revision = Revision {
            question: say("이 요청은 그사이 끝났어요.", "That request ended in the meantime."),
            body: json!({}),
            options: vec![CardOption {
                label: say("알겠어요", "Got it"),
                detail: say("아무것도 전하지 않아요", "Nothing is sent"),
                risk: Risk::Low,
                done: say("확인했어요", "Noted"),
                effect: Effect::None,
            }],
            recommended: 0,
        };
        Ok(Source { version: "closed".into(), revision: Some(revision) })
    }

    async fn deliver(&self, a: &Action) -> Result<Outcome> {
        let mut tx = self.db.cell_tx(a.cell).await?;
        let found: Option<(String, String, uuid::Uuid, Option<uuid::Uuid>)> =
            sqlx::query_as("SELECT kind, state, card, answered_by FROM catchup.agent_requests WHERE id = $1 FOR UPDATE")
                .bind(request::request_of(&a.source_ref))
                .fetch_optional(&mut *tx)
                .await?;
        let Some((kind, state, card, by)) = found else { return Ok(Outcome::Failed("request_gone")) };
        if by == Some(a.id) {
            return Ok(Outcome::Done { reverse: None });
        }
        if state != "waiting" {
            return Ok(Outcome::Failed("request_closed"));
        }
        let Some(answer) = request::answer_of(Kind::parse(&kind), &a.effect) else { return Ok(Outcome::Failed("bad_answer")) };
        sqlx::query(
            "UPDATE catchup.agent_requests SET state = 'answered', answer = $2, answered_by = $3, answered_at = now() WHERE id = $1",
        )
        .bind(request::request_of(&a.source_ref))
        .bind(Json(answer))
        .bind(a.id)
        .execute(&mut *tx)
        .await?;
        emit(&mut tx, "session", Some(card)).await?;
        tx.commit().await?;
        Ok(Outcome::Done { reverse: None })
    }

    async fn delivered(&self, a: &Action) -> Result<bool> {
        let mut tx = self.db.cell_tx(a.cell).await?;
        let done = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM catchup.agent_requests WHERE answered_by = $1)")
            .bind(a.id)
            .fetch_one(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(done)
    }
}

fn ours(a: &Action) -> bool {
    a.source_ref.starts_with(request::PREFIX)
}

impl Executor for Bridge {
    fn source<'a>(&'a self, a: &'a Action) -> Task<'a, std::result::Result<Source, &'static str>> {
        if !ours(a) {
            return self.others.source(a);
        }
        Box::pin(async move { self.current(a).await.map_err(|_| "source_unavailable") })
    }

    fn execute<'a>(&'a self, a: &'a Action) -> Task<'a, Outcome> {
        if !ours(a) {
            return self.others.execute(a);
        }
        Box::pin(async move { self.deliver(a).await.unwrap_or(Outcome::Unknown) })
    }

    fn find<'a>(&'a self, a: &'a Action) -> Task<'a, Found> {
        if !ours(a) {
            return self.others.find(a);
        }
        Box::pin(async move {
            match self.delivered(a).await {
                Ok(true) => Found::Done { reverse: None },
                Ok(false) => Found::NotDone,
                Err(_) => Found::Unknown,
            }
        })
    }

    fn revert<'a>(&'a self, a: &'a Action) -> Task<'a, Outcome> {
        if !ours(a) {
            return self.others.revert(a);
        }
        Box::pin(async move { Outcome::Failed("cannot_undo") })
    }
}
