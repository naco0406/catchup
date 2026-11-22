//! Postgres. 사용자 칸의 자료는 반드시 `cell_tx` 로만 만져요 — 칸을 안 고르면 RLS 때문에 한 줄도 안 보여요.

use std::time::Duration;

use sqlx::{
    PgConnection, Postgres, Transaction,
    postgres::{PgConnectOptions, PgPool, PgPoolOptions},
};
use uuid::Uuid;

use crate::error::Result;

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

#[derive(Clone)]
pub struct Db {
    pool: PgPool,
}

impl Db {
    /// 앱 역할로만 붙어요. RLS 를 건너뛸 수 있는 역할이면 켜지지 않아요
    pub async fn connect(options: PgConnectOptions, max: u32) -> anyhow::Result<Self> {
        let pool = PgPoolOptions::new().max_connections(max).acquire_timeout(Duration::from_secs(5)).connect_with(options).await?;
        let bypass: bool =
            sqlx::query_scalar("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user").fetch_one(&pool).await?;
        anyhow::ensure!(!bypass, "refusing to run as a role that bypasses row level security");
        Ok(Self { pool })
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    pub async fn cell_tx(&self, cell: Uuid) -> Result<Transaction<'static, Postgres>> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('catchup.cell', $1, true)").bind(cell.to_string()).execute(&mut *tx).await?;
        Ok(tx)
    }
}

pub async fn emit(conn: &mut PgConnection, kind: &str, card: Option<Uuid>) -> Result<i64> {
    Ok(sqlx::query_scalar("SELECT catchup.emit($1, $2)").bind(kind).bind(card).fetch_one(conn).await?)
}

/// 마이그레이션은 주인 역할로 따로 돌려요. 서버와 일꾼은 이 접속 정보를 갖지 않아요
pub async fn migrate(owner: PgConnectOptions, app_password: &str) -> anyhow::Result<()> {
    anyhow::ensure!(
        app_password.len() >= 32 && app_password.bytes().all(|b| b.is_ascii_alphanumeric()),
        "app password must be at least 32 letters or digits"
    );
    let pool = PgPoolOptions::new().max_connections(1).connect_with(owner).await?;
    MIGRATOR.run(&pool).await?;
    let statement: String = sqlx::query_scalar("SELECT format('ALTER ROLE catchup_app LOGIN PASSWORD %L', $1::text)")
        .bind(app_password)
        .fetch_one(&pool)
        .await?;
    sqlx::query(&statement).execute(&pool).await?;
    pool.close().await;
    Ok(())
}
