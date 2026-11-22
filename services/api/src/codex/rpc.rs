//! app-server 한 프로세스(stdio 줄 단위 JSON-RPC). 실패는 이 프로세스 안에서 끝나요.

use std::{
    collections::HashMap,
    path::Path,
    process::Stdio,
    sync::{Arc, Mutex, MutexGuard, PoisonError},
    time::Duration,
};

use serde_json::{Value, json};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, Command},
    sync::{mpsc, oneshot, watch},
};

/// 한 줄이 이보다 길면 프로세스를 끊어요(메모리 상한)
const MAX_LINE: usize = 8 * 1024 * 1024;
const INBOX: usize = 1024;
const OUTBOX: usize = 256;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RpcError {
    Spawn,
    /// 프로세스가 끝났거나 더 받지 못해요
    Closed,
    Timeout,
    /// 토큰이 섞일 수 있어서 상대의 문구는 들지 않고 번호만
    Remote(i64),
}

impl std::fmt::Display for RpcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Spawn => f.write_str("cannot start app-server"),
            Self::Closed => f.write_str("app-server closed"),
            Self::Timeout => f.write_str("app-server timed out"),
            Self::Remote(code) => write!(f, "app-server refused ({code})"),
        }
    }
}

impl std::error::Error for RpcError {}

#[derive(Debug, Clone, PartialEq)]
pub enum Incoming {
    Notification {
        method: String,
        params: Value,
    },
    /// 우리가 답해야 하는 요청(승인 · 질문)
    Request {
        id: Value,
        method: String,
        params: Value,
    },
}

type Waiting = Mutex<HashMap<i64, oneshot::Sender<Result<Value, RpcError>>>>;

fn locked(waiting: &Waiting) -> MutexGuard<'_, HashMap<i64, oneshot::Sender<Result<Value, RpcError>>>> {
    waiting.lock().unwrap_or_else(PoisonError::into_inner)
}

struct Shared {
    waiting: Arc<Waiting>,
    outbox: mpsc::Sender<Vec<u8>>,
    next: std::sync::atomic::AtomicI64,
    closed: watch::Receiver<bool>,
    stop: watch::Sender<bool>,
}

impl Drop for Shared {
    fn drop(&mut self) {
        let _ = self.stop.send(true);
    }
}

#[derive(Clone)]
pub struct AppServer {
    shared: Arc<Shared>,
}

impl AppServer {
    /// 환경은 넘기지 않아요(DB 비밀번호 · 바깥 열쇠가 자식에게 새지 않게). stderr 는 토큰이 실릴 수 있어 버려요
    pub fn spawn(binary: &Path, args: &[&str], home: &Path) -> Result<(Self, mpsc::Receiver<Incoming>), RpcError> {
        let mut child = Command::new(binary)
            .args(args)
            .current_dir(home)
            .env_clear()
            .env("PATH", "/usr/local/bin:/usr/bin:/bin")
            .env("HOME", home)
            .env("CODEX_HOME", home)
            .env("TMPDIR", home)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|_| RpcError::Spawn)?;
        let mut stdin = child.stdin.take().ok_or(RpcError::Spawn)?;
        let stdout = child.stdout.take().ok_or(RpcError::Spawn)?;

        let waiting: Arc<Waiting> = Arc::default();
        let (outbox, mut to_child) = mpsc::channel::<Vec<u8>>(OUTBOX);
        let (inbox, from_child) = mpsc::channel(INBOX);
        let (stop, stopping) = watch::channel(false);
        let (closing, closed) = watch::channel(false);

        tokio::spawn(async move {
            while let Some(line) = to_child.recv().await {
                if stdin.write_all(&line).await.is_err() || stdin.flush().await.is_err() {
                    break;
                }
            }
        });
        let (reader_waiting, ending) = (waiting.clone(), waiting.clone());
        tokio::spawn(async move {
            let reading = read(BufReader::new(stdout), &reader_waiting, &inbox);
            supervise(&mut child, reading, stopping).await;
            let _ = closing.send(true);
            for (_, reply) in locked(&ending).drain() {
                let _ = reply.send(Err(RpcError::Closed));
            }
        });

        let shared = Shared { waiting, outbox, next: 1.into(), closed, stop };
        Ok((Self { shared: Arc::new(shared) }, from_child))
    }

    async fn write(&self, message: &Value) -> Result<(), RpcError> {
        if self.is_closed() {
            return Err(RpcError::Closed);
        }
        let mut line = message.to_string().into_bytes();
        line.push(b'\n');
        self.shared.outbox.send(line).await.map_err(|_| RpcError::Closed)
    }

    pub async fn call(&self, method: &str, params: Value, limit: Duration) -> Result<Value, RpcError> {
        let id = self.shared.next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let (reply, got) = oneshot::channel();
        locked(&self.shared.waiting).insert(id, reply);
        let mut closed = self.shared.closed.clone();
        let result = async {
            self.write(&json!({ "id": id, "method": method, "params": params })).await?;
            tokio::select! {
                got = got => got.unwrap_or(Err(RpcError::Closed)),
                _ = closed.wait_for(|c| *c) => Err(RpcError::Closed),
                () = tokio::time::sleep(limit) => Err(RpcError::Timeout),
            }
        }
        .await;
        locked(&self.shared.waiting).remove(&id);
        result
    }

    pub async fn notify(&self, method: &str) -> Result<(), RpcError> {
        self.write(&json!({ "method": method })).await
    }

    pub async fn respond(&self, id: &Value, result: Value) -> Result<(), RpcError> {
        self.write(&json!({ "id": id, "result": result })).await
    }

    /// 모르는 요청은 거절로 답해요 — Codex 가 영영 기다리지 않게
    pub async fn refuse(&self, id: &Value) -> Result<(), RpcError> {
        self.write(&json!({ "id": id, "error": { "code": -32601, "message": "not supported" } })).await
    }

    pub async fn initialize(&self) -> Result<(), RpcError> {
        let hello = json!({
            // 이 이름은 User-Agent 로 OpenAI 에 나가요 — 프로젝트 이름을 싣지 않아요
            "clientInfo": { "name": "local_client", "title": "Local client", "version": env!("CARGO_PKG_VERSION") },
            "capabilities": { "experimentalApi": true },
        });
        let info = self.call("initialize", hello, Duration::from_secs(20)).await?;
        // 판이 다르면 쓰지 않아요
        if !info["userAgent"].as_str().is_some_and(|ua| ua.contains(&format!("/{} ", super::VERSION))) {
            self.stop();
            return Err(RpcError::Spawn);
        }
        self.notify("initialized").await
    }

    pub fn is_closed(&self) -> bool {
        *self.shared.closed.borrow()
    }

    pub fn stop(&self) {
        let _ = self.shared.stop.send(true);
    }
}

async fn supervise(child: &mut Child, reading: impl Future<Output = ()>, mut stopping: watch::Receiver<bool>) {
    tokio::pin!(reading);
    tokio::select! {
        () = &mut reading => {}
        _ = stopping.changed() => {}
    }
    let _ = child.kill().await;
}

async fn read(mut stdout: impl AsyncBufReadExt + Unpin, waiting: &Waiting, inbox: &mpsc::Sender<Incoming>) {
    let mut line = Vec::new();
    loop {
        let Ok(chunk) = stdout.fill_buf().await else { return };
        if chunk.is_empty() {
            return;
        }
        let end = chunk.iter().position(|b| *b == b'\n');
        let take = end.map_or(chunk.len(), |i| i + 1);
        if line.len() + take > MAX_LINE {
            return;
        }
        line.extend_from_slice(&chunk[..take]);
        stdout.consume(take);
        if end.is_none() {
            continue;
        }
        if let Some(incoming) = route(&line, waiting) {
            // 받는 쪽이 밀리면 기다려요(메모리에 쌓지 않아요). 받는 쪽이 없으면 버려요
            let _ = inbox.send(incoming).await;
        }
        line.clear();
    }
}

fn route(line: &[u8], waiting: &Waiting) -> Option<Incoming> {
    let mut message: Value = serde_json::from_slice(line).ok()?;
    let id = message.get("id").cloned();
    if let Some(method) = message.get("method").and_then(Value::as_str).map(str::to_owned) {
        let params = message.get_mut("params").map(Value::take).unwrap_or(Value::Null);
        return Some(match id {
            Some(id) => Incoming::Request { id, method, params },
            None => Incoming::Notification { method, params },
        });
    }
    let reply = locked(waiting).remove(&id?.as_i64()?)?;
    let result = match message.get("error") {
        Some(error) => Err(RpcError::Remote(error["code"].as_i64().unwrap_or(0))),
        None => Ok(message.get_mut("result").map(Value::take).unwrap_or(Value::Null)),
    };
    let _ = reply.send(result);
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHORT: Duration = Duration::from_millis(400);

    fn fake(script: &str) -> (AppServer, mpsc::Receiver<Incoming>) {
        AppServer::spawn(Path::new("/bin/sh"), &["-c", script], &std::env::temp_dir()).unwrap()
    }

    #[tokio::test]
    async fn replies_notifications_and_requests_are_told_apart() {
        let (server, mut inbox) = fake(
            r#"read x; echo 'not json'; echo '{"method":"turn/started","params":{"a":1}}'; echo '{"id":"r1","method":"ask","params":{}}'; echo '{"id":1,"result":{"ok":true}}'; sleep 2"#,
        );
        assert_eq!(server.call("hello", json!({}), Duration::from_secs(3)).await.unwrap(), json!({ "ok": true }));
        assert_eq!(inbox.recv().await.unwrap(), Incoming::Notification { method: "turn/started".into(), params: json!({ "a": 1 }) });
        assert_eq!(inbox.recv().await.unwrap(), Incoming::Request { id: json!("r1"), method: "ask".into(), params: json!({}) });
    }

    #[tokio::test]
    async fn a_dead_process_fails_what_was_waiting() {
        let (server, _inbox) = fake("read x; exit 1");
        assert_eq!(server.call("hello", json!({}), Duration::from_secs(5)).await, Err(RpcError::Closed));
    }

    #[tokio::test]
    async fn silence_times_out() {
        let (server, _inbox) = fake("sleep 5");
        assert_eq!(server.call("hello", json!({}), SHORT).await, Err(RpcError::Timeout));
    }

    #[tokio::test]
    async fn the_text_of_a_remote_error_is_not_kept() {
        let (server, _inbox) = fake(r#"read x; echo '{"id":1,"error":{"code":-7,"message":"Bearer SECRET"}}'; sleep 2"#);
        let error = server.call("hello", json!({}), Duration::from_secs(3)).await.unwrap_err();
        assert_eq!(error, RpcError::Remote(-7));
        assert!(!format!("{error:?} {error}").contains("SECRET"));
    }

    #[tokio::test]
    async fn a_child_gets_none_of_our_environment() {
        // 시험 프로세스에는 CARGO_* 가 있어요. 자식에게는 없어야 해요
        let (server, _inbox) = fake(r#"read x; printf '{"id":1,"result":"%s"}\n' "${CARGO_MANIFEST_DIR:-empty}"; sleep 2"#);
        assert_eq!(server.call("hello", json!({}), Duration::from_secs(3)).await.unwrap(), json!("empty"));
    }

    #[tokio::test]
    async fn an_endless_line_closes_the_process() {
        let (server, _inbox) = fake("read x; head -c 9000000 /dev/zero; sleep 5");
        assert_eq!(server.call("hello", json!({}), Duration::from_secs(10)).await, Err(RpcError::Closed));
    }

    #[tokio::test]
    async fn another_version_is_refused() {
        let (server, _inbox) = fake(r#"read x; echo '{"id":1,"result":{"userAgent":"catchup/0.164.0 (Linux)"}}'; sleep 2"#);
        assert_eq!(server.initialize().await, Err(RpcError::Spawn));
    }
}
