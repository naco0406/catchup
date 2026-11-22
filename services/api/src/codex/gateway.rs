//! LLM 창구 — OpenAI Responses 모양(`/v1/models` · `/v1/responses`). 컨테이너 안쪽 망에서만, 비밀로 막아요.
//! 실행 환경을 비운 차례(`environments: []`)라 셸 · 파일 도구가 없고, 그래도 도구를 시작하면 그 차례를 멈춰요.

use std::{sync::Arc, time::Instant};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
use subtle::ConstantTimeEq;
use tokio::sync::{broadcast::error::RecvError, mpsc};
use uuid::Uuid;

use super::{
    account::{self, Trouble},
    hub::{CALL, Hub, Running, unavailable},
    rpc::Incoming,
};
use crate::error::{Error, Result};

pub const AT_ONCE: usize = 2;
const STALL: std::time::Duration = std::time::Duration::from_secs(120);
const TURN: std::time::Duration = std::time::Duration::from_secs(300);
const MAX_INPUT: usize = 400_000;
/// 이것 말고 다른 일을 시작하면 멈춰요(새 도구가 생겨도 막히게 '허용 목록'으로)
const TEXT_ONLY: [&str; 3] = ["userMessage", "agentMessage", "reasoning"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Verdict {
    Continue,
    Text(String),
    Tool,
    Done,
    Failed(&'static str),
}

/// 이 차례의 사건 하나를 읽어요
pub fn judge(incoming: &Incoming, thread: &str) -> Verdict {
    let (method, params, request) = match incoming {
        Incoming::Notification { method, params } => (method.as_str(), params, false),
        Incoming::Request { method, params, .. } => (method.as_str(), params, true),
    };
    if params["threadId"].as_str() != Some(thread) {
        return Verdict::Continue;
    }
    if request {
        return Verdict::Tool;
    }
    let item = &params["item"];
    match method {
        // 없는 도구를 부르면 item 사건 없이 '지원 안 함'만 모델에게 돌아가요. 그래서 원시 사건도 봐요
        "rawResponseItem/completed" if item["type"].as_str().is_some_and(|t| t.ends_with("_call")) => Verdict::Tool,
        "item/started" | "item/completed" if !item["type"].as_str().is_some_and(|t| TEXT_ONLY.contains(&t)) => Verdict::Tool,
        "item/completed" if item["type"] == "agentMessage" => Verdict::Text(item["text"].as_str().unwrap_or_default().to_owned()),
        "turn/completed" => match params["turn"]["status"].as_str() {
            Some("completed") => Verdict::Done,
            _ => Verdict::Failed(why(&params["turn"]["error"])),
        },
        _ => Verdict::Continue,
    }
}

/// codexErrorInfo 는 글자이거나 `{ 종류: { httpStatusCode } }`
pub(super) fn why(error: &Value) -> &'static str {
    let info = &error["codexErrorInfo"];
    let http = info.as_object().and_then(|kinds| kinds.values().find_map(|v| v["httpStatusCode"].as_i64()));
    match (info.as_str(), http) {
        (Some("usageLimitExceeded" | "rateLimitExceeded"), _) => "limit_reached",
        (Some("unauthorized"), _) | (_, Some(401)) => "signed_out",
        // 다시 시도를 끈 공급자는 401 을 글로만 줘요
        (Some("other"), _) if error["message"].as_str().is_some_and(|m| m.starts_with("unexpected status 401 ")) => "signed_out",
        _ => "turn_failed",
    }
}

#[derive(Deserialize)]
pub struct Request {
    pub model: Option<String>,
    pub instructions: Option<String>,
    pub input: Value,
    #[serde(default)]
    pub text: Value,
    #[serde(default)]
    pub tools: Vec<Value>,
    #[serde(default)]
    pub stream: bool,
}

/// 글만 받아요
pub fn prompt(input: &Value) -> Option<String> {
    let text = match input {
        Value::String(text) => text.clone(),
        Value::Array(messages) => {
            let mut parts = Vec::new();
            for message in messages {
                let role = message["role"].as_str()?;
                let content = match &message["content"] {
                    Value::String(text) => text.clone(),
                    Value::Array(items) => items.iter().map(|i| i["text"].as_str()).collect::<Option<Vec<_>>>()?.join("\n"),
                    _ => return None,
                };
                parts.push(if messages.len() == 1 { content } else { format!("[{role}]\n{content}") });
            }
            parts.join("\n\n")
        }
        _ => return None,
    };
    (!text.trim().is_empty() && text.len() <= MAX_INPUT).then_some(text)
}

/// `deltas` 를 주면 글자를 흘려요
pub async fn respond(hub: &Hub, cell: Uuid, request: &Request, deltas: Option<&mpsc::Sender<String>>) -> Result<Value> {
    if !request.tools.is_empty() {
        return Err(Error::Invalid("unsupported"));
    }
    let text = prompt(&request.input).ok_or(Error::Invalid("bad_input"))?;
    if account::load_status(&hub.db, cell).await? != "in" {
        return Err(Error::Conflict("signed_out"));
    }
    let running = hub.running(cell).await?;
    let _slot = running.slots.acquire().await.map_err(unavailable)?;
    let result = turn(&running, request, &text, deltas).await;
    hub.persist(cell, &running).await?;
    running.touch();
    match &result {
        Err(Error::Conflict("signed_out")) => hub.expired(cell).await?,
        Err(Error::Conflict("limit_reached")) => {
            let limits = running.server.call("account/rateLimits/read", Value::Null, CALL).await.unwrap_or_default();
            account::set_limits(&hub.db, cell, &limits["rateLimits"]).await?;
            let resets_at = ["primary", "secondary"]
                .iter()
                .filter(|w| limits["rateLimits"][**w]["usedPercent"].as_i64().unwrap_or(0) >= 100)
                .filter_map(|w| limits["rateLimits"][*w]["resetsAt"].as_i64())
                .max();
            account::raise(&hub.db, cell, Trouble::Limit { resets_at }).await?;
        }
        _ => {}
    }
    result
}

async fn turn(running: &Running, request: &Request, text: &str, deltas: Option<&mpsc::Sender<String>>) -> Result<Value> {
    let began = Instant::now();
    let mut events = running.events.subscribe();
    let mut start = json!({
        "ephemeral": true,
        "experimentalRawEvents": true,
        "environments": [],
        "approvalPolicy": "never",
        "sandbox": "read-only",
        "cwd": running.home.path(),
        "baseInstructions": request.instructions.as_deref().unwrap_or("Answer using only the text you are given."),
    });
    if let Some(model) = &request.model {
        start["model"] = json!(model);
    }
    let started = running.server.call("thread/start", start, CALL).await.map_err(unavailable)?;
    let thread = started["thread"]["id"].as_str().ok_or(Error::Conflict("codex_unavailable"))?.to_owned();
    let mut turn = json!({ "threadId": thread, "environments": [], "input": [{ "type": "text", "text": text, "text_elements": [] }] });
    if request.text["format"]["type"] == "json_schema" {
        turn["outputSchema"] = request.text["format"]["schema"].clone();
    }
    let started_turn = running.server.call("turn/start", turn, CALL).await.map_err(unavailable)?;
    let turn_id = started_turn["turn"]["id"].clone();

    let mut answer = String::new();
    let mut streamed = false;
    let mut first: Option<u128> = None;
    let deadline = tokio::time::Instant::now() + TURN;
    let ended = loop {
        let until = deadline.min(tokio::time::Instant::now() + STALL);
        let incoming: Arc<Incoming> = match tokio::time::timeout_at(until, events.recv()).await {
            Ok(Ok(incoming)) => incoming,
            // 놓친 사건에 도구가 있었을지도 몰라요
            Ok(Err(RecvError::Lagged(_))) => break Err("events_lost"),
            Ok(Err(RecvError::Closed)) => break Err("codex_unavailable"),
            Err(_) => break Err("stalled"),
        };
        if let Incoming::Notification { method, params } = incoming.as_ref()
            && method == "item/agentMessage/delta"
            && params["threadId"].as_str() == Some(&thread)
        {
            first.get_or_insert_with(|| began.elapsed().as_millis());
            if let (Some(deltas), Some(part)) = (deltas, params["delta"].as_str()) {
                // 받는 쪽이 끊었으면 모델도 멈춰요
                if deltas.send(part.to_owned()).await.is_err() {
                    break Err("client_gone");
                }
                streamed = true;
            }
        }
        match judge(&incoming, &thread) {
            Verdict::Continue => {}
            Verdict::Text(text) => {
                first.get_or_insert_with(|| began.elapsed().as_millis());
                // 조각 없이 한 번에 온 글도 흘려요
                if let Some(deltas) = deltas
                    && !streamed
                {
                    let _ = deltas.send(text.clone()).await;
                }
                answer = text;
            }
            Verdict::Tool => break Err("tool_use_blocked"),
            Verdict::Done => break Ok(()),
            Verdict::Failed(code) => break Err(code),
        }
        if running.server.is_closed() {
            break Err("codex_unavailable");
        }
    };
    if let Err(code) = ended {
        let _ = running.server.call("turn/interrupt", json!({ "threadId": thread, "turnId": turn_id }), CALL).await;
        return Err(Error::Conflict(code));
    }
    Ok(json!({
        "id": format!("resp_{}", thread.replace('-', "")),
        "object": "response",
        "status": "completed",
        "model": started["model"],
        "output": [{ "type": "message", "role": "assistant", "content": [{ "type": "output_text", "text": answer }] }],
        "metadata": {
            "first_text_ms": first.map(|ms| ms.to_string()),
            "total_ms": began.elapsed().as_millis().to_string(),
        },
    }))
}

#[derive(Clone)]
struct Inner {
    hub: Hub,
    secret: Arc<str>,
}

impl Inner {
    fn cell(&self, headers: &HeaderMap) -> Result<Uuid> {
        let header = |name: &str| headers.get(name).and_then(|v| v.to_str().ok());
        let given = header("authorization").and_then(|v| v.strip_prefix("Bearer ")).ok_or(Error::Unauthorized)?;
        if !bool::from(given.as_bytes().ct_eq(self.secret.as_bytes())) {
            return Err(Error::Unauthorized);
        }
        header("x-catchup-cell").and_then(|v| v.parse().ok()).ok_or(Error::Invalid("bad_cell"))
    }
}

async fn responses(State(inner): State<Inner>, headers: HeaderMap, Json(request): Json<Request>) -> Result<Response> {
    let cell = inner.cell(&headers)?;
    if !request.stream {
        return Ok(Json(respond(&inner.hub, cell, &request, None).await?).into_response());
    }
    let (events, receive) = mpsc::channel::<Value>(64);
    tokio::spawn(async move {
        let (deltas, mut parts) = mpsc::channel::<String>(64);
        let to_client = events.clone();
        let forward = tokio::spawn(async move {
            while let Some(delta) = parts.recv().await {
                let event = json!({ "type": "response.output_text.delta", "delta": delta });
                if to_client.send(event).await.is_err() {
                    break;
                }
            }
        });
        let result = respond(&inner.hub, cell, &request, Some(&deltas)).await;
        drop(deltas);
        let _ = forward.await;
        let last = match result {
            Ok(response) => json!({ "type": "response.completed", "response": response }),
            Err(error) => {
                let code = error.code();
                json!({ "type": "response.failed", "response": { "status": "failed", "error": { "code": code } } })
            }
        };
        let _ = events.send(last).await;
    });
    let stream = futures_util::stream::unfold(receive, |mut receive| async {
        let event = receive.recv().await?;
        let name = event["type"].as_str().unwrap_or("message").to_owned();
        let frame = axum::response::sse::Event::default().event(name).data(event.to_string());
        Some((std::result::Result::<_, std::convert::Infallible>::Ok(frame), receive))
    });
    Ok(axum::response::sse::Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::default()).into_response())
}

async fn models(State(inner): State<Inner>, headers: HeaderMap) -> Result<Response> {
    let cell = inner.cell(&headers)?;
    let listed = inner.hub.running(cell).await?.server.call("model/list", json!({}), CALL).await.map_err(unavailable)?;
    let models: Vec<Value> = listed["data"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|m| json!({ "id": m["model"], "object": "model", "owned_by": "openai" }))
        .collect();
    Ok(Json(json!({ "object": "list", "data": models })).into_response())
}

pub fn router(hub: Hub, secret: String) -> Router {
    Router::new()
        .route("/health/live", get(|| async { StatusCode::NO_CONTENT }))
        .route("/v1/models", get(models))
        .route("/v1/responses", post(responses))
        .layer(tower_http::limit::RequestBodyLimitLayer::new(512 * 1024))
        .with_state(Inner { hub, secret: secret.into() })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(method: &str, params: Value) -> Incoming {
        Incoming::Notification { method: method.into(), params }
    }

    #[test]
    fn anything_but_text_stops_the_turn() {
        for kind in ["commandExecution", "fileChange", "mcpToolCall", "webSearch", "dynamicToolCall", "somethingNew"] {
            let event = note("item/started", json!({ "threadId": "t", "item": { "type": kind } }));
            assert_eq!(judge(&event, "t"), Verdict::Tool, "{kind}");
        }
        let ask = Incoming::Request { id: json!(1), method: "item/tool/requestUserInput".into(), params: json!({ "threadId": "t" }) };
        assert_eq!(judge(&ask, "t"), Verdict::Tool);
    }

    #[test]
    fn even_a_call_to_a_missing_tool_stops_the_turn() {
        for kind in ["function_call", "custom_tool_call", "local_shell_call", "web_search_call"] {
            let event = note("rawResponseItem/completed", json!({ "threadId": "t", "item": { "type": kind } }));
            assert_eq!(judge(&event, "t"), Verdict::Tool, "{kind}");
        }
        let reasoning = note("rawResponseItem/completed", json!({ "threadId": "t", "item": { "type": "reasoning" } }));
        assert_eq!(judge(&reasoning, "t"), Verdict::Continue);
    }

    #[test]
    fn another_thread_does_not_touch_this_one() {
        let event = note("item/started", json!({ "threadId": "other", "item": { "type": "commandExecution" } }));
        assert_eq!(judge(&event, "t"), Verdict::Continue);
    }

    #[test]
    fn failures_are_told_apart() {
        for (info, code) in [("usageLimitExceeded", "limit_reached"), ("unauthorized", "signed_out"), ("other", "turn_failed")] {
            let event = note(
                "turn/completed",
                json!({ "threadId": "t", "turn": { "status": "failed", "error": { "codexErrorInfo": info } } }),
            );
            assert_eq!(judge(&event, "t"), Verdict::Failed(code));
        }
    }

    #[test]
    fn a_401_means_signed_out_however_it_is_reported() {
        let nested = json!({ "codexErrorInfo": { "responseStreamConnectionFailed": { "httpStatusCode": 401 } } });
        let plain = json!({ "codexErrorInfo": "other", "message": "unexpected status 401 Unauthorized: x" });
        assert_eq!((why(&nested), why(&plain)), ("signed_out", "signed_out"));
        assert_eq!(why(&json!({ "codexErrorInfo": "other", "message": "the file mentions 401" })), "turn_failed");
    }

    #[test]
    fn only_text_input_is_accepted() {
        assert_eq!(prompt(&json!("hello")).as_deref(), Some("hello"));
        assert_eq!(prompt(&json!([{ "role": "user", "content": [{ "type": "input_image", "image_url": "x" }] }])), None);
        assert_eq!(prompt(&json!("  ")), None);
    }
}
