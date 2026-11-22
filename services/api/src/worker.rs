//! 사용자 칸 일꾼(design.md 8 · 13장).
//! 칸마다 따로 돌아서 한 칸이 죽거나 막혀도 다른 칸의 일은 계속돼요.
//! 실행 전에 '실행 중'을 먼저 커밋하고, 죽었다 살아나면 다시 하기 전에 커넥터에게 물어요.

use std::{collections::HashSet, sync::Arc, time::Duration};

use futures_util::FutureExt;
use serde_json::{Value, json};
use sqlx::{FromRow, types::Json};
use tokio::{sync::Mutex, task::JoinSet, time::timeout};
use uuid::Uuid;

use crate::{
    cards,
    crypto::Key,
    db::{Db, emit},
    error::{Error, Result},
    executor::{Action, Executor, Found, Outcome, Revision},
    model::{CardOption, Effect, NewCard, Risk},
    push::{self, Notifier},
};

const PER_PASS: usize = 20;
const MAX_ATTEMPTS: i32 = 5;

#[derive(Clone, Copy)]
pub struct Timing {
    pub lease: Duration,
    /// 커넥터 한 번 부르기. lease 보다 넉넉히 짧아야 해요
    pub call: Duration,
}

impl Default for Timing {
    fn default() -> Self {
        Self { lease: Duration::from_secs(90), call: Duration::from_secs(25) }
    }
}

#[derive(Debug, Clone, FromRow)]
struct Job {
    id: Uuid,
    card: Uuid,
    answer: Uuid,
    effect: Json<Effect>,
    source_ref: String,
    source_version: String,
    reverse: Option<Json<Value>>,
    state: String,
    attempts: i32,
}

const JOB: &str = "id, card, answer, effect, source_ref, source_version, reverse, state, attempts";

#[derive(Clone)]
pub struct Worker {
    db: Db,
    executor: Arc<dyn Executor>,
    notices: Option<(Arc<Key>, Arc<dyn Notifier>)>,
    timing: Timing,
    busy: Arc<Mutex<HashSet<Uuid>>>,
}

impl Worker {
    pub fn new(db: Db, executor: Arc<dyn Executor>, timing: Timing) -> Self {
        Self { db, executor, notices: None, timing, busy: Arc::default() }
    }

    pub fn with_notifications(mut self, master: Arc<Key>, notifier: Arc<dyn Notifier>) -> Self {
        self.notices = Some((master, notifier));
        self
    }

    /// 할 일이 있는 칸마다 일꾼 하나를 띄워요. 기다리지 않아요
    pub async fn start_due(&self, running: &mut JoinSet<()>) -> Result<()> {
        let cells: Vec<Uuid> = sqlx::query_scalar("SELECT cell FROM front.cells_with_work(100)").fetch_all(self.db.pool()).await?;
        for cell in cells {
            if !self.busy.lock().await.insert(cell) {
                continue;
            }
            let this = self.clone();
            running.spawn(async move {
                match std::panic::AssertUnwindSafe(this.run_cell(cell)).catch_unwind().await {
                    Ok(Ok(())) => {}
                    Ok(Err(Error::Internal(cause))) => tracing::error!(%cell, error = %cause, "cell worker failed"),
                    Ok(Err(error)) => tracing::warn!(%cell, %error, "cell worker stopped"),
                    Err(_) => tracing::error!(%cell, "cell worker panicked"),
                }
                this.busy.lock().await.remove(&cell);
            });
        }
        Ok(())
    }

    /// 한 바퀴 돌고 끝까지 기다려요(시험 · 종료)
    pub async fn run_once(&self) -> Result<()> {
        let mut running = JoinSet::new();
        self.start_due(&mut running).await?;
        while running.join_next().await.is_some() {}
        Ok(())
    }

    pub async fn run(&self, every: Duration, mut stop: tokio::sync::watch::Receiver<bool>) {
        let mut running = JoinSet::new();
        let mut tick = tokio::time::interval(every);
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tokio::select! {
                _ = tick.tick() => {
                    if let Err(error) = self.start_due(&mut running).await {
                        tracing::error!(%error, "cannot look for work");
                    }
                    while running.try_join_next().is_some() {}
                }
                _ = stop.changed() => break,
            }
        }
        // 하던 실행은 마치고 꺼요. 못 마치면 lease 가 지난 뒤 다음 일꾼이 물어봐요
        let _ = timeout(Duration::from_secs(30), async { while running.join_next().await.is_some() {} }).await;
    }

    async fn run_cell(&self, cell: Uuid) -> Result<()> {
        self.wake_snoozed(cell).await?;
        for _ in 0..PER_PASS {
            let Some((was, job)) = self.claim(cell).await? else { break };
            match was.as_str() {
                "waiting" => self.execute(cell, &job).await?,
                "running" => self.recover(cell, &job).await?,
                _ => self.revert(cell, &job).await?,
            }
        }
        // 답의 실행이 먼저, 알림은 그다음
        if let Some((master, notifier)) = &self.notices {
            for _ in 0..PER_PASS {
                if !push::send_next(&self.db, master, notifier.as_ref(), cell).await? {
                    break;
                }
            }
        }
        Ok(())
    }

    async fn wake_snoozed(&self, cell: Uuid) -> Result<()> {
        let mut tx = self.db.cell_tx(cell).await?;
        let due: Vec<Uuid> = sqlx::query_scalar(
            "SELECT id FROM catchup.decision_cards WHERE state = 'snoozed' AND snooze_until <= now() FOR UPDATE SKIP LOCKED",
        )
        .fetch_all(&mut *tx)
        .await?;
        for id in due {
            cards::set_state(&mut tx, id, "open", None, true).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    /// 앞 상태와 함께 하나를 잡아요
    async fn claim(&self, cell: Uuid) -> Result<Option<(String, Job)>> {
        let mut tx = self.db.cell_tx(cell).await?;
        let found: Option<Job> = sqlx::query_as(&format!(
            "SELECT {JOB} FROM catchup.action_receipts
             WHERE (state = 'waiting' AND run_after <= clock_timestamp())
                OR (state IN ('running', 'reverting') AND lease_until <= clock_timestamp())
             ORDER BY run_after, id LIMIT 1 FOR UPDATE SKIP LOCKED"
        ))
        .fetch_optional(&mut *tx)
        .await?;
        let Some(found) = found else { return Ok(None) };
        let next = if found.state == "waiting" { "running" } else { found.state.as_str() };
        let job: Job = sqlx::query_as(&format!(
            "UPDATE catchup.action_receipts
             SET state = $2, attempts = attempts + 1, lease_until = clock_timestamp() + make_interval(secs => $3)
             WHERE id = $1 RETURNING {JOB}"
        ))
        .bind(found.id)
        .bind(next)
        .bind(self.timing.lease.as_secs_f64())
        .fetch_one(&mut *tx)
        .await?;
        emit(&mut tx, "receipt", Some(job.card)).await?;
        tx.commit().await?;
        Ok(Some((found.state, job)))
    }

    fn action(cell: Uuid, job: &Job) -> Action {
        Action {
            cell,
            id: job.id,
            source_ref: job.source_ref.clone(),
            source_version: job.source_version.clone(),
            effect: job.effect.0.clone(),
            reverse: job.reverse.as_ref().map(|r| r.0.clone()),
        }
    }

    async fn execute(&self, cell: Uuid, job: &Job) -> Result<()> {
        if matches!(job.effect.0, Effect::None) {
            return self.succeeded(cell, job, None).await;
        }
        let action = Self::action(cell, job);
        let source = match timeout(self.timing.call, self.executor.source(&action)).await {
            Ok(Ok(source)) => source,
            Ok(Err(code)) => return self.failed(cell, job, "failed", code).await,
            // 아직 실행을 부르기 전이라 일어나지 않은 게 확실해요
            Err(_) => return self.failed(cell, job, "failed", "source_timeout").await,
        };
        if source.version != job.source_version {
            return self.stale(cell, job, &source.version, source.revision).await;
        }
        match timeout(self.timing.call, self.executor.execute(&action)).await.unwrap_or(Outcome::Unknown) {
            Outcome::Done { reverse } => self.succeeded(cell, job, reverse).await,
            Outcome::Failed(code) => self.failed(cell, job, "failed", code).await,
            Outcome::Unknown => self.failed(cell, job, "unknown", "result_unknown").await,
        }
    }

    async fn recover(&self, cell: Uuid, job: &Job) -> Result<()> {
        if matches!(job.effect.0, Effect::None) {
            return self.succeeded(cell, job, None).await;
        }
        let action = Self::action(cell, job);
        match timeout(self.timing.call, self.executor.find(&action)).await.unwrap_or(Found::Unknown) {
            Found::Done { reverse } => self.succeeded(cell, job, reverse).await,
            Found::NotDone if job.attempts < MAX_ATTEMPTS => self.execute(cell, job).await,
            Found::NotDone => self.failed(cell, job, "failed", "too_many_attempts").await,
            Found::Unknown => self.failed(cell, job, "unknown", "result_unknown").await,
        }
    }

    async fn revert(&self, cell: Uuid, job: &Job) -> Result<()> {
        let action = Self::action(cell, job);
        let outcome = timeout(self.timing.call, self.executor.revert(&action)).await.unwrap_or(Outcome::Unknown);
        let mut tx = self.db.cell_tx(cell).await?;
        let reverted = matches!(outcome, Outcome::Done { .. });
        // 못 되돌렸으면 실행된 채로 남기고 되돌리기를 거둬요
        let changed = sqlx::query(
            "UPDATE catchup.action_receipts
             SET state = $3, undoable = undoable AND $4, lease_until = NULL, error_code = $5, finished_at = clock_timestamp()
             WHERE id = $1 AND state = 'reverting' AND attempts = $2",
        )
        .bind(job.id)
        .bind(job.attempts)
        .bind(if reverted { "reverted" } else { "succeeded" })
        .bind(reverted)
        .bind(if reverted { None } else { Some("undo_failed") })
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if changed == 1 {
            if reverted {
                cards::set_state(&mut tx, job.card, "open", None, true).await?;
            } else {
                raise_failed(&mut tx, cell, job, "undo_failed").await?;
            }
            emit(&mut tx, "receipt", Some(job.card)).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    async fn succeeded(&self, cell: Uuid, job: &Job, reverse: Option<Value>) -> Result<()> {
        let mut tx = self.db.cell_tx(cell).await?;
        // 되돌릴 값을 못 받았으면 되돌리기를 보이지 않아요
        let lost = matches!(job.effect.0, Effect::Change { undo: true, .. }) && reverse.is_none();
        let changed = sqlx::query(
            "UPDATE catchup.action_receipts
             SET state = 'succeeded', lease_until = NULL, reverse = $3, undoable = undoable AND NOT $4, finished_at = clock_timestamp()
             WHERE id = $1 AND state = 'running' AND attempts = $2",
        )
        .bind(job.id)
        .bind(job.attempts)
        .bind(reverse.map(Json))
        .bind(lost)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if changed == 1 {
            emit(&mut tx, "receipt", Some(job.card)).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    async fn failed(&self, cell: Uuid, job: &Job, state: &str, code: &str) -> Result<()> {
        let mut tx = self.db.cell_tx(cell).await?;
        let changed = sqlx::query(
            "UPDATE catchup.action_receipts SET state = $3, error_code = $4, lease_until = NULL, finished_at = clock_timestamp()
             WHERE id = $1 AND state = 'running' AND attempts = $2",
        )
        .bind(job.id)
        .bind(job.attempts)
        .bind(state)
        .bind(code)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if changed == 1 {
            raise_failed(&mut tx, cell, job, code).await?;
            emit(&mut tx, "receipt", Some(job.card)).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    /// 원본이 바뀌었으면 실행하지 않고 카드를 고쳐 다시 물어요
    async fn stale(&self, cell: Uuid, job: &Job, version: &str, revision: Option<Revision>) -> Result<()> {
        let mut tx = self.db.cell_tx(cell).await?;
        let changed = sqlx::query(
            "UPDATE catchup.action_receipts SET state = 'stale', error_code = 'source_changed', lease_until = NULL, finished_at = clock_timestamp()
             WHERE id = $1 AND state = 'running' AND attempts = $2",
        )
        .bind(job.id)
        .bind(job.attempts)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if changed == 1 {
            if let Some(new) = revision {
                sqlx::query(
                    "UPDATE catchup.decision_cards SET question = $2, body = $3, options = $4, recommended = $5 WHERE id = $1",
                )
                .bind(job.card)
                .bind(new.question)
                .bind(Json(new.body))
                .bind(Json(new.options))
                .bind(new.recommended)
                .execute(&mut *tx)
                .await?;
                // 낡은 자료로 만든 선택지는 거둬요. 주고받은 말은 남아요
                sqlx::query("UPDATE catchup.card_turns SET options = NULL WHERE card = $1").bind(job.card).execute(&mut *tx).await?;
            }
            sqlx::query("UPDATE catchup.decision_cards SET source_version = $2, body = body || $3 WHERE id = $1")
                .bind(job.card)
                .bind(version)
                .bind(Json(json!({ "notice": "source_changed" })))
                .execute(&mut *tx)
                .await?;
            cards::set_state(&mut tx, job.card, "open", None, true).await?;
        }
        tx.commit().await?;
        Ok(())
    }
}

/// 실패는 카드로 다시 올라와요. 무엇이 안 됐는지 + 고칠 방법
async fn raise_failed(tx: &mut sqlx::PgConnection, cell: Uuid, job: &Job, code: &str) -> Result<()> {
    let (source, question, reply_path, chosen, lang): (Json<Value>, String, String, Json<CardOption>, String) = sqlx::query_as(
        "SELECT d.source, d.question, d.reply_path, a.chosen, c.lang
         FROM catchup.decision_cards d JOIN catchup.card_answers a ON a.card = d.id CROSS JOIN catchup.cells c
         WHERE d.id = $1 AND a.id = $2",
    )
    .bind(job.card)
    .bind(job.answer)
    .fetch_one(&mut *tx)
    .await?;

    let ko = lang == "ko";
    let say = |k: &'static str, e: &'static str| if ko { k } else { e }.to_owned();
    let unknown = code == "result_unknown";
    let undo = code == "undo_failed";
    let leave = CardOption {
        label: say("내가 확인할게요", "I’ll check it myself"),
        detail: say("아무것도 다시 실행하지 않아요", "Nothing runs again"),
        risk: Risk::Low,
        done: say("직접 확인하기로 했어요", "Left for you to check"),
        effect: Effect::None,
    };
    let mut options = vec![leave];
    if !undo {
        let retry = CardOption {
            label: say("다시 해요", "Try again"),
            detail: if unknown { say("두 번 실행될 수 있어요", "It could happen twice") } else { chosen.0.label.clone() },
            risk: if unknown { Risk::Irreversible } else { chosen.0.risk },
            done: chosen.0.done.clone(),
            effect: job.effect.0.clone(),
        };
        // 위험 없이 다시 할 수 있을 때만 추천
        let at = if retry.risk == Risk::Low { 0 } else { 1 };
        options.insert(at, retry);
    }
    let card = NewCard {
        dedupe_key: format!("failed:{}:{code}", job.id),
        kind: "failed".to_owned(),
        source: source.0,
        source_ref: job.source_ref.clone(),
        source_version: job.source_version.clone(),
        question: if unknown {
            say("실행됐는지 확인하지 못했어요. 어떻게 할까요?", "It may or may not have run. What now?")
        } else if undo {
            say("되돌리지 못했어요. 어떻게 할까요?", "Couldn’t undo it. What now?")
        } else {
            say("실행하지 못했어요. 어떻게 할까요?", "It didn’t run. What now?")
        },
        body: json!({ "summary": [{ "text": question }], "failed": { "card": job.card, "receipt": job.id, "code": code } }),
        options,
        recommended: 0,
        risk: if unknown { Risk::Irreversible } else { chosen.0.risk },
        reply_path,
        waiting: true,
        due_at: None,
    };
    cards::create_in(tx, cell, &card).await?;
    Ok(())
}
