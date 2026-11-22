//! 공용 앞단의 로그인과 기기 세션.
//! 로컬에서는 한 번만 쓰는 코드를 CLI 로 받아요(`catchup-api login-code`). 메일 · Google · Apple 은 같은 세션 위에 얹어요.

use axum::{
    extract::FromRequestParts,
    http::{HeaderMap, header, request::Parts},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use uuid::Uuid;

use crate::{
    crypto::{random, sha256},
    db::Db,
    error::{Error, Result},
    http::App,
};

pub const COOKIE: &str = "catchup_session";
const DAYS: i64 = 90;

/// 로그인한 기기. 칸은 여기서만 정해져요 — 요청의 본문이나 주소로 칸을 고를 수 없어요
#[derive(Debug, Clone, Copy)]
pub struct Session {
    pub cell: Uuid,
    pub device: Uuid,
}

pub fn token_of(headers: &HeaderMap) -> Option<&str> {
    headers.get_all(header::COOKIE).iter().filter_map(|v| v.to_str().ok()).flat_map(|v| v.split(';')).find_map(|part| {
        let (name, value) = part.trim().split_once('=')?;
        (name == COOKIE).then_some(value)
    })
}

pub async fn resolve(db: &Db, token: &str) -> Result<Session> {
    let found: Option<(Uuid, Uuid)> = sqlx::query_as("SELECT cell, device FROM front.resolve_session($1)")
        .bind(sha256(token.as_bytes()))
        .fetch_optional(db.pool())
        .await?;
    found.map(|(cell, device)| Session { cell, device }).ok_or(Error::Unauthorized)
}

impl FromRequestParts<App> for Session {
    type Rejection = Error;

    async fn from_request_parts(parts: &mut Parts, app: &App) -> Result<Self> {
        resolve(&app.db, token_of(&parts.headers).ok_or(Error::Unauthorized)?).await
    }
}

pub async fn login(db: &Db, email: &str, code: &str, label: &str) -> Result<String> {
    if email.len() > 254 || code.len() > 32 {
        return Err(Error::Unauthorized);
    }
    let token = URL_SAFE_NO_PAD.encode(random::<32>()?);
    let label: String = label.chars().take(120).collect();
    let cell: Option<Uuid> = sqlx::query_scalar("SELECT front.login($1, $2, $3, $4)")
        .bind(email.trim())
        .bind(sha256(code.trim().as_bytes()))
        .bind(sha256(token.as_bytes()))
        .bind(label)
        .fetch_one(db.pool())
        .await?;
    cell.map(|_| token).ok_or(Error::Unauthorized)
}

pub async fn logout(db: &Db, token: &str) -> Result<()> {
    sqlx::query("SELECT front.logout($1)").bind(sha256(token.as_bytes())).execute(db.pool()).await?;
    Ok(())
}

pub fn set_cookie(token: &str, secure: bool) -> String {
    let age = if token.is_empty() { 0 } else { DAYS * 24 * 60 * 60 };
    format!("{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={age}{}", if secure { "; Secure" } else { "" })
}
