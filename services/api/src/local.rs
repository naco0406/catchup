//! 로컬 커넥터 — 밖으로 아무것도 보내지 않고 '보낸 것'을 표에 남겨요(migration 0002).

use serde_json::json;
use sqlx::types::Json;

use crate::{
    db::Db,
    error::Result,
    executor::{Action, Executor, Found, Outcome, Source, Task},
};

pub struct Local {
    db: Db,
}

impl Local {
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    async fn version(&self, a: &Action) -> Result<Option<String>> {
        let mut tx = self.db.cell_tx(a.cell).await?;
        let version = sqlx::query_scalar("SELECT version FROM catchup.local_sources WHERE ref = $1")
            .bind(&a.source_ref)
            .fetch_optional(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(version)
    }

    async fn put(&self, a: &Action) -> Result<()> {
        let mut tx = self.db.cell_tx(a.cell).await?;
        sqlx::query("INSERT INTO catchup.local_effects (cell, id, effect) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING")
            .bind(a.cell)
            .bind(a.id)
            .bind(Json(&a.effect))
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    async fn has(&self, a: &Action) -> Result<bool> {
        let mut tx = self.db.cell_tx(a.cell).await?;
        let has = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM catchup.local_effects WHERE id = $1)")
            .bind(a.id)
            .fetch_one(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(has)
    }

    async fn take_back(&self, a: &Action) -> Result<bool> {
        let mut tx = self.db.cell_tx(a.cell).await?;
        let n = sqlx::query("UPDATE catchup.local_effects SET reverted = true WHERE id = $1").bind(a.id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(n.rows_affected() == 1)
    }
}

impl Executor for Local {
    fn source<'a>(&'a self, a: &'a Action) -> Task<'a, std::result::Result<Source, &'static str>> {
        Box::pin(async move {
            let version = self.version(a).await.map_err(|_| "source_unavailable")?;
            Ok(Source { version: version.unwrap_or_else(|| a.source_version.clone()), revision: None })
        })
    }

    fn execute<'a>(&'a self, a: &'a Action) -> Task<'a, Outcome> {
        Box::pin(async move {
            match self.put(a).await {
                Ok(()) => Outcome::Done { reverse: Some(json!({ "local_effect": a.id })) },
                Err(_) => Outcome::Unknown,
            }
        })
    }

    fn find<'a>(&'a self, a: &'a Action) -> Task<'a, Found> {
        Box::pin(async move {
            match self.has(a).await {
                Ok(true) => Found::Done { reverse: Some(json!({ "local_effect": a.id })) },
                Ok(false) => Found::NotDone,
                Err(_) => Found::Unknown,
            }
        })
    }

    fn revert<'a>(&'a self, a: &'a Action) -> Task<'a, Outcome> {
        Box::pin(async move {
            match self.take_back(a).await {
                Ok(true) => Outcome::Done { reverse: None },
                Ok(false) => Outcome::Failed("not_found"),
                Err(_) => Outcome::Unknown,
            }
        })
    }
}
