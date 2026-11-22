//! SSE. Postgres 알림은 '봐야 할 때'만 알려 주고, 내용은 표에서 번호 순서로 읽어요 — 알림을 놓쳐도 빠지지 않아요.

use std::{convert::Infallible, time::Duration};

use axum::response::sse::{Event, KeepAlive, Sse};
use futures_util::{Stream, stream};
use sqlx::postgres::PgListener;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::{auth, db::Db, error::Result};

const LOOK_AGAIN: Duration = Duration::from_secs(15);

#[derive(Clone)]
pub struct Hub {
    changed: broadcast::Sender<Uuid>,
}

impl Hub {
    pub fn start(db: &Db) -> Self {
        let (changed, _) = broadcast::channel(1024);
        let (sender, pool) = (changed.clone(), db.pool().clone());
        tokio::spawn(async move {
            loop {
                if let Ok(mut listener) = PgListener::connect_with(&pool).await
                    && listener.listen("catchup_events").await.is_ok()
                {
                    while let Ok(note) = listener.recv().await {
                        if let Ok(cell) = note.payload().parse() {
                            let _ = sender.send(cell);
                        }
                    }
                }
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        });
        Self { changed }
    }
}

type Row = (i64, String, Option<Uuid>);

pub async fn head(db: &Db, cell: Uuid) -> Result<i64> {
    let mut tx = db.cell_tx(cell).await?;
    let head: Option<i64> = sqlx::query_scalar("SELECT seq FROM catchup.cell_event_heads").fetch_optional(&mut *tx).await?;
    tx.commit().await?;
    Ok(head.unwrap_or(0))
}

async fn after(db: &Db, cell: Uuid, seq: i64) -> Result<Vec<Row>> {
    let mut tx = db.cell_tx(cell).await?;
    let rows = sqlx::query_as("SELECT seq, kind, card FROM catchup.cell_events WHERE seq > $1 ORDER BY seq LIMIT 200")
        .bind(seq)
        .fetch_all(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(rows)
}

struct Follow {
    db: Db,
    cell: Uuid,
    token: String,
    seq: i64,
    changed: broadcast::Receiver<Uuid>,
    ready: std::collections::VecDeque<Row>,
}

pub fn stream(
    db: Db,
    hub: &Hub,
    cell: Uuid,
    token: String,
    from: i64,
) -> Sse<impl Stream<Item = std::result::Result<Event, Infallible>> + use<>> {
    let follow = Follow { db, cell, token, seq: from, changed: hub.changed.subscribe(), ready: Default::default() };
    let events = stream::unfold(follow, |mut f| async move {
        loop {
            if let Some((seq, kind, card)) = f.ready.pop_front() {
                f.seq = seq;
                let data = serde_json::json!({ "kind": kind, "card": card }).to_string();
                return Some((Ok(Event::default().id(seq.to_string()).event("change").data(data)), f));
            }
            let rows = after(&f.db, f.cell, f.seq).await.ok()?;
            if !rows.is_empty() {
                f.ready = rows.into();
                continue;
            }
            let wait = tokio::time::sleep(LOOK_AGAIN);
            tokio::pin!(wait);
            loop {
                tokio::select! {
                    () = &mut wait => {
                        // 로그아웃한 기기의 흐름은 끊어요
                        auth::resolve(&f.db, &f.token).await.ok()?;
                        break;
                    }
                    got = f.changed.recv() => match got {
                        Ok(cell) if cell != f.cell => {}
                        Ok(_) | Err(broadcast::error::RecvError::Lagged(_)) => break,
                        Err(broadcast::error::RecvError::Closed) => return None,
                    }
                }
            }
        }
    });
    Sse::new(events).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}
