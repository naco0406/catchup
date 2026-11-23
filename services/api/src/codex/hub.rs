//! 에이전트 일꾼 — 칸마다 app-server 하나를 쥐어요(auth.json 하나에 실행 흐름 하나).
//! 한 칸의 app-server 가 죽어도 다른 칸은 그대로예요.

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex as StdMutex, PoisonError},
    time::{Duration, Instant},
};

use serde_json::{Value, json};
use tokio::sync::{Mutex, Semaphore, broadcast, mpsc, watch};
use uuid::Uuid;

use super::{
    account::{self, Trouble, Want},
    backoff::Backoff,
    codehost, drafts,
    home::Home,
    lanes::Lanes,
    rpc::{AppServer, Incoming},
    runner, sort, talk,
};
use crate::{
    crypto::Key,
    db::Db,
    error::{Error, Result},
};

pub const CALL: Duration = Duration::from_secs(20);
const IDLE: Duration = Duration::from_secs(10 * 60);
const SAVE_EVERY: Duration = Duration::from_secs(20);
const LOGIN_LIMIT: Duration = Duration::from_secs(16 * 60);

#[derive(Clone)]
pub struct Paths {
    pub binary: PathBuf,
    pub volatile: PathBuf,
    pub durable: PathBuf,

    /// (자리 번호, 소켓)
    pub sandboxes: Vec<(i32, PathBuf)>,
    /// 모델의 JS 를 돌리는 컨테이너의 소켓(`codehost.rs`)
    pub code_host: Option<PathBuf>,
}

struct Login {
    id: String,
    since: Instant,
}

pub struct Running {
    /// 이 app-server 한 번. 바뀌면 묻던 요청은 사라진 거예요
    pub boot: Uuid,
    /// 이 app-server 에 등록한 실행 환경
    pub registered: Mutex<std::collections::HashSet<String>>,
    pub server: AppServer,
    pub home: Home,
    pub events: broadcast::Sender<Arc<Incoming>>,
    pub slots: Semaphore,
    read: Mutex<Option<Vec<u8>>>,
    login: StdMutex<Option<Login>>,
    used: StdMutex<Instant>,
}

impl Running {
    pub fn touch(&self) {
        *self.used.lock().unwrap_or_else(PoisonError::into_inner) = Instant::now();
    }

    fn login(&self) -> std::sync::MutexGuard<'_, Option<Login>> {
        self.login.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn idle(&self) -> bool {
        self.login().is_none()
            && self.slots.available_permits() == super::gateway::AT_ONCE
            && self.used.lock().unwrap_or_else(PoisonError::into_inner).elapsed() > IDLE
    }
}

type Slot = Arc<Mutex<Option<Arc<Running>>>>;

#[derive(Clone)]
pub struct Hub {
    pub db: Db,
    master: Arc<Key>,
    pub paths: Paths,
    pub lanes: Lanes,
    pub retries: Arc<Backoff>,
    code_host: Arc<tokio::sync::OnceCell<String>>,
    slots: Arc<Mutex<HashMap<Uuid, Slot>>>,
}

pub fn unavailable<E>(_: E) -> Error {
    Error::Conflict("codex_unavailable")
}

impl Hub {
    pub fn new(db: Db, master: Arc<Key>, paths: Paths) -> Self {
        Self { db, master, paths, lanes: Lanes::default(), retries: Arc::default(), code_host: Arc::default(), slots: Arc::default() }
    }

    async fn slot(&self, cell: Uuid) -> Slot {
        self.slots.lock().await.entry(cell).or_default().clone()
    }

    pub async fn current(&self, cell: Uuid) -> Option<Arc<Running>> {
        self.slot(cell).await.lock().await.clone().filter(|r| !r.server.is_closed())
    }

    pub fn socket(&self, slot: i32) -> Option<&std::path::Path> {
        self.paths.sandboxes.iter().find(|(number, _)| *number == slot).map(|(_, socket)| socket.as_path())
    }

    /// 떠 있으면 그것을, 아니면 DB 의 로그인을 풀어서 띄워요
    pub async fn running(&self, cell: Uuid) -> Result<Arc<Running>> {
        let slot = self.slot(cell).await;
        let mut slot = slot.lock().await;
        if let Some(running) = slot.as_ref().filter(|r| !r.server.is_closed()) {
            running.touch();
            return Ok(running.clone());
        }
        let saved = account::load_auth(&self.db, &self.master, cell).await?;

        let home = Home::prepare(&self.paths.volatile, &self.paths.durable, cell).map_err(|e| Error::Internal(e.into()))?;
        match &saved {
            Some((auth, _)) => home.restore_auth(auth),
            None => home.forget_auth(),
        }
        .map_err(|e| Error::Internal(e.into()))?;
        let (server, inbox) = {
            let mut args = vec!["--listen", "stdio://", "--strict-config"];
            if let Some(socket) = &self.paths.code_host {
                let url = self
                    .code_host
                    .get_or_try_init(|| async { codehost::forward(socket.clone()).await.map(|address| format!("http://{address}")) })
                    .await
                    .map_err(|e| Error::Internal(e.into()))?;
                args.extend(["--code-mode-host", url.as_str()]);
            }
            AppServer::spawn(&self.paths.binary, &args, home.path())
        }
        .map_err(unavailable)?;
        let running = Arc::new(Running {
            boot: Uuid::new_v4(),
            registered: Mutex::default(),
            server,
            home,
            events: broadcast::channel(1024).0,
            slots: Semaphore::new(super::gateway::AT_ONCE),
            read: Mutex::new(saved.map(|(_, fingerprint)| fingerprint)),
            login: StdMutex::new(None),
            used: StdMutex::new(Instant::now()),
        });
        tokio::spawn(self.clone().pump(cell, running.clone(), inbox));
        running.server.initialize().await.map_err(unavailable)?;
        *slot = Some(running.clone());
        Ok(running)
    }

    /// 갱신된 로그인만 되써요
    pub async fn persist(&self, cell: Uuid, running: &Running) -> Result<()> {
        let Some((auth, fingerprint)) = running.home.auth().map_err(|e| Error::Internal(e.into()))? else { return Ok(()) };
        let mut read = running.read.lock().await;
        if read.as_deref() == Some(fingerprint.as_slice()) {
            return Ok(());
        }
        if account::save_auth(&self.db, &self.master, cell, &auth, &fingerprint, read.as_deref()).await? {
            *read = Some(fingerprint);
        } else {
            tracing::warn!(%cell, "login changed elsewhere; reloading");
            running.server.stop();
        }
        Ok(())
    }

    async fn pump(self, cell: Uuid, running: Arc<Running>, mut inbox: mpsc::Receiver<Incoming>) {
        let mut seen = runner::Seen::default();
        while let Some(incoming) = inbox.recv().await {
            // 세션의 것은 카드로, 나머지 요청(LLM 창구)은 거절
            if let Err(error) = runner::incoming(&self, cell, &running, &mut seen, &incoming).await {
                tracing::error!(%cell, %error, "cannot record agent event");
            }
            match &incoming {
                Incoming::Request { .. } => {}
                Incoming::Notification { method, params } => {
                    // 알림을 처리하다 app-server 의 답을 기다리면 이 줄이 스스로 막혀요
                    if method == "account/login/completed" {
                        let (hub, running, params) = (self.clone(), running.clone(), params.clone());
                        tokio::spawn(async move {
                            if let Err(error) = hub.login_completed(cell, &running, &params).await {
                                tracing::error!(%cell, %error, "cannot finish sign-in");
                                let _ = account::set(&hub.db, cell, "failed", Some("sign_in_not_saved")).await;
                            }
                        });
                    } else if method == "account/rateLimits/updated"
                        && let Err(error) = account::set_limits(&self.db, cell, &params["rateLimits"]).await
                    {
                        tracing::warn!(%cell, %error, "cannot store limits");
                    }
                }
            }
            let _ = running.events.send(Arc::new(incoming));
        }
        if running.login().take().is_some() {
            let _ = account::set(&self.db, cell, "failed", Some("login_interrupted")).await;
        }
        if let Err(error) = self.persist(cell, &running).await {
            tracing::warn!(%cell, %error, "cannot save login on exit");
        }
    }

    async fn login_completed(&self, cell: Uuid, running: &Running, params: &Value) -> Result<()> {
        {
            let mut login = running.login();
            match (&*login, params["loginId"].as_str()) {
                (Some(ours), Some(id)) if ours.id != id => return Ok(()), // 앞선 로그인의 늦은 알림
                (None, _) => return Ok(()),                               // 취소한 로그인
                _ => *login = None,
            }
        }
        if params["success"].as_bool() != Some(true) {
            return account::set(&self.db, cell, "failed", Some("sign_in_failed")).await;
        }
        self.persist(cell, running).await?;
        if running.read.lock().await.is_none() {
            return account::set(&self.db, cell, "failed", Some("sign_in_not_saved")).await;
        }
        let account = running.server.call("account/read", json!({ "refreshToken": false }), CALL).await.map_err(unavailable)?;
        account::signed_in(&self.db, cell, account["account"]["planType"].as_str()).await?;
        if let Ok(limits) = running.server.call("account/rateLimits/read", Value::Null, CALL).await {
            account::set_limits(&self.db, cell, &limits["rateLimits"]).await?;
        }
        Ok(())
    }

    async fn start_login(&self, cell: Uuid) -> Result<()> {
        if account::load_auth(&self.db, &self.master, cell).await?.is_some() {
            // 풀린 로그인은 버리고 시작해요 — 취소했을 때 '연결했어요'로 돌아가지 않게
            account::forget_auth(&self.db, cell).await?;
            if let Some(stale) = self.slot(cell).await.lock().await.take() {
                stale.home.forget_auth().map_err(|e| Error::Internal(e.into()))?;
                stale.server.stop();
            }
        }
        let running = self.running(cell).await?;
        let started = running
            .server
            .call("account/login/start", json!({ "type": "chatgptDeviceCode" }), CALL)
            .await
            .map_err(|_| Error::Conflict("device_code_unavailable"))?;
        let field = |name: &str| started[name].as_str().ok_or(Error::Conflict("device_code_unavailable"));
        let (id, code, url) = (field("loginId")?, field("userCode")?, field("verificationUrl")?);
        // 코드를 넣을 곳은 OpenAI 뿐이에요
        if !url.starts_with("https://auth.openai.com/") {
            running.server.stop();
            return Err(Error::Conflict("unexpected_login_address"));
        }
        *running.login() = Some(Login { id: id.to_owned(), since: Instant::now() });
        account::waiting(&self.db, &self.master, cell, code, url).await
    }

    async fn cancel_login(&self, cell: Uuid) -> Result<()> {
        if let Some(running) = self.current(cell).await {
            let login = running.login().take();
            if let Some(login) = login {
                let _ = running.server.call("account/login/cancel", json!({ "loginId": login.id }), CALL).await;
            }
        }
        let signed_in = account::load_auth(&self.db, &self.master, cell).await?.is_some();
        account::set(&self.db, cell, if signed_in { "in" } else { "none" }, None).await
    }

    async fn logout(&self, cell: Uuid) -> Result<()> {
        let running = self.running(cell).await.ok();
        if let Some(running) = &running {
            let _ = running.server.call("account/logout", json!({}), CALL).await;
            running.home.forget_auth().map_err(|e| Error::Internal(e.into()))?;
        }
        account::forget_auth(&self.db, cell).await?;
        if let Some(running) = &running {
            running.server.stop();
        }
        self.slot(cell).await.lock().await.take();
        account::set(&self.db, cell, "none", None).await
    }

    async fn work(&self, cell: Uuid) -> Result<()> {
        let (want, state) = account::take(&self.db, cell).await?;
        let done = match want {
            Some(Want::Login) => self.start_login(cell).await,
            Some(Want::Cancel) => self.cancel_login(cell).await,
            Some(Want::Logout) => self.logout(cell).await,
            None if state == "waiting" => {
                let since = match self.current(cell).await {
                    Some(running) => running.login().as_ref().map(|l| l.since),
                    None => None,
                };
                match since {
                    Some(since) if since.elapsed() < LOGIN_LIMIT => Ok(()),
                    Some(_) => {
                        self.cancel_login(cell).await?;
                        account::set(&self.db, cell, "failed", Some("code_expired")).await
                    }
                    None => {
                        // 완료 알림을 처리하는 사이일 수도 있어요
                        tokio::time::sleep(Duration::from_secs(2)).await;
                        if account::take(&self.db, cell).await?.1 == "waiting" {
                            account::set(&self.db, cell, "failed", Some("login_interrupted")).await
                        } else {
                            Ok(())
                        }
                    }
                }
            }
            None => Ok(()),
        };
        if let Err(error) = &done {
            account::set(&self.db, cell, "failed", Some(error.code())).await?;
        }
        done
    }

    /// 로그인이 풀렸어요
    pub async fn expired(&self, cell: Uuid) -> Result<()> {
        account::set(&self.db, cell, "expired", Some("unauthorized")).await?;
        account::raise(&self.db, cell, Trouble::Expired).await
    }

    async fn each(&self) -> Vec<(Uuid, Arc<Running>)> {
        let slots: Vec<(Uuid, Slot)> = self.slots.lock().await.iter().map(|(c, s)| (*c, s.clone())).collect();
        let mut out = Vec::new();
        for (cell, slot) in slots {
            // 띄우는 중인 칸을 기다리느라 다른 칸을 막지 않아요
            if let Ok(slot) = slot.try_lock()
                && let Some(running) = slot.clone()
            {
                out.push((cell, running));
            }
        }
        out
    }

    pub async fn run(&self, mut stop: watch::Receiver<bool>) {
        let mut tick = tokio::time::interval(Duration::from_millis(500));
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        let busy: Arc<StdMutex<std::collections::HashSet<Uuid>>> = Arc::default();
        let stepping: Arc<StdMutex<std::collections::HashSet<Uuid>>> = Arc::default();
        let drafting: Arc<StdMutex<std::collections::HashSet<Uuid>>> = Arc::default();
        let talking: Arc<StdMutex<std::collections::HashSet<Uuid>>> = Arc::default();
        let sorting: Arc<StdMutex<std::collections::HashSet<Uuid>>> = Arc::default();
        let mut saved = Instant::now();
        loop {
            tokio::select! { _ = tick.tick() => {}, _ = stop.changed() => break }
            let cells: Vec<Uuid> =
                match sqlx::query_scalar("SELECT cell FROM front.cells_with_agent_work()").fetch_all(self.db.pool()).await {
                    Ok(cells) => cells,
                    Err(error) => {
                        tracing::error!(%error, "cannot look for agent work");
                        continue;
                    }
                };
            for cell in cells {
                if !busy.lock().unwrap_or_else(PoisonError::into_inner).insert(cell) {
                    continue;
                }
                let (hub, busy) = (self.clone(), busy.clone());
                tokio::spawn(async move {
                    if let Err(error) = hub.work(cell).await {
                        tracing::warn!(%cell, %error, "codex work failed");
                    }
                    busy.lock().unwrap_or_else(PoisonError::into_inner).remove(&cell);
                });
            }
            match sqlx::query_scalar::<_, Uuid>("SELECT cell FROM front.cells_with_sessions()").fetch_all(self.db.pool()).await {
                Err(error) => tracing::error!(%error, "cannot look for sessions"),
                Ok(cells) => {
                    for cell in cells {
                        if !stepping.lock().unwrap_or_else(PoisonError::into_inner).insert(cell) {
                            continue;
                        }
                        let (hub, stepping) = (self.clone(), stepping.clone());
                        tokio::spawn(async move {
                            let stepped = std::panic::AssertUnwindSafe(runner::tick(&hub, cell));
                            match futures_util::FutureExt::catch_unwind(stepped).await {
                                Ok(Ok(())) => {}
                                Ok(Err(error)) => tracing::warn!(%cell, %error, "sessions stopped"),
                                Err(_) => tracing::error!(%cell, "session step panicked"),
                            }
                            stepping.lock().unwrap_or_else(PoisonError::into_inner).remove(&cell);
                        });
                    }
                }
            }
            match sqlx::query_scalar::<_, Uuid>("SELECT cell FROM front.cells_with_drafting()").fetch_all(self.db.pool()).await {
                Err(error) => tracing::error!(%error, "cannot look for drafting"),
                Ok(cells) => {
                    for cell in cells {
                        if !drafting.lock().unwrap_or_else(PoisonError::into_inner).insert(cell) {
                            continue;
                        }
                        let (hub, drafting) = (self.clone(), drafting.clone());
                        tokio::spawn(async move {
                            match futures_util::FutureExt::catch_unwind(std::panic::AssertUnwindSafe(drafts::tick(&hub, cell))).await {
                                Ok(Ok(())) => {}
                                Ok(Err(error)) => tracing::warn!(%cell, %error, "drafting stopped"),
                                Err(_) => tracing::error!(%cell, "drafting panicked"),
                            }
                            drafting.lock().unwrap_or_else(PoisonError::into_inner).remove(&cell);
                        });
                    }
                }
            }
            // 비서에게 한 말 · 방금 나간 글의 약속
            match sqlx::query_scalar::<_, Uuid>("SELECT cell FROM front.cells_with_talk()").fetch_all(self.db.pool()).await {
                Err(error) => tracing::error!(%error, "cannot look for talk"),
                Ok(cells) => {
                    for cell in cells {
                        if !talking.lock().unwrap_or_else(PoisonError::into_inner).insert(cell) {
                            continue;
                        }
                        let (hub, talking) = (self.clone(), talking.clone());
                        tokio::spawn(async move {
                            match futures_util::FutureExt::catch_unwind(std::panic::AssertUnwindSafe(talk::tick(&hub, cell))).await {
                                Ok(Ok(())) => {}
                                Ok(Err(error)) => tracing::warn!(%cell, %error, "talk stopped"),
                                Err(_) => tracing::error!(%cell, "talk panicked"),
                            }
                            talking.lock().unwrap_or_else(PoisonError::into_inner).remove(&cell);
                        });
                    }
                }
            }
            // 들어온 글 가르기
            match sqlx::query_scalar::<_, Uuid>("SELECT cell FROM front.cells_with_inbox()").fetch_all(self.db.pool()).await {
                Err(error) => tracing::error!(%error, "cannot look for inbox"),
                Ok(cells) => {
                    for cell in cells {
                        if !sorting.lock().unwrap_or_else(PoisonError::into_inner).insert(cell) {
                            continue;
                        }
                        let (hub, sorting) = (self.clone(), sorting.clone());
                        tokio::spawn(async move {
                            match futures_util::FutureExt::catch_unwind(std::panic::AssertUnwindSafe(sort::tick(&hub, cell))).await {
                                Ok(Ok(())) => {}
                                Ok(Err(error)) => tracing::warn!(%cell, %error, "sorting stopped"),
                                Err(_) => tracing::error!(%cell, "sorting panicked"),
                            }
                            sorting.lock().unwrap_or_else(PoisonError::into_inner).remove(&cell);
                        });
                    }
                }
            }
            if saved.elapsed() >= SAVE_EVERY {
                saved = Instant::now();
                for (cell, running) in self.each().await {
                    if let Err(error) = self.persist(cell, &running).await {
                        tracing::warn!(%cell, %error, "cannot save login");
                    }
                    if running.idle() {
                        running.server.stop();
                    }
                }
            }
        }
        for (cell, running) in self.each().await {
            if let Err(error) = self.persist(cell, &running).await {
                tracing::warn!(%cell, %error, "cannot save login on stop");
            }
            running.server.stop();
        }
    }
}
