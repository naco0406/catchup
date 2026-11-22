//! 주인 접속으로만 하는 일: 칸 만들기 · 로그인 코드. 서버와 일꾼은 이 접속 정보를 갖지 않아요.

use sqlx::{Connection, PgConnection, postgres::PgConnectOptions};
use uuid::Uuid;

use crate::crypto::{Key, random, sha256};

pub async fn provision(owner: PgConnectOptions, master: &Key, email: &str, lang: &str) -> anyhow::Result<Uuid> {
    let email = email.trim().to_lowercase();
    anyhow::ensure!(email.contains('@'), "email is required");
    let mut db = PgConnection::connect_with(&owner).await?;
    if let Some(cell) =
        sqlx::query_scalar("SELECT cell FROM front.accounts WHERE email = $1").bind(&email).fetch_optional(&mut db).await?
    {
        return Ok(cell);
    }
    let cell = Uuid::new_v4();
    let mut tx = db.begin().await?;
    sqlx::query("INSERT INTO catchup.cells (cell, lang, wrapped_key) VALUES ($1, $2, $3)")
        .bind(cell)
        .bind(lang)
        .bind(master.new_cell_key(cell)?)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO front.accounts (cell, email) VALUES ($1, $2)").bind(cell).bind(&email).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(cell)
}

/// 10분 동안 한 번 쓰는 코드
pub async fn login_code(owner: PgConnectOptions, email: &str) -> anyhow::Result<String> {
    let mut db = PgConnection::connect_with(&owner).await?;
    let code = format!("{:08}", u64::from_le_bytes(random::<8>()?) % 100_000_000);
    let changed = sqlx::query(
        "INSERT INTO front.login_codes (account, code_hash, expires_at)
         SELECT id, $2, now() + interval '10 minutes' FROM front.accounts WHERE email = lower($1)
         ON CONFLICT (account) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, tries = 0",
    )
    .bind(email.trim())
    .bind(sha256(code.as_bytes()))
    .execute(&mut db)
    .await?;
    anyhow::ensure!(changed.rows_affected() == 1, "no such account");
    Ok(code)
}
