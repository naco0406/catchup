//! app-server → 샌드박스의 실행 통로. 세션 · 자리 세대마다 하나예요.
//!
//! Codex 는 끊긴 실행 연결을 다시 잇지 않아서(실측), 자리가 다시 켜지면 새 통로를 `environment/add` 로 등록해요.
//! 이 컨테이너의 127.0.0.1 에만 열리고, 통로마다 비밀이 따로 있어요. 샌드박스는 망이 없어서 여기 못 와요.

use std::{
    collections::HashMap,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex, MutexGuard, PoisonError},
};

use axum::{
    Router,
    extract::{
        Path, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use futures_util::{SinkExt, StreamExt};
use subtle::ConstantTimeEq;
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt},
    sync::OnceCell,
};
use uuid::Uuid;

use super::sandbox::{self, Owner};
use crate::{
    crypto::{random, sha256},
    error::{Error, Result},
};

const MAX_MESSAGE: usize = 16 * 1024 * 1024;

#[derive(Clone)]
struct Lane {
    secret: Vec<u8>,
    socket: PathBuf,
    owner: Owner,
    /// 자리의 세대. 다른 세대면 안 이어요
    seat: Uuid,
}

#[derive(Default)]
struct Inner {
    lanes: Mutex<HashMap<Uuid, Lane>>,
    address: OnceCell<SocketAddr>,
}

impl Inner {
    fn lanes(&self) -> MutexGuard<'_, HashMap<Uuid, Lane>> {
        self.lanes.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[derive(Clone, Default)]
pub struct Lanes {
    inner: Arc<Inner>,
}

/// `environment/add` 에 넘길 값
pub struct Opened {
    pub url: String,
    pub bearer: String,
}

impl Lanes {
    async fn address(&self) -> Result<SocketAddr> {
        let inner = self.inner.clone();
        let address = self
            .inner
            .address
            .get_or_try_init(|| async move {
                let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await?;
                let address = listener.local_addr()?;
                let router = Router::new().route("/lane/{id}", get(enter)).with_state(inner);
                tokio::spawn(async move {
                    if let Err(error) = axum::serve(listener, router).await {
                        tracing::error!(%error, "sandbox lanes stopped");
                    }
                });
                std::io::Result::Ok(address)
            })
            .await
            .map_err(|e| Error::Internal(e.into()))?;
        Ok(*address)
    }

    pub async fn open(&self, socket: PathBuf, owner: Owner, seat: Uuid) -> Result<Opened> {
        let address = self.address().await?;
        let (id, bearer) = (Uuid::new_v4(), URL_SAFE_NO_PAD.encode(random::<32>()?));
        self.inner.lanes().insert(id, Lane { secret: sha256(bearer.as_bytes()), socket, owner, seat });
        Ok(Opened { url: format!("ws://{address}/lane/{id}"), bearer })
    }

    pub fn close(&self, session: Uuid) {
        self.inner.lanes().retain(|_, lane| lane.owner.session != session);
    }
}

async fn enter(State(inner): State<Arc<Inner>>, Path(id): Path<Uuid>, headers: HeaderMap, upgrade: WebSocketUpgrade) -> Response {
    let found = inner.lanes().get(&id).cloned();
    let given = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("Bearer "));
    let (Some(lane), Some(given)) = (found, given) else { return StatusCode::NOT_FOUND.into_response() };
    if !bool::from(sha256(given.as_bytes()).as_slice().ct_eq(lane.secret.as_slice())) {
        return StatusCode::NOT_FOUND.into_response();
    }
    upgrade.max_message_size(MAX_MESSAGE).max_frame_size(MAX_MESSAGE).on_upgrade(move |web| async move {
        if let Err(error) = carry(&lane, web).await {
            tracing::warn!(%error, session = %lane.owner.session, "sandbox lane closed");
        }
    })
}

/// WebSocket 글 한 장 = exec-server stdio 한 줄
async fn carry(lane: &Lane, web: WebSocket) -> anyhow::Result<()> {
    let stream = sandbox::attach(&lane.socket, &lane.owner, lane.seat).await?;
    let (from_box, mut to_box) = tokio::io::split(stream);
    let mut from_box = tokio::io::BufReader::new(from_box);
    let (mut to_codex, mut from_codex) = web.split();
    let inbound = async {
        while let Some(message) = from_codex.next().await {
            let text = match message? {
                Message::Text(text) => text.to_string(),
                Message::Binary(bytes) => String::from_utf8(bytes.to_vec())?,
                Message::Close(_) => break,
                _ => continue,
            };
            // 한 장에 줄이 여럿이면 다른 요청을 끼워 넣을 수 있어요
            anyhow::ensure!(!text.trim_end_matches('\n').contains('\n'), "message with a line break");
            to_box.write_all(text.trim_end_matches('\n').as_bytes()).await?;
            to_box.write_all(b"\n").await?;
            to_box.flush().await?;
        }
        anyhow::Ok(())
    };
    let outbound = async {
        let mut line = Vec::new();
        loop {
            line.clear();
            let read = (&mut from_box).take(MAX_MESSAGE as u64).read_until(b'\n', &mut line).await?;
            if read == 0 {
                break;
            }
            anyhow::ensure!(line.last() == Some(&b'\n'), "unfinished or oversized line");
            line.pop();
            to_codex.send(Message::Text(String::from_utf8(line.clone())?.into())).await?;
        }
        anyhow::Ok(())
    };
    tokio::select! { done = inbound => done, done = outbound => done }
}
