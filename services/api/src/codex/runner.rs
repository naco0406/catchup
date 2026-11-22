//! 세션 돌리기. DB 가 원본이고, 이 일꾼은 언제 죽어도 다시 읽어서 이어요.
//!
//! queued → starting(자리 · 저장소) → running ⇄ waiting → finishing(patch 꺼내기 · 자리 비우기) → done | failed | cancelled
//! app-server 가 바뀌면(boot 가 다르면) thread/resume + 새 차례로 이어요.

use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use serde_json::{Value, json};
use sqlx::types::Json;
use uuid::Uuid;

/// 비동기 질문의 boot. 어떤 app-server 도 이 요청의 답을 기다리고 있지 않아요
const ASYNC: Uuid = Uuid::nil();

use super::{
    account::{self, Trouble},
    backoff, gateway,
    hub::{CALL, Hub, Running, unavailable},
    repo,
    request::{self, Asking, Kind},
    rpc::Incoming,
    sandbox::{self, Hello, Owner},
    sessions::{self, Request, SESSION, Session},
};
use crate::{
    cards,
    db::emit,
    error::{Error, Result},
};

const STARTING: Duration = Duration::from_secs(60);
const MAX_RESUMES: i32 = 5;
/// '내가 직접'도 10초 안에 되돌릴 수 있게
const HANDOFF_HOLD: f64 = cards::HOLD_SECS;
const INSTRUCTIONS: &str = "You are working in an isolated sandbox at /workspace. It has no internet access and no credentials. \
Available tools include git, python3, gcc and cargo. Do not try to push or deploy: the changes in /workspace are collected when you \
finish. When a decision belongs to the user, ask with request_user_input (not the async variant) and give concrete options. Finish with a short summary in the \
user's language.";

fn environments(environment: &str) -> Value {
    json!([{ "environmentId": environment, "cwd": "/workspace" }])
}

/// 이 세션 · 이 세대의 실행 환경을 app-server 에 등록해요
async fn environment(hub: &Hub, running: &Running, owner: &Owner, slot: i32, seat: Uuid) -> Result<String> {
    let id = format!("box-{}-{}", owner.session.simple(), seat.simple());
    let mut registered = running.registered.lock().await;
    if !registered.contains(&id) {
        let socket = hub.socket(slot).ok_or(Error::Invalid("no_slot"))?.to_path_buf();
        let lane = hub.lanes.open(socket, owner.clone(), seat).await?;
        let params = json!({ "environmentId": id, "execServerUrl": lane.url, "authBearerToken": lane.bearer });
        running.server.call("environment/add", params, CALL).await.map_err(unavailable)?;
        registered.insert(id.clone());
    }
    Ok(id)
}

fn text(text: &str) -> Value {
    json!([{ "type": "text", "text": text, "text_elements": [] }])
}

fn sandbox_down<E>(_: E) -> Error {
    Error::Conflict("sandbox_unavailable")
}

/// item/started 로 먼저 오는 파일 바꿈을 승인 요청까지 들고 있어요
#[derive(Default)]
pub struct Seen {
    changes: HashMap<String, Value>,
    last_text: HashMap<String, String>,
}

impl Seen {
    fn note(&mut self, params: &Value) {
        let item = &params["item"];
        if self.changes.len() > 256 {
            self.changes.clear();
        }
        if self.last_text.len() > 256 {
            self.last_text.clear();
        }
        match (item["type"].as_str(), item["id"].as_str(), params["threadId"].as_str()) {
            (Some("fileChange"), Some(id), _) => {
                self.changes.insert(id.to_owned(), item["changes"].clone());
            }
            (Some("agentMessage"), _, Some(thread)) => {
                if let Some(text) = item["text"].as_str().filter(|t| !t.is_empty()) {
                    self.last_text.insert(thread.to_owned(), text.chars().take(4000).collect());
                }
            }
            _ => {}
        }
    }
}

/// app-server 의 사건 하나. 여기서는 app-server 의 답을 기다리지 않아요(읽는 줄이 막혀요)
pub async fn incoming(hub: &Hub, cell: Uuid, running: &Running, seen: &mut Seen, incoming: &Incoming) -> Result<()> {
    match incoming {
        Incoming::Request { id, method, params } => match asked(hub, cell, running, seen, id, method, params).await {
            Ok(true) => Ok(()),
            Ok(false) => running.server.refuse(id).await.map_err(unavailable),
            // 못 남긴 요청은 거절 — 카드 없이 영영 기다리지 않게
            Err(error) => {
                let _ = running.server.refuse(id).await;
                Err(error)
            }
        },
        Incoming::Notification { method, params } => {
            match method.as_str() {
                "item/completed" if params["item"]["delivery"] == "async" && params["item"]["questions"].is_array() => {
                    asked_async(hub, cell, params).await?;
                }
                "item/started" | "item/completed" if params["item"]["delivery"] != "async" => seen.note(params),
                "turn/completed" => turn_ended(hub, cell, seen, params).await?,
                _ => {}
            }
            Ok(())
        }
    }
}

/// 세션의 요청이면 true
async fn asked(hub: &Hub, cell: Uuid, running: &Running, seen: &Seen, rpc: &Value, method: &str, params: &Value) -> Result<bool> {
    let Some(thread) = params["threadId"].as_str() else { return Ok(false) };
    let mut tx = hub.db.cell_tx(cell).await?;
    let session: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT id, title FROM catchup.agent_sessions WHERE thread_id = $1 AND state IN ('starting', 'running', 'waiting') FOR UPDATE",
    )
    .bind(thread)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((session, title)) = session else { return Ok(false) };

    if method == "item/permissions/requestApproval" {
        // 샌드박스의 경계는 넓히지 않아요
        tx.commit().await?;
        running.server.respond(rpc, json!({ "permissions": {} })).await.map_err(unavailable)?;
        return Ok(true);
    }
    let Some(kind) = Kind::of_method(method) else { return Ok(false) };

    if kind == Kind::Command {
        // 재시작 전에 허용한 것과 글자까지 같은 명령만, 한 번만
        let approved: Option<Uuid> = sqlx::query_scalar(
            "UPDATE catchup.agent_requests SET state = 'delivered', delivered_at = now()
             WHERE id = (SELECT id FROM catchup.agent_requests
                         WHERE session = $1 AND state = 'preapproved' AND params->'command' = $2 AND params->'cwd' = $3
                         ORDER BY created_at LIMIT 1)
             RETURNING id",
        )
        .bind(session)
        .bind(Json(&params["command"]))
        .bind(Json(&params["cwd"]))
        .fetch_optional(&mut *tx)
        .await?;
        if approved.is_some() {
            tx.commit().await?;
            running.server.respond(rpc, json!({ "decision": "accept" })).await.map_err(unavailable)?;
            return Ok(true);
        }
    }

    let questions: Vec<Value> = match kind {
        Kind::Question => params["questions"].as_array().into_iter().flatten().take(3).cloned().collect(),
        _ => vec![Value::Null],
    };
    // 비밀값은 묻지 않아요
    if questions.is_empty() || questions.iter().any(|q| q["isSecret"] == true) {
        tx.commit().await?;
        running.server.respond(rpc, json!({ "answers": {} })).await.map_err(unavailable)?;
        return Ok(true);
    }
    let lang: String = sqlx::query_scalar("SELECT lang FROM catchup.cells").fetch_one(&mut *tx).await?;
    let changes = params["itemId"].as_str().and_then(|i| seen.changes.get(i)).cloned().unwrap_or(Value::Null);
    for question in &questions {
        let id = Uuid::new_v4();
        let asking = Asking { id, kind, params, question, changes: &changes, title: &title, ko: lang == "ko" };
        let card = cards::create_in(&mut tx, cell, &asking.card()).await?;
        sqlx::query(
            "INSERT INTO catchup.agent_requests (cell, id, session, boot, rpc_id, kind, question_id, params, card)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        )
        .bind(cell)
        .bind(id)
        .bind(session)
        .bind(running.boot)
        .bind(Json(rpc))
        .bind(kind.as_str())
        .bind(question["id"].as_str().unwrap_or_default())
        .bind(Json(params))
        .bind(card)
        .execute(&mut *tx)
        .await?;
    }
    sessions::set_state(&mut tx, session, "waiting", None).await?;
    tx.commit().await?;
    Ok(true)
}

/// `request_user_input_async` — 요청으로 오지 않고 글로만 흘러가요(실측). 카드로 남기고, 답은 말로 전해요
async fn asked_async(hub: &Hub, cell: Uuid, params: &Value) -> Result<()> {
    let (Some(thread), Some(item)) = (params["threadId"].as_str(), params["item"]["id"].as_str()) else { return Ok(()) };
    let mut tx = hub.db.cell_tx(cell).await?;
    let session: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT id, title FROM catchup.agent_sessions WHERE thread_id = $1 AND state IN ('starting', 'running', 'waiting') FOR UPDATE",
    )
    .bind(thread)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((session, title)) = session else { return Ok(()) };
    let rpc = json!({ "thread": thread, "item": item });
    let seen: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM catchup.agent_requests WHERE session = $1 AND rpc_id = $2)")
        .bind(session)
        .bind(Json(&rpc))
        .fetch_one(&mut *tx)
        .await?;
    if seen {
        return Ok(());
    }
    let questions = async_questions(&params["item"]["questions"]);
    if questions.is_empty() {
        return Ok(());
    }
    let lang: String = sqlx::query_scalar("SELECT lang FROM catchup.cells").fetch_one(&mut *tx).await?;
    let stored = json!({ "questions": questions });
    for question in &questions {
        let id = Uuid::new_v4();
        let asking =
            Asking { id, kind: Kind::Question, params: &stored, question, changes: &Value::Null, title: &title, ko: lang == "ko" };
        let card = cards::create_in(&mut tx, cell, &asking.card()).await?;
        sqlx::query(
            "INSERT INTO catchup.agent_requests (cell, id, session, boot, rpc_id, kind, question_id, params, card)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        )
        .bind(cell)
        .bind(id)
        .bind(session)
        .bind(ASYNC)
        .bind(Json(&rpc))
        .bind(Kind::Question.as_str())
        .bind(question["id"].as_str().unwrap_or_default())
        .bind(Json(&stored))
        .bind(card)
        .execute(&mut *tx)
        .await?;
    }
    sessions::set_state(&mut tx, session, "waiting", None).await?;
    tx.commit().await?;
    Ok(())
}

/// 비동기 질문(`title` · 글 선택지) → 보통 질문의 모양
fn async_questions(given: &Value) -> Vec<Value> {
    given
        .as_array()
        .into_iter()
        .flatten()
        .filter(|q| q["title"].as_str().is_some_and(|t| !t.trim().is_empty()))
        .take(3)
        .enumerate()
        .map(|(i, q)| {
            let options: Vec<Value> =
                q["options"].as_array().into_iter().flatten().filter_map(|o| o.as_str()).map(|o| json!({ "label": o })).collect();
            json!({ "id": i.to_string(), "question": q["title"], "options": options })
        })
        .collect()
}

async fn turn_ended(hub: &Hub, cell: Uuid, seen: &mut Seen, params: &Value) -> Result<()> {
    let Some(thread) = params["threadId"].as_str() else { return Ok(()) };
    let mut tx = hub.db.cell_tx(cell).await?;
    let session: Option<Session> = sqlx::query_as(&format!(
        "SELECT {SESSION} FROM catchup.agent_sessions WHERE thread_id = $1 AND state IN ('starting', 'running', 'waiting') FOR UPDATE"
    ))
    .bind(thread)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(session) = session else { return Ok(()) };
    let turn = &params["turn"];
    if session.turn_id.as_deref().is_some_and(|ours| turn["id"].as_str().is_some_and(|id| id != ours)) {
        return Ok(()); // 앞 차례의 늦은 알림
    }
    let summary = seen.last_text.remove(thread);
    let mut trouble = None;
    match turn["status"].as_str() {
        Some("completed") => {
            let still_asking: bool = sqlx::query_scalar(
                "SELECT EXISTS (SELECT 1 FROM catchup.agent_requests WHERE session = $1 AND boot = $2 AND state IN ('waiting', 'answered'))",
            )
            .bind(session.id)
            .bind(ASYNC)
            .fetch_one(&mut *tx)
            .await?;
            if still_asking {
                // 물어 놓고 차례를 끝냈어요. 답이 오면 새 차례로 이어요
                sessions::set_state(&mut tx, session.id, "waiting", None).await?;
                sqlx::query("UPDATE catchup.agent_sessions SET boot = NULL WHERE id = $1").bind(session.id).execute(&mut *tx).await?;
            } else {
                sessions::finishing(&mut tx, session.id, "done", None, summary.as_deref()).await?;
            }
        }
        Some("interrupted") => {
            let stopped: bool = sqlx::query_scalar(
                "SELECT EXISTS (SELECT 1 FROM catchup.agent_requests WHERE session = $1 AND answer->>'decision' = 'cancel')",
            )
            .bind(session.id)
            .fetch_one(&mut *tx)
            .await?;
            let (outcome, code) =
                if stopped || session.cancel_wanted { ("cancelled", None) } else { ("failed", Some("turn_interrupted")) };
            sessions::finishing(&mut tx, session.id, outcome, code, summary.as_deref()).await?;
        }
        _ => {
            let code = gateway::why(&turn["error"]);
            trouble = match code {
                "signed_out" => Some(Trouble::Expired),
                "limit_reached" => Some(Trouble::Limit { resets_at: None }),
                _ => None,
            };
            if code == "signed_out" {
                // 자리와 작업은 두고, 다시 로그인하면 이어요
                sessions::set_state(&mut tx, session.id, "blocked", Some(code)).await?;
                sqlx::query("UPDATE catchup.agent_sessions SET boot = NULL WHERE id = $1").bind(session.id).execute(&mut *tx).await?;
            } else {
                sessions::finishing(&mut tx, session.id, "failed", Some(code), summary.as_deref()).await?;
            }
        }
    }
    tx.commit().await?;
    match trouble {
        Some(Trouble::Expired) => hub.expired(cell).await,
        Some(trouble) => account::raise(&hub.db, cell, trouble).await,
        None => Ok(()),
    }
}

/// 이 칸의 세션을 한 걸음씩
pub async fn tick(hub: &Hub, cell: Uuid) -> Result<()> {
    for session in sessions::active(&hub.db, cell).await? {
        // 멈추라는 말은 기다리지 않아요
        let urgent = session.cancel_wanted && session.state != "finishing";
        if !urgent && !hub.retries.ready(session.id, Instant::now()) {
            continue;
        }
        let error = match step(hub, cell, &session).await {
            Ok(()) => {
                hub.retries.success(session.id);
                continue;
            }
            Err(error) => error,
        };
        let times = hub.retries.failure(session.id, Instant::now());
        tracing::warn!(%cell, session = %session.id, code = error.code(), times, "session step failed");
        // 다시 해도 같은 것, 또는 여러 번 다시 해도 안 되는 것만 끝내요
        let hopeless = matches!(error, Error::Invalid(_))
            || matches!(error, Error::Conflict(code) if code.starts_with("repo_") || code == "import_failed")
            || (times >= backoff::GIVE_UP && matches!(error, Error::Conflict(_)));
        if !hopeless {
            continue;
        }
        if session.state == "finishing" {
            // 자리에 못 닿아도 세션은 끝내요. 자리는 다음에 찾는 세션이 비워요
            let outcome = session.outcome.as_deref().unwrap_or("failed");
            sessions::finished(&hub.db, cell, &session, outcome, None, Some("patch_not_saved")).await?;
            hub.lanes.close(session.id);
        } else {
            let mut tx = hub.db.cell_tx(cell).await?;
            sessions::finishing(&mut tx, session.id, "failed", Some(error.code()), None).await?;
            tx.commit().await?;
        }
        hub.retries.success(session.id);
    }
    Ok(())
}

async fn step(hub: &Hub, cell: Uuid, session: &Session) -> Result<()> {
    if session.state == "finishing" {
        return finish(hub, cell, session).await;
    }
    if session.cancel_wanted {
        return cancel(hub, cell, session).await;
    }
    if session.state == "queued" {
        return take_slot(hub, cell, session).await;
    }
    let signed_in = account::load_status(&hub.db, cell).await? == "in";
    if !signed_in {
        let mut tx = hub.db.cell_tx(cell).await?;
        sessions::set_state(&mut tx, session.id, "blocked", Some("signed_out")).await?;
        tx.commit().await?;
        return Ok(());
    }
    if session.thread_id.is_none() { start(hub, cell, session).await } else { follow(hub, cell, session).await }
}

async fn cancel(hub: &Hub, cell: Uuid, session: &Session) -> Result<()> {
    if let (Some(thread), Some(turn), Some(running)) = (&session.thread_id, &session.turn_id, hub.current(cell).await)
        && session.boot == Some(running.boot)
    {
        let _ = running.server.call("turn/interrupt", json!({ "threadId": thread, "turnId": turn }), CALL).await;
    }
    let mut tx = hub.db.cell_tx(cell).await?;
    sessions::finishing(&mut tx, session.id, "cancelled", None, None).await?;
    tx.commit().await?;
    Ok(())
}

async fn take_slot(hub: &Hub, cell: Uuid, session: &Session) -> Result<()> {
    let owner = Owner { cell, session: session.id };
    for (number, socket) in hub.paths.sandboxes.iter() {
        let Ok(status) = sandbox::ask(socket, &Hello::Status).await else { continue };
        match &status.owner {
            Some(found) if *found == owner => {}
            Some(found) => {
                // 끝난 세션이 못 비우고 간 자리(비우다 죽음)
                if abandoned(hub, found, *number).await? {
                    let _ = sandbox::ask(socket, &Hello::Release(found.clone())).await;
                }
                continue;
            }
            None => {
                if !sandbox::ask(socket, &Hello::Claim(owner.clone())).await.map(|r| r.ok).unwrap_or(false) {
                    continue;
                }
            }
        }
        let mut tx = hub.db.cell_tx(cell).await?;
        let taken = sqlx::query(
            "UPDATE catchup.agent_sessions SET slot = $2, state = 'starting', updated_at = now() WHERE id = $1 AND state = 'queued'",
        )
        .bind(session.id)
        .bind(number)
        .execute(&mut *tx)
        .await;
        return match taken {
            Ok(_) => {
                emit(&mut tx, "session", None).await?;
                tx.commit().await?;
                Ok(())
            }
            Err(error) => {
                let _ = sandbox::ask(socket, &Hello::Release(owner)).await;
                Err(error.into())
            }
        };
    }
    // 빈 자리가 없으면 줄에서 기다려요
    Ok(())
}

async fn abandoned(hub: &Hub, owner: &Owner, slot: i32) -> Result<bool> {
    let mut tx = hub.db.cell_tx(owner.cell).await?;
    let found: Option<(String, Option<i32>)> = sqlx::query_as("SELECT state, slot FROM catchup.agent_sessions WHERE id = $1")
        .bind(owner.session)
        .fetch_optional(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(match found {
        None => true,
        Some((state, held)) => matches!(state.as_str(), "done" | "failed" | "cancelled") || held.is_some_and(|h| h != slot),
    })
}

async fn start(hub: &Hub, cell: Uuid, session: &Session) -> Result<()> {
    let slot = session.slot.ok_or(Error::Invalid("no_slot"))?;
    let socket = hub.socket(slot).ok_or(Error::Invalid("no_slot"))?;
    let owner = Owner { cell, session: session.id };
    let claimed = sandbox::ask(socket, &Hello::Claim(owner.clone())).await.map_err(sandbox_down)?;
    if !claimed.ok {
        return Err(Error::Invalid("slot_lost"));
    }
    let seat = claimed.seat.ok_or(Error::Conflict("sandbox_unavailable"))?;
    // app-server 부터 — 못 뜨는데 저장소를 받지 않게
    let running = hub.running(cell).await?;
    let archive = match &session.repo {
        Some(name) => repo::fetch(name).await?,
        None => vec![],
    };
    sandbox::send_archive(socket, &owner, &archive).await.map_err(|_| Error::Conflict("import_failed"))?;
    let environment = environment(hub, &running, &owner, slot, seat).await?;
    // 맥락 꾸러미: 이 저장소(일)에서 지난번에 정한 것 · 끝낸 것, 내가 알려 준 것
    let remembered = {
        let mut tx = hub.db.cell_tx(cell).await?;
        let subject = session.repo.clone().unwrap_or_else(|| session.title.clone());
        let lines = crate::memory::pack(&mut tx, cell, "session", &subject, None).await?;
        tx.commit().await?;
        lines
    };
    let params = json!({
        "approvalPolicy": "untrusted",
        // 경계는 컨테이너예요(망 · 비밀 없음). 안쪽 bwrap 은 쓸 수 없어요(실측)
        "sandbox": "danger-full-access",
        "environments": environments(&environment),
        "developerInstructions": format!("{INSTRUCTIONS}{}", crate::memory::for_model(&remembered)),
    });
    let started = running.server.call("thread/start", params, STARTING).await.map_err(unavailable)?;
    let thread = started["thread"]["id"].as_str().ok_or(Error::Conflict("codex_unavailable"))?;
    let mut tx = hub.db.cell_tx(cell).await?;
    sqlx::query(
        "UPDATE catchup.agent_sessions
         SET thread_id = $2, boot = $3, sandbox_boot = $4, turn_id = NULL, state = 'running', error_code = NULL, started_at = now(), updated_at = now()
         WHERE id = $1",
    )
    .bind(session.id)
    .bind(thread)
    .bind(running.boot)
    .bind(seat)
    .execute(&mut *tx)
    .await?;
    emit(&mut tx, "session", None).await?;
    tx.commit().await?;
    begin_turn(hub, cell, session.id, &running, thread, &environment, &session.task).await
}

async fn begin_turn(
    hub: &Hub,
    cell: Uuid,
    session: Uuid,
    running: &Running,
    thread: &str,
    environment: &str,
    say: &str,
) -> Result<()> {
    let params = json!({ "threadId": thread, "environments": environments(environment), "input": text(say) });
    let turn = running.server.call("turn/start", params, STARTING).await;
    let mut tx = hub.db.cell_tx(cell).await?;
    match &turn {
        // 다음 걸음이 thread/resume 로 다시 해요
        Err(_) => {
            sqlx::query("UPDATE catchup.agent_sessions SET boot = NULL WHERE id = $1").bind(session).execute(&mut *tx).await?;
        }
        Ok(turn) => {
            sqlx::query("UPDATE catchup.agent_sessions SET turn_id = $2 WHERE id = $1")
                .bind(session)
                .bind(turn["turn"]["id"].as_str())
                .execute(&mut *tx)
                .await?;
        }
    }
    tx.commit().await?;
    turn.map(|_| ()).map_err(unavailable)
}

async fn follow(hub: &Hub, cell: Uuid, session: &Session) -> Result<()> {
    let slot = session.slot.ok_or(Error::Invalid("no_slot"))?;
    let socket = hub.socket(slot).ok_or(Error::Invalid("no_slot"))?;
    // 샌드박스가 다시 뜨는 중이면 다음 걸음에
    let seat = sandbox::ask(socket, &Hello::Status).await.map_err(sandbox_down)?;
    let generation = seat.seat.ok_or(Error::Conflict("sandbox_unavailable"))?;
    if seat.owner != Some(Owner { cell, session: session.id }) {
        return Err(Error::Invalid("slot_lost"));
    }
    if seat.full {
        return Err(Error::Invalid("workspace_full"));
    }
    handed_off(hub, cell, session.id).await?;
    let open = sessions::open_requests(&hub.db, cell, session.id).await?;

    let current = hub.current(cell).await;
    if let Some(running) = &current
        && session.boot == Some(running.boot)
        && session.sandbox_boot != Some(generation)
    {
        // 실행 연결이 죽었어요. 답을 전하기 전에 차례를 끊고, 새 실행 환경으로 이어요
        return leave_dead_sandbox(hub, cell, session, running).await;
    }
    match current {
        Some(running) if session.boot == Some(running.boot) => {
            running.touch();
            deliver(hub, cell, session, &running, &open).await
        }
        _ => {
            // 묻던 app-server 는 없어요. 답이 다 올 때까지 카드는 그대로
            if open.iter().any(|r| r.state == "waiting") {
                let mut tx = hub.db.cell_tx(cell).await?;
                sessions::set_state(&mut tx, session.id, "waiting", None).await?;
                tx.commit().await?;
                return Ok(());
            }
            resume(hub, cell, session, slot, generation, &open).await
        }
    }
}

async fn leave_dead_sandbox(hub: &Hub, cell: Uuid, session: &Session, running: &Running) -> Result<()> {
    let mut tx = hub.db.cell_tx(cell).await?;
    // 먼저 적어요 — 끊긴 차례의 '끝남' 알림이 세션을 끝내지 않게
    sqlx::query("UPDATE catchup.agent_sessions SET boot = NULL, turn_id = 'left' WHERE id = $1")
        .bind(session.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    if let (Some(thread), Some(turn)) = (&session.thread_id, &session.turn_id) {
        let _ = running.server.call("turn/interrupt", json!({ "threadId": thread, "turnId": turn }), CALL).await;
    }
    Ok(())
}

async fn handed_off(hub: &Hub, cell: Uuid, session: Uuid) -> Result<()> {
    let mut tx = hub.db.cell_tx(cell).await?;
    let left: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT r.id, r.kind FROM catchup.agent_requests r JOIN catchup.decision_cards d ON d.cell = r.cell AND d.id = r.card
         WHERE r.session = $1 AND r.state = 'waiting' AND d.state = 'handed_off'
           AND d.updated_at <= now() - make_interval(secs => $2)",
    )
    .bind(session)
    .bind(HANDOFF_HOLD)
    .fetch_all(&mut *tx)
    .await?;
    for (id, kind) in left {
        sqlx::query("UPDATE catchup.agent_requests SET state = 'answered', answer = $2, answered_at = now() WHERE id = $1 AND state = 'waiting'")
            .bind(id)
            .bind(Json(request::left_to_the_person(Kind::parse(&kind))))
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// 같은 프로세스가 아직 묻고 있으면 그 요청에 답해요
async fn deliver(hub: &Hub, cell: Uuid, session: &Session, running: &Running, open: &[Request]) -> Result<()> {
    let mut groups: HashMap<String, Vec<&Request>> = HashMap::new();
    for request in open.iter().filter(|r| r.boot == running.boot) {
        groups.entry(request.rpc_id.0.to_string()).or_default().push(request);
    }
    let mut sent = 0;
    if let (Some(thread), Some(turn)) = (&session.thread_id, &session.turn_id) {
        for request in open.iter().filter(|r| r.boot == ASYNC && r.state == "answered") {
            let question = request.params.0["questions"]
                .as_array()
                .and_then(|qs| qs.iter().find(|q| q["id"].as_str() == Some(&request.question_id)))
                .cloned()
                .unwrap_or(Value::Null);
            let answer = request.answer.as_ref().map(|a| a.0.clone()).unwrap_or_default();
            let said = request::recap(Kind::Question, &request.params.0, &question, &answer);
            let params = json!({ "threadId": thread, "expectedTurnId": turn, "input": text(&said) });
            // 차례가 그사이 끝났으면 남겨 둬요 — 새 차례가 들고 가요
            if running.server.call("turn/steer", params, CALL).await.is_err() {
                continue;
            }
            let mut tx = hub.db.cell_tx(cell).await?;
            sqlx::query(
                "UPDATE catchup.agent_requests SET state = 'delivered', delivered_at = now() WHERE id = $1 AND state = 'answered'",
            )
            .bind(request.id)
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            sent += 1;
        }
    }
    for group in groups.values() {
        // 질문 여러 개는 다 답한 뒤 한 번에
        if group.iter().any(|r| r.state != "answered") {
            continue;
        }
        let kind = Kind::parse(&group[0].kind);
        let answers: Vec<(String, Value)> =
            group.iter().map(|r| (r.question_id.clone(), r.answer.as_ref().map(|a| a.0.clone()).unwrap_or_default())).collect();
        // 먼저 '전함'을 남겨요. 쓰다 죽으면 이어 갈 때 다시 묻게 되지, 두 번 실행되지는 않아요
        let mut tx = hub.db.cell_tx(cell).await?;
        for request in group {
            sqlx::query(
                "UPDATE catchup.agent_requests SET state = 'delivered', delivered_at = now() WHERE id = $1 AND state = 'answered'",
            )
            .bind(request.id)
            .execute(&mut *tx)
            .await?;
        }
        emit(&mut tx, "session", None).await?;
        tx.commit().await?;
        running.server.respond(&group[0].rpc_id.0, request::wire(kind, &answers)).await.map_err(unavailable)?;
        sent += group.len();
        if let Some(note) = answers.iter().find_map(|(_, a)| a["note"].as_str())
            && let (Some(thread), Some(turn)) = (&session.thread_id, &session.turn_id)
        {
            let params = json!({ "threadId": thread, "expectedTurnId": turn, "input": text(note) });
            if running.server.call("turn/steer", params, CALL).await.is_err() {
                tracing::warn!(%cell, session = %session.id, "could not pass the user's note");
            }
        }
    }
    let state = if open.len() > sent { "waiting" } else { "running" };
    let mut tx = hub.db.cell_tx(cell).await?;
    sessions::set_state(&mut tx, session.id, state, None).await?;
    tx.commit().await?;
    Ok(())
}

async fn resume(hub: &Hub, cell: Uuid, session: &Session, slot: i32, seat: Uuid, open: &[Request]) -> Result<()> {
    let thread = session.thread_id.as_deref().ok_or(Error::Invalid("no_thread"))?;
    let asked_to_stop = open.iter().any(|r| r.answer.as_ref().is_some_and(|a| a.0["decision"] == "cancel"));
    if asked_to_stop {
        let mut tx = hub.db.cell_tx(cell).await?;
        sessions::finishing(&mut tx, session.id, "cancelled", None, None).await?;
        tx.commit().await?;
        return Ok(());
    }
    // 사람의 답을 들고 잇는 것은 세지 않아요. 저절로 잇는 것만
    if open.is_empty() && session.resumes >= MAX_RESUMES {
        return Err(Error::Invalid("too_many_restarts"));
    }
    let running = hub.running(cell).await?;
    running.server.call("thread/resume", json!({ "threadId": thread, "excludeTurns": true }), STARTING).await.map_err(unavailable)?;

    let environment = environment(hub, &running, &Owner { cell, session: session.id }, slot, seat).await?;
    let mut message = String::from("The app restarted or your previous turn ended before everything was settled. ");
    if open.is_empty() {
        message.push_str("Check the current state of /workspace, do not repeat what is already done, and continue the task.");
    } else {
        message.push_str("While you were waiting, the user decided:\n");
        for request in open {
            let question = request.params.0["questions"]
                .as_array()
                .and_then(|qs| qs.iter().find(|q| q["id"].as_str() == Some(&request.question_id)))
                .cloned()
                .unwrap_or(Value::Null);
            let answer = request.answer.as_ref().map(|a| a.0.clone()).unwrap_or_default();
            message.push_str(&request::recap(Kind::parse(&request.kind), &request.params.0, &question, &answer));
            message.push('\n');
        }
        message.push_str("Continue the task from here without asking the same thing again.");
    }

    let mut tx = hub.db.cell_tx(cell).await?;
    for request in open {
        sqlx::query(
            "UPDATE catchup.agent_requests
             SET state = CASE WHEN kind = 'command' AND answer->>'decision' IN ('accept', 'acceptForSession')
                              THEN 'preapproved' ELSE 'delivered' END,
                 delivered_at = now()
             WHERE id = $1 AND state = 'answered'",
        )
        .bind(request.id)
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query(
        "UPDATE catchup.agent_sessions
         SET boot = $2, sandbox_boot = $4, turn_id = NULL, resumes = resumes + $3, state = 'running', error_code = NULL, updated_at = now()
         WHERE id = $1 AND state NOT IN ('finishing', 'done', 'failed', 'cancelled')",
    )
    .bind(session.id)
    .bind(running.boot)
    .bind(i32::from(open.is_empty()))
    .bind(seat)
    .execute(&mut *tx)
    .await?;
    emit(&mut tx, "session", None).await?;
    tx.commit().await?;
    begin_turn(hub, cell, session.id, &running, thread, &environment, &message).await
}

async fn finish(hub: &Hub, cell: Uuid, session: &Session) -> Result<()> {
    let outcome = session.outcome.as_deref().unwrap_or("failed");
    let socket = session.slot.and_then(|slot| hub.socket(slot));
    let owner = Owner { cell, session: session.id };
    let mut patch = None;
    let mut error = session.error_code.clone();
    let mut held = false;
    if let Some(socket) = socket {
        // 샌드박스가 다시 뜨는 중이면 다음 걸음에
        held = sandbox::ask(socket, &Hello::Status).await.map_err(sandbox_down)?.owner == Some(owner.clone());
        if held && session.thread_id.is_some() {
            match sandbox::take_patch(socket, &owner).await {
                // Postgres 의 글에는 NUL 이 못 들어가요
                Ok(bytes) => patch = Some(String::from_utf8_lossy(&bytes).replace('\0', "")),
                Err(_) => error = error.or(Some("patch_not_saved".to_owned())),
            }
        }
    }
    sessions::finished(&hub.db, cell, session, outcome, patch.as_deref(), error.as_deref()).await?;
    hub.lanes.close(session.id);
    if held && let Some(socket) = socket {
        // 못 비우면 다음에 자리를 찾는 세션이 비워요
        let _ = sandbox::ask(socket, &Hello::Release(owner)).await;
    }
    Ok(())
}
