//! 칸의 비밀값. DB 에는 칸 키로 잠근 것만 들어가요.

use sqlx::PgConnection;
use uuid::Uuid;

use crate::{
    crypto::Key,
    error::{Error, Result},
};

pub async fn cell_key(master: &Key, conn: &mut PgConnection, cell: Uuid) -> Result<Key> {
    let wrapped: Vec<u8> =
        sqlx::query_scalar("SELECT wrapped_key FROM catchup.cells").fetch_optional(conn).await?.ok_or(Error::NotFound)?;
    Ok(master.cell_key(cell, &wrapped)?)
}
