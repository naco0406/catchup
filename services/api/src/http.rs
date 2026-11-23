//! HTTP(design.md 12장). 칸은 세션에서만 나와요.

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{Path, Query, Request, State},
    http::{HeaderMap, Method, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::types::Json as Db_;
use tower_http::{limit::RequestBodyLimitLayer, timeout::TimeoutLayer};
use utoipa::{OpenApi, ToSchema};
use uuid::Uuid;

use crate::{
    assistant::{self, Message},
    auth::{self, Session},
    cards,
    codex::{
        account::{self, CodexStatus, Want},
        sessions::{self, AgentSession, StartInput},
    },
    connections::{self, Connection},
    crypto::Key,
    db::Db,
    error::{Error, Result},
    events::{self, Hub},
    model::{AnswerInput, Card, CardOption, Effect, Receipt, Surface, Turn},
    passkeys,
    push::{self, Subscription},
};

#[derive(Clone)]
pub struct App {
    pub db: Db,
    pub hub: Hub,
    pub settings: Arc<Settings>,
    pub master: Arc<Key>,
}

pub struct Settings {
    /// 쓰기 요청을 받아 주는 화면 주소
    pub origins: Vec<String>,
    pub secure_cookie: bool,
    pub push_public_key: String,
}

pub fn router(app: App) -> Router {
    let quick = Router::new()
        .route("/health/live", get(|| async { StatusCode::NO_CONTENT }))
        .route("/health/ready", get(ready))
        .route("/v1/openapi.json", get(|| async { Json(Api::openapi()) }))
        .route("/v1/auth/session", post(login).delete(logout))
        .route("/v1/auth/passkey/options", post(passkey_ask))
        .route("/v1/auth/passkey", post(passkey_login))
        .route("/v1/me/passkeys/options", post(passkey_start))
        .route("/v1/me/passkeys", get(passkeys).post(passkey_add))
        .route("/v1/me/passkeys/{id}", axum::routing::delete(passkey_remove))
        .route("/v1/me", get(me))
        .route("/v1/me/cards", get(list_cards))
        .route("/v1/me/cards/{id}/answer", post(answer))
        .route("/v1/me/cards/{id}/turns", post(say))
        .route("/v1/me/cards/{id}/snooze", post(snooze))
        .route("/v1/me/cards/{id}/handoff", post(handoff))
        .route("/v1/me/cards/{id}/read", post(read))
        .route("/v1/me/cards/{id}/undo", post(undo))
        .route("/v1/me/activity", get(activity))
        .route("/v1/me/cards/{id}/promote", post(promote))
        .route("/v1/me/memories", get(memories).post(tell_memory))
        .route("/v1/me/memories/{key}", axum::routing::put(edit_memory).delete(forget_memory))
        .route("/v1/me/assistant", get(assistant_thread).post(tell_assistant))
        .route("/v1/me/assistant/{id}/accept", post(accept_proposal))
        .route("/v1/me/assistant/{id}/keep", post(keep_words))
        .route("/v1/me/connections", get(list_connections))
        .route("/v1/me/connections/{id}", axum::routing::delete(disconnect))
        .route("/v1/me/codex", get(codex_status).delete(codex_logout))
        .route("/v1/me/codex/login", post(codex_login).delete(codex_cancel))
        .route("/v1/me/agent-sessions", get(list_sessions).post(start_session))
        .route("/v1/me/agent-sessions/{id}", axum::routing::delete(stop_session))
        .route("/v1/me/agent-sessions/{id}/patch", get(session_patch))
        .route("/v1/me/push", get(push_key).post(push_on))
        .route("/v1/me/push/{id}", axum::routing::delete(push_off))
        .layer(TimeoutLayer::new(Duration::from_secs(15)));
    Router::new()
        .merge(quick)
        .route("/v1/me/cards/stream", get(stream))
        .layer(RequestBodyLimitLayer::new(128 * 1024))
        .layer(middleware::from_fn_with_state(app.clone(), same_origin))
        .with_state(app)
}

/// 다른 사이트가 내 쿠키로 답하지 못하게
async fn same_origin(State(app): State<App>, request: Request, next: Next) -> Response {
    if !matches!(*request.method(), Method::GET | Method::HEAD) {
        let origin = request.headers().get(header::ORIGIN).and_then(|v| v.to_str().ok());
        if !origin.is_some_and(|o| app.settings.origins.iter().any(|allowed| allowed == o)) {
            return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "bad_origin" }))).into_response();
        }
    }
    next.run(request).await
}

async fn ready(State(app): State<App>) -> Result<StatusCode> {
    sqlx::query("SELECT 1").execute(app.db.pool()).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize, ToSchema)]
pub struct LoginInput {
    email: String,
    code: String,
    #[serde(default)]
    label: String,
}

#[utoipa::path(post, path = "/v1/auth/session", request_body = LoginInput, responses((status = 204), (status = 401)))]
async fn login(State(app): State<App>, Json(input): Json<LoginInput>) -> Result<Response> {
    let token = auth::login(&app.db, &input.email, &input.code, &input.label).await?;
    Ok((StatusCode::NO_CONTENT, [(header::SET_COOKIE, auth::set_cookie(&token, app.settings.secure_cookie))]).into_response())
}

#[utoipa::path(delete, path = "/v1/auth/session", responses((status = 204)))]
async fn logout(State(app): State<App>, headers: HeaderMap) -> Result<Response> {
    if let Some(token) = auth::token_of(&headers) {
        auth::logout(&app.db, token).await?;
    }
    Ok((StatusCode::NO_CONTENT, [(header::SET_COOKIE, auth::set_cookie("", app.settings.secure_cookie))]).into_response())
}

/// 요청을 보낸 화면의 주소. 쓰기 요청은 이미 `same_origin` 이 아는 주소인지 봤어요
fn origin_of(headers: &HeaderMap) -> Result<&str> {
    headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()).ok_or(Error::Invalid("bad_origin"))
}

/// 패스키 로그인의 물음. 누구인지는 묻지 않아요
#[utoipa::path(post, path = "/v1/auth/passkey/options", responses((status = 200, body = passkeys::LoginOptions)))]
async fn passkey_ask(State(app): State<App>, headers: HeaderMap) -> Result<Json<passkeys::LoginOptions>> {
    Ok(Json(passkeys::begin_login(&app.db, origin_of(&headers)?).await?))
}

#[utoipa::path(post, path = "/v1/auth/passkey", request_body = passkeys::LoginInput, responses((status = 204), (status = 401)))]
async fn passkey_login(State(app): State<App>, Json(input): Json<passkeys::LoginInput>) -> Result<Response> {
    let token = passkeys::login(&app.db, &app.settings.origins, &input).await?;
    Ok((StatusCode::NO_CONTENT, [(header::SET_COOKIE, auth::set_cookie(&token, app.settings.secure_cookie))]).into_response())
}

#[utoipa::path(get, path = "/v1/me/passkeys", responses((status = 200, body = Vec<passkeys::Passkey>)))]
async fn passkeys(State(app): State<App>, session: Session) -> Result<Json<Vec<passkeys::Passkey>>> {
    Ok(Json(passkeys::list(&app.db, session.cell).await?))
}

/// 패스키 등록의 물음(로그인한 기기에서만)
#[utoipa::path(post, path = "/v1/me/passkeys/options", responses((status = 200, body = passkeys::RegisterOptions)))]
async fn passkey_start(State(app): State<App>, session: Session, headers: HeaderMap) -> Result<Json<passkeys::RegisterOptions>> {
    Ok(Json(passkeys::begin_register(&app.db, session.cell, origin_of(&headers)?).await?))
}

#[utoipa::path(post, path = "/v1/me/passkeys", request_body = passkeys::RegisterInput,
    responses((status = 200, body = passkeys::Passkey), (status = 409), (status = 422)))]
async fn passkey_add(
    State(app): State<App>,
    session: Session,
    Json(input): Json<passkeys::RegisterInput>,
) -> Result<Json<passkeys::Passkey>> {
    Ok(Json(passkeys::register(&app.db, session.cell, &app.settings.origins, &input).await?))
}

#[utoipa::path(delete, path = "/v1/me/passkeys/{id}", params(("id" = Uuid, Path)), responses((status = 204), (status = 404)))]
async fn passkey_remove(State(app): State<App>, session: Session, Path(id): Path<Uuid>) -> Result<StatusCode> {
    passkeys::remove(&app.db, session.cell, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize, sqlx::FromRow, ToSchema)]
pub struct Me {
    cell: Uuid,
    lang: String,
    time_zone: String,
}

#[utoipa::path(get, path = "/v1/me", responses((status = 200, body = Me), (status = 401)))]
async fn me(State(app): State<App>, session: Session) -> Result<Json<Me>> {
    let mut tx = app.db.cell_tx(session.cell).await?;
    let me = sqlx::query_as("SELECT cell, lang, time_zone FROM catchup.cells").fetch_one(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(me))
}

#[derive(Deserialize)]
struct ListQuery {
    state: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct CardList {
    cards: Vec<Card>,
    /// SSE 를 여기서부터 이어 받아요
    cursor: i64,
}

#[utoipa::path(get, path = "/v1/me/cards", params(("state" = Option<String>, Query)), responses((status = 200, body = CardList)))]
async fn list_cards(State(app): State<App>, session: Session, Query(q): Query<ListQuery>) -> Result<Json<CardList>> {
    // 번호를 먼저 읽어요 — 목록을 읽는 사이의 변화는 SSE 로 한 번 더 올 뿐 빠지지 않아요
    let cursor = events::head(&app.db, session.cell).await?;
    let cards = cards::list(&app.db, session.cell, q.state.as_deref().unwrap_or("open")).await?;
    Ok(Json(CardList { cards, cursor }))
}

#[derive(Deserialize)]
struct StreamQuery {
    after: Option<i64>,
}

async fn stream(State(app): State<App>, session: Session, headers: HeaderMap, Query(q): Query<StreamQuery>) -> Result<Response> {
    let resumed = headers.get("last-event-id").and_then(|v| v.to_str().ok()).and_then(|v| v.parse().ok());
    let from = match resumed.or(q.after) {
        Some(seq) => seq,
        None => events::head(&app.db, session.cell).await?,
    };
    let token = auth::token_of(&headers).ok_or(Error::Unauthorized)?.to_owned();
    Ok(events::stream(app.db.clone(), &app.hub, session.cell, token, from).into_response())
}

#[utoipa::path(post, path = "/v1/me/cards/{id}/answer", params(("id" = Uuid, Path)), request_body = AnswerInput,
    responses((status = 200, body = Receipt), (status = 409), (status = 428)))]
async fn answer(
    State(app): State<App>,
    session: Session,
    Path(id): Path<Uuid>,
    Json(input): Json<AnswerInput>,
) -> Result<Json<Receipt>> {
    Ok(Json(cards::answer(&app.db, session.cell, id, &input).await?))
}

#[derive(Deserialize, ToSchema)]
pub struct SayInput {
    request_key: Uuid,
    text: String,
}

#[utoipa::path(post, path = "/v1/me/cards/{id}/turns", params(("id" = Uuid, Path)), request_body = SayInput, responses((status = 200, body = Card)))]
async fn say(State(app): State<App>, session: Session, Path(id): Path<Uuid>, Json(input): Json<SayInput>) -> Result<Json<Card>> {
    Ok(Json(cards::say(&app.db, session.cell, id, input.request_key, &input.text).await?))
}

#[derive(Deserialize, ToSchema)]
pub struct AsideInput {
    request_key: Uuid,
    version: i32,
    surface: Surface,
    /// 미루기에만
    until: Option<DateTime<Utc>>,
}

#[utoipa::path(post, path = "/v1/me/cards/{id}/snooze", params(("id" = Uuid, Path)), request_body = AsideInput, responses((status = 204), (status = 409)))]
async fn snooze(State(app): State<App>, session: Session, Path(id): Path<Uuid>, Json(i): Json<AsideInput>) -> Result<StatusCode> {
    let until = i.until.ok_or(Error::Invalid("bad_time"))?;
    cards::put_aside(&app.db, session.cell, id, i.request_key, i.version, cards::Aside::Snooze(until), i.surface).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(post, path = "/v1/me/cards/{id}/handoff", params(("id" = Uuid, Path)), request_body = AsideInput, responses((status = 204), (status = 409)))]
async fn handoff(State(app): State<App>, session: Session, Path(id): Path<Uuid>, Json(i): Json<AsideInput>) -> Result<StatusCode> {
    cards::put_aside(&app.db, session.cell, id, i.request_key, i.version, cards::Aside::Handoff, i.surface).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize, ToSchema)]
pub struct UndoInput {
    receipt: Option<Uuid>,
}

/// 알려만 드려요를 읽음으로. 결정이 필요한 카드에는 422
#[utoipa::path(post, path = "/v1/me/cards/{id}/read", params(("id" = Uuid, Path)), request_body = AsideInput, responses((status = 204), (status = 409), (status = 422)))]
async fn read(State(app): State<App>, session: Session, Path(id): Path<Uuid>, Json(i): Json<AsideInput>) -> Result<StatusCode> {
    cards::put_aside(&app.db, session.cell, id, i.request_key, i.version, cards::Aside::Read, i.surface).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(post, path = "/v1/me/cards/{id}/undo", params(("id" = Uuid, Path)), request_body = UndoInput, responses((status = 200, body = Card), (status = 409)))]
async fn undo(State(app): State<App>, session: Session, Path(id): Path<Uuid>, Json(input): Json<UndoInput>) -> Result<Json<Card>> {
    Ok(Json(cards::undo(&app.db, session.cell, id, input.receipt).await?))
}

#[derive(Serialize, sqlx::FromRow, ToSchema)]
pub struct Activity {
    id: Uuid,
    card: Uuid,
    kind: String,
    question: String,
    #[schema(value_type = Object)]
    source: Db_<Value>,
    #[schema(value_type = Option<CardOption>)]
    chosen: Option<Db_<CardOption>>,
    edited: bool,
    turn_seq: i32,
    card_state: String,
    receipt: Option<Uuid>,
    receipt_state: Option<String>,
    undoable: Option<bool>,
    remaining_ms: Option<i64>,
    created_at: DateTime<Utc>,
}

#[utoipa::path(get, path = "/v1/me/activity", responses((status = 200, body = Vec<Activity>)))]
async fn activity(State(app): State<App>, session: Session) -> Result<Json<Vec<Activity>>> {
    let mut tx = app.db.cell_tx(session.cell).await?;
    let rows = sqlx::query_as(
        "SELECT a.id, a.card, a.kind, d.question, d.source, a.chosen, a.draft IS NOT NULL AS edited, a.turn_seq,
                d.state AS card_state, r.id AS receipt, r.state AS receipt_state, r.undoable,
                CASE WHEN r.state = 'waiting'
                  THEN GREATEST(0, (EXTRACT(EPOCH FROM (r.run_after - clock_timestamp())) * 1000)::bigint) END AS remaining_ms,
                a.created_at
         FROM catchup.card_answers a
         JOIN catchup.decision_cards d ON d.cell = a.cell AND d.id = a.card
         LEFT JOIN catchup.action_receipts r ON r.cell = a.cell AND r.answer = a.id
         ORDER BY a.created_at DESC LIMIT 200",
    )
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(rows))
}

#[utoipa::path(post, path = "/v1/me/cards/{id}/promote", params(("id" = Uuid, Path)), responses((status = 200, body = Card)))]
async fn promote(State(app): State<App>, session: Session, Path(id): Path<Uuid>) -> Result<Json<Card>> {
    Ok(Json(cards::promote(&app.db, session.cell, id).await?))
}

/// 비서가 아는 것(3.6단계). 내 답 · 고친 초안 · 내 말 · 끝난 세션 · 내가 알려 준 것에서 읽어 내요
#[utoipa::path(get, path = "/v1/me/memories", responses((status = 200, body = Vec<crate::memory::Memory>)))]
async fn memories(State(app): State<App>, session: Session) -> Result<Json<Vec<crate::memory::Memory>>> {
    Ok(Json(crate::memory::list(&app.db, session.cell).await?))
}

/// 직접 알려 주기
#[utoipa::path(post, path = "/v1/me/memories", request_body = crate::memory::TellInput, responses((status = 204), (status = 422)))]
async fn tell_memory(State(app): State<App>, session: Session, Json(input): Json<crate::memory::TellInput>) -> Result<StatusCode> {
    crate::memory::tell(&app.db, session.cell, input.request_key, &input.text).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// 기억 고치기
#[utoipa::path(put, path = "/v1/me/memories/{key}", params(("key" = String, Path)), request_body = crate::memory::EditInput,
    responses((status = 204), (status = 404), (status = 422)))]
async fn edit_memory(
    State(app): State<App>,
    session: Session,
    Path(key): Path<String>,
    Json(input): Json<crate::memory::EditInput>,
) -> Result<StatusCode> {
    crate::memory::edit(&app.db, session.cell, &key, &input.text).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// 기억 지우기 — 다음 판단부터 쓰지 않아요
#[utoipa::path(delete, path = "/v1/me/memories/{key}", params(("key" = String, Path)), responses((status = 204), (status = 404)))]
async fn forget_memory(State(app): State<App>, session: Session, Path(key): Path<String>) -> Result<StatusCode> {
    crate::memory::forget(&app.db, session.cell, &key).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// 비서와 주고받은 것(3.6단계 · 명령이 들어오는 셋째 길)
#[utoipa::path(get, path = "/v1/me/assistant", responses((status = 200, body = Vec<Message>)))]
async fn assistant_thread(State(app): State<App>, session: Session) -> Result<Json<Vec<Message>>> {
    Ok(Json(assistant::list(&app.db, session.cell).await?))
}

/// 비서에게 말하기 — 기억할 것 · 궁금한 것 · 맡길 일. 먼저 받아 두고 답은 뒤따라와요
#[utoipa::path(post, path = "/v1/me/assistant", request_body = assistant::SayInput,
    responses((status = 200, body = Message), (status = 409), (status = 422)))]
async fn tell_assistant(State(app): State<App>, session: Session, Json(input): Json<assistant::SayInput>) -> Result<Json<Message>> {
    Ok(Json(assistant::say_at(&app.db, session.cell, input.request_key, &input.text, input.card).await?))
}

/// 제안한 일을 맡겨요(코딩 세션이 생겨요)
#[utoipa::path(post, path = "/v1/me/assistant/{id}/accept", params(("id" = Uuid, Path)),
    responses((status = 200, body = Message), (status = 404), (status = 409)))]
async fn accept_proposal(State(app): State<App>, session: Session, Path(id): Path<Uuid>) -> Result<Json<Message>> {
    Ok(Json(assistant::accept(&app.db, session.cell, id).await?))
}

/// 답을 기다리지 않고 내 말 그대로 기억해 둬요
#[utoipa::path(post, path = "/v1/me/assistant/{id}/keep", params(("id" = Uuid, Path)),
    responses((status = 200, body = Message), (status = 404), (status = 409)))]
async fn keep_words(State(app): State<App>, session: Session, Path(id): Path<Uuid>) -> Result<Json<Message>> {
    Ok(Json(assistant::keep(&app.db, session.cell, id).await?))
}

#[utoipa::path(get, path = "/v1/me/connections", responses((status = 200, body = Vec<Connection>)))]
async fn list_connections(State(app): State<App>, session: Session) -> Result<Json<Vec<Connection>>> {
    Ok(Json(connections::list(&app.db, session.cell).await?))
}

#[utoipa::path(delete, path = "/v1/me/connections/{id}", params(("id" = Uuid, Path)), responses((status = 204), (status = 404)))]
async fn disconnect(State(app): State<App>, session: Session, Path(id): Path<Uuid>) -> Result<StatusCode> {
    connections::remove(&app.db, session.cell, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize, ToSchema)]
pub struct PushKey {
    public_key: String,
}

#[utoipa::path(get, path = "/v1/me/push", responses((status = 200, body = PushKey)))]
async fn push_key(State(app): State<App>, _session: Session) -> Json<PushKey> {
    Json(PushKey { public_key: app.settings.push_public_key.clone() })
}

#[derive(Serialize, ToSchema)]
pub struct PushDevice {
    id: Uuid,
}

#[utoipa::path(post, path = "/v1/me/push", request_body = Subscription, responses((status = 200, body = PushDevice), (status = 422)))]
async fn push_on(State(app): State<App>, session: Session, Json(input): Json<Subscription>) -> Result<Json<PushDevice>> {
    Ok(Json(PushDevice { id: push::register(&app.db, &app.master, session.cell, &input).await? }))
}

#[utoipa::path(delete, path = "/v1/me/push/{id}", params(("id" = Uuid, Path)), responses((status = 204), (status = 404)))]
async fn push_off(State(app): State<App>, session: Session, Path(id): Path<Uuid>) -> Result<StatusCode> {
    push::unregister(&app.db, session.cell, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(get, path = "/v1/me/codex", responses((status = 200, body = CodexStatus)))]
async fn codex_status(State(app): State<App>, session: Session) -> Result<Response> {
    let status = account::status(&app.db, &app.master, session.cell).await?;
    // 기기 코드가 어디에도 남지 않게
    Ok(([(header::CACHE_CONTROL, "no-store")], Json(status)).into_response())
}

#[utoipa::path(post, path = "/v1/me/codex/login", responses((status = 202), (status = 409)))]
async fn codex_login(State(app): State<App>, session: Session) -> Result<StatusCode> {
    account::want(&app.db, session.cell, Want::Login).await?;
    Ok(StatusCode::ACCEPTED)
}

#[utoipa::path(delete, path = "/v1/me/codex/login", responses((status = 202)))]
async fn codex_cancel(State(app): State<App>, session: Session) -> Result<StatusCode> {
    account::want(&app.db, session.cell, Want::Cancel).await?;
    Ok(StatusCode::ACCEPTED)
}

#[utoipa::path(delete, path = "/v1/me/codex", responses((status = 202)))]
async fn codex_logout(State(app): State<App>, session: Session) -> Result<StatusCode> {
    account::want(&app.db, session.cell, Want::Logout).await?;
    Ok(StatusCode::ACCEPTED)
}

#[utoipa::path(get, path = "/v1/me/agent-sessions", responses((status = 200, body = Vec<AgentSession>)))]
async fn list_sessions(State(app): State<App>, session: Session) -> Result<Json<Vec<AgentSession>>> {
    Ok(Json(sessions::list(&app.db, session.cell).await?))
}

#[utoipa::path(post, path = "/v1/me/agent-sessions", request_body = StartInput,
    responses((status = 200, body = AgentSession), (status = 409), (status = 422)))]
async fn start_session(State(app): State<App>, session: Session, Json(input): Json<StartInput>) -> Result<Json<AgentSession>> {
    Ok(Json(sessions::create(&app.db, session.cell, &input).await?))
}

#[utoipa::path(delete, path = "/v1/me/agent-sessions/{id}", params(("id" = Uuid, Path)), responses((status = 202), (status = 404)))]
async fn stop_session(State(app): State<App>, session: Session, Path(id): Path<Uuid>) -> Result<StatusCode> {
    sessions::cancel(&app.db, session.cell, id).await?;
    Ok(StatusCode::ACCEPTED)
}

#[utoipa::path(get, path = "/v1/me/agent-sessions/{id}/patch", params(("id" = Uuid, Path)),
    responses((status = 200, body = String, content_type = "text/plain"), (status = 404)))]
async fn session_patch(State(app): State<App>, session: Session, Path(id): Path<Uuid>) -> Result<Response> {
    let patch = sessions::patch(&app.db, session.cell, id).await?;
    // 에이전트가 만든 글이라 브라우저가 문서로 열지 못하게
    let headers = [
        (header::CONTENT_TYPE, "text/plain; charset=utf-8"),
        (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        (header::CONTENT_DISPOSITION, "attachment; filename=\"changes.patch\""),
        (header::CACHE_CONTROL, "no-store"),
    ];
    Ok((headers, patch).into_response())
}

#[derive(OpenApi)]
#[openapi(
    paths(
        login,
        logout,
        passkey_ask,
        passkey_login,
        passkeys,
        passkey_start,
        passkey_add,
        passkey_remove,
        me,
        list_cards,
        answer,
        say,
        snooze,
        handoff,
        read,
        undo,
        activity,
        promote,
        memories,
        tell_memory,
        edit_memory,
        forget_memory,
        assistant_thread,
        tell_assistant,
        accept_proposal,
        keep_words,
        list_connections,
        disconnect,
        push_key,
        push_on,
        push_off,
        codex_status,
        codex_login,
        codex_cancel,
        codex_logout,
        list_sessions,
        start_session,
        stop_session,
        session_patch
    ),
    components(schemas(
        CodexStatus,
        Message,
        AgentSession,
        StartInput,
        Card,
        CardOption,
        Effect,
        Receipt,
        Turn,
        AnswerInput,
        Surface,
        CardList,
        Activity,
        Me,
        Connection,
        Subscription
    ))
)]
pub struct Api;
