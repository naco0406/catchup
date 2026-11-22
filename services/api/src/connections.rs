//! 연결. 토큰은 칸 키로 잠가 두고 화면에는 내주지 않아요. 잇기는 커넥터마다 제 로그인 길이 있어요(Codex 3단계).

use chrono::{DateTime, Utc};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    crypto::Key,
    db::{Db, emit},
    error::{Error, Result},
    vault,
};

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct Connection {
    pub id: Uuid,
    pub kind: String,
    pub reply_path: String,
    pub scopes: Vec<String>,
    pub state: String,
    pub last_ok_at: Option<DateTime<Utc>>,
    pub last_failed_at: Option<DateTime<Utc>>,
}

pub async fn list(db: &Db, cell: Uuid) -> Result<Vec<Connection>> {
    let mut tx = db.cell_tx(cell).await?;
    let rows = sqlx::query_as(
        "SELECT id, kind, reply_path, scopes, state, last_ok_at, last_failed_at FROM catchup.connections ORDER BY kind",
    )
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(rows)
}

pub async fn put(db: &Db, master: &Key, cell: Uuid, kind: &str, reply_path: &str, scopes: &[String], secret: &[u8]) -> Result<Uuid> {
    let mut tx = db.cell_tx(cell).await?;
    let sealed = vault::cell_key(master, &mut tx, cell).await?.seal(cell, &format!("connection:{kind}"), secret)?;
    let id = sqlx::query_scalar(
        "INSERT INTO catchup.connections AS c (cell, kind, reply_path, scopes, sealed, last_ok_at) VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (cell, kind) DO UPDATE SET reply_path = EXCLUDED.reply_path, scopes = EXCLUDED.scopes, sealed = EXCLUDED.sealed,
           state = 'ok', last_ok_at = now()
         RETURNING c.id",
    )
    .bind(cell)
    .bind(kind)
    .bind(reply_path)
    .bind(scopes)
    .bind(sealed)
    .fetch_one(&mut *tx)
    .await?;
    emit(&mut tx, "connection", None).await?;
    tx.commit().await?;
    Ok(id)
}

pub async fn secret(db: &Db, master: &Key, cell: Uuid, kind: &str) -> Result<Option<Vec<u8>>> {
    let mut tx = db.cell_tx(cell).await?;
    let sealed: Option<Option<Vec<u8>>> =
        sqlx::query_scalar("SELECT sealed FROM catchup.connections WHERE kind = $1").bind(kind).fetch_optional(&mut *tx).await?;
    let plain = match sealed.flatten() {
        Some(sealed) => Some(vault::cell_key(master, &mut tx, cell).await?.open(cell, &format!("connection:{kind}"), &sealed)?),
        None => None,
    };
    tx.commit().await?;
    Ok(plain)
}

pub async fn remove(db: &Db, cell: Uuid, id: Uuid) -> Result<()> {
    let mut tx = db.cell_tx(cell).await?;
    if sqlx::query("DELETE FROM catchup.connections WHERE id = $1").bind(id).execute(&mut *tx).await?.rows_affected() == 0 {
        return Err(Error::NotFound);
    }
    emit(&mut tx, "connection", None).await?;
    tx.commit().await?;
    Ok(())
}
