//! catchup-api migrate | serve | worker | agent | sandbox | codehost | provision <email> [ko|en] | login-code <email> | seed <email> | openapi | health

use std::{io::Read, sync::Arc, time::Duration};

use anyhow::{Context, bail};
use catchup_api::{
    cards, codex,
    crypto::Key,
    db::{self, Db},
    events::Hub,
    http::{self, Api, App, Settings},
    local::Local,
    model::NewCard,
    ops,
    push::{Vapid, WebPush},
    worker::{Timing, Worker},
};
use sqlx::postgres::PgConnectOptions;
use utoipa::OpenApi;

fn env(name: &str) -> anyhow::Result<String> {
    std::env::var(name).with_context(|| format!("{name} is not set"))
}

fn connection(user: &str, password_env: &str) -> anyhow::Result<PgConnectOptions> {
    Ok(PgConnectOptions::new()
        .host(&env("CATCHUP_DB_HOST")?)
        .port(std::env::var("CATCHUP_DB_PORT").unwrap_or_else(|_| "5432".into()).parse()?)
        .database("catchup")
        .username(user)
        .password(&env(password_env)?))
}

fn owner() -> anyhow::Result<PgConnectOptions> {
    connection("catchup_owner", "CATCHUP_DB_OWNER_PASSWORD")
}

async fn app_db(max: u32) -> anyhow::Result<Db> {
    Db::connect(connection("catchup_app", "CATCHUP_DB_APP_PASSWORD")?, max).await
}

fn master() -> anyhow::Result<Arc<Key>> {
    Ok(Arc::new(Key::from_hex(&env("CATCHUP_MASTER_KEY")?)?))
}

fn vapid() -> anyhow::Result<Vapid> {
    Ok(Vapid::new(&env("CATCHUP_VAPID_KEY")?, &env("CATCHUP_PUSH_CONTACT")?)?)
}

async fn stopped() {
    let interrupt = tokio::signal::ctrl_c();
    match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
        Ok(mut terminate) => {
            tokio::select! { _ = interrupt => {}, _ = terminate.recv() => {} }
        }
        Err(_) => {
            let _ = interrupt.await;
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with_writer(std::io::stderr)
        .init();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    match args.as_slice() {
        ["migrate"] => db::migrate(owner()?, &env("CATCHUP_DB_APP_PASSWORD")?).await?,
        ["serve"] => {
            let db = app_db(16).await?;
            let settings = Settings {
                origins: env("CATCHUP_ORIGINS")?.split(',').map(|o| o.trim().to_owned()).collect(),
                secure_cookie: std::env::var("CATCHUP_INSECURE_COOKIE").as_deref() != Ok("1"),
                push_public_key: vapid()?.public_key(),
            };
            let app = App { hub: Hub::start(&db), db, settings: Arc::new(settings), master: master()? };
            let listener = tokio::net::TcpListener::bind(env("CATCHUP_BIND")?).await?;
            tracing::info!("api ready");
            let serving = axum::serve(listener, http::router(app));
            // 열린 SSE 가 끝나기를 기다리지 않아요. 기기는 마지막 번호부터 다시 붙어요
            tokio::select! { done = serving => done?, () = stopped() => {} }
        }
        ["worker"] => {
            let db = app_db(16).await?;
            let worker =
                Worker::new(db.clone(), Arc::new(codex::bridge::Bridge::new(db.clone(), Arc::new(Local::new(db)))), Timing::default())
                    .with_notifications(master()?, Arc::new(WebPush::new(vapid()?)?));
            let (stop, stopping) = tokio::sync::watch::channel(false);
            tokio::spawn(async move {
                stopped().await;
                let _ = stop.send(true);
            });
            tracing::info!("worker ready");
            worker.run(Duration::from_millis(250), stopping).await;
        }
        ["agent"] => {
            let db = app_db(8).await?;
            // auth.json 하나에 실행 흐름 하나 — 에이전트 일꾼은 한 벌만 돌아요
            let mut only = db.pool().acquire().await?;
            loop {
                let got: bool = sqlx::query_scalar("SELECT pg_try_advisory_lock(1668572259)").fetch_one(&mut *only).await?;
                if got {
                    break;
                }
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
            let secret = env("CATCHUP_GATEWAY_SECRET")?;
            anyhow::ensure!(secret.len() >= 32, "gateway secret is too short");
            let paths = codex::hub::Paths {
                binary: env("CATCHUP_CODEX_BIN")?.into(),
                volatile: env("CATCHUP_CODEX_VOLATILE")?.into(),
                durable: env("CATCHUP_CODEX_DURABLE")?.into(),
                sandboxes: match std::env::var("CATCHUP_SANDBOXES") {
                    Ok(list) => list.split(',').filter(|p| !p.trim().is_empty()).zip(1..).map(|(p, n)| (n, p.trim().into())).collect(),
                    Err(_) => vec![],
                },
                code_host: std::env::var("CATCHUP_CODE_HOST").ok().map(Into::into),
            };
            let hub = codex::hub::Hub::new(db.clone(), master()?, paths);
            let listener = tokio::net::TcpListener::bind(env("CATCHUP_BIND")?).await?;
            let gateway = codex::gateway::router(hub.clone(), secret);
            tokio::spawn(async move {
                if let Err(error) = axum::serve(listener, gateway).await {
                    tracing::error!(%error, "gateway stopped");
                }
            });
            let (stop, stopping) = tokio::sync::watch::channel(false);
            let working = tokio::spawn(async move { hub.run(stopping).await });
            tracing::info!("agent ready");
            // 잠금을 쥔 연결이 끊기면 두 벌이 될 수 있어요. 그러면 스스로 내려가요
            let lost = async {
                loop {
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    if sqlx::query("SELECT 1").execute(&mut *only).await.is_err() {
                        break;
                    }
                }
            };
            let lost_lock = tokio::select! { () = stopped() => false, () = lost => true };
            let _ = stop.send(true);
            let _ = tokio::time::timeout(Duration::from_secs(20), working).await;
            if lost_lock {
                bail!("lost the agent lock");
            }
        }
        // 샌드박스 한 자리. DB 접속 정보도 열쇠도 없어요
        ["sandbox"] => {
            let config = codex::sandbox::Config {
                socket: env("CATCHUP_SANDBOX_SOCKET")?.into(),
                state: env("CATCHUP_SANDBOX_STATE")?.into(),
                work: env("CATCHUP_SANDBOX_WORK")?.into(),
                codex: env("CATCHUP_SANDBOX_CODEX")?.into(),
                max_bytes: env("CATCHUP_SANDBOX_MAX_MB")?.parse::<u64>()? * 1024 * 1024,
            };
            tokio::select! { done = codex::sandbox::serve(config) => done?, () = stopped() => {} }
        }
        // 모델의 JS 실행기. 망 · DB · 열쇠가 없어요
        ["codehost"] => {
            let config = codex::codehost::Config {
                socket: env("CATCHUP_CODE_HOST_SOCKET")?.into(),
                binary: env("CATCHUP_CODE_HOST_BIN")?.into(),
            };
            tokio::select! { done = codex::codehost::serve(config) => done?, () = stopped() => {} }
        }
        ["provision", email, rest @ ..] => {
            let master = Key::from_hex(&env("CATCHUP_MASTER_KEY")?)?;
            println!("{}", ops::provision(owner()?, &master, email, rest.first().copied().unwrap_or("ko")).await?);
        }
        ["login-code", email] => println!("{}", ops::login_code(owner()?, email).await?),
        // 손으로 넣는 카드: 표준 입력으로 NewCard 배열
        ["seed", email] => {
            let mut text = String::new();
            std::io::stdin().read_to_string(&mut text)?;
            let new: Vec<NewCard> = serde_json::from_str(&text)?;
            let master = Key::from_hex(&env("CATCHUP_MASTER_KEY")?)?;
            let cell = ops::provision(owner()?, &master, email, "ko").await?;
            let db = app_db(2).await?;
            for card in &new {
                cards::create(&db, cell, card).await?;
            }
            println!("{}", new.len());
        }
        ["openapi"] => println!("{}", serde_json::to_string_pretty(&Api::openapi())?),
        ["health"] => {
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let check = async {
                let mut socket = tokio::net::TcpStream::connect("127.0.0.1:4320").await?;
                socket.write_all(b"GET /health/ready HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").await?;
                let mut head = [0u8; 12];
                socket.read_exact(&mut head).await?;
                anyhow::ensure!(head.ends_with(b"204"), "not ready");
                Ok::<_, anyhow::Error>(())
            };
            tokio::time::timeout(Duration::from_secs(2), check).await??;
        }
        _ => bail!(
            "usage: catchup-api migrate | serve | worker | agent | sandbox | codehost | provision <email> [ko|en] | login-code <email> | seed <email> | openapi | health"
        ),
    }
    Ok(())
}
