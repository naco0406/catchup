//! 모델이 쓴 JS 를 돌리는 곳(code-mode host).
//!
//! 지금 Codex 모델은 모두 `code_mode_only` 라서 명령도 JS 안에서 `tools.exec_command` 로 불러요(2026-11-22 실측).
//! 그 JS 를 로그인 쪽에서 돌리면 V8 이 뚫리는 순간 토큰이 읽혀요. 그래서:
//! - 로그인 쪽 이미지에는 실행기 파일이 없어요(잇지 못하면 실행도 없어요).
//! - 실행기는 망 · 비밀 · 작업 폴더가 없는 컨테이너에서, 연결(app-server 하나 = 칸 하나)마다 다른 uid 로 돌아요.
//! - JS 가 부른 도구는 로그인 쪽으로 돌아와서 승인 → 샌드박스의 같은 길을 타요.

use std::{
    fs,
    net::SocketAddr,
    os::unix::fs::{PermissionsExt, chown},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, Mutex, PoisonError},
};

use tokio::{
    net::{TcpListener, UnixListener, UnixStream},
    process::Command,
};

const AGENT_GROUP: u32 = 10001;
const FIRST_USER: u32 = 20001;
/// 한 번에 뜨는 실행기 = 한 번에 떠 있는 app-server
const HOSTS: u32 = 32;

#[derive(Debug, Clone)]
pub struct Config {
    pub socket: PathBuf,
    pub binary: PathBuf,
}

#[derive(Default)]
struct Users {
    busy: Mutex<Vec<u32>>,
}

struct Lease {
    users: Arc<Users>,
    uid: u32,
}

impl Users {
    fn take(self: &Arc<Self>) -> Option<Lease> {
        let mut busy = self.busy.lock().unwrap_or_else(PoisonError::into_inner);
        let uid = (FIRST_USER..FIRST_USER + HOSTS).find(|uid| !busy.contains(uid))?;
        busy.push(uid);
        Some(Lease { users: self.clone(), uid })
    }
}

impl Drop for Lease {
    fn drop(&mut self) {
        self.users.busy.lock().unwrap_or_else(PoisonError::into_inner).retain(|uid| *uid != self.uid);
    }
}

pub async fn serve(config: Config) -> anyhow::Result<()> {
    let dir = config.socket.parent().ok_or_else(|| anyhow::anyhow!("bad socket path"))?;
    chown(dir, Some(0), Some(AGENT_GROUP))?;
    fs::set_permissions(dir, fs::Permissions::from_mode(0o750))?;
    if fs::symlink_metadata(&config.socket).is_ok() {
        fs::remove_file(&config.socket)?;
    }
    let listener = UnixListener::bind(&config.socket)?;
    chown(&config.socket, Some(0), Some(AGENT_GROUP))?;
    fs::set_permissions(&config.socket, fs::Permissions::from_mode(0o660))?;
    let users = Arc::new(Users::default());
    tracing::info!("code host ready");
    loop {
        let (stream, _) = listener.accept().await?;
        let Some(lease) = users.take() else {
            tracing::warn!("too many code hosts");
            continue;
        };
        let binary = config.binary.clone();
        tokio::spawn(async move {
            if let Err(error) = host(&binary, lease, stream).await {
                tracing::warn!(%error, "code host stopped");
            }
        });
    }
}

async fn host(binary: &Path, lease: Lease, stream: UnixStream) -> anyhow::Result<()> {
    let mut child = Command::new(binary)
        .args(["--listen", "grpc+stdio://"])
        .current_dir("/")
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .uid(lease.uid)
        .gid(lease.uid)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()?;
    let (Some(mut stdin), Some(mut stdout)) = (child.stdin.take(), child.stdout.take()) else {
        anyhow::bail!("code host has no pipes")
    };
    let (mut read, mut write) = stream.into_split();
    tokio::select! {
        _ = tokio::io::copy(&mut read, &mut stdin) => {}
        _ = tokio::io::copy(&mut stdout, &mut write) => {}
    }
    // 다 죽은 다음에야 그 uid 를 다음 연결에 내줘요
    child.kill().await?;
    Ok(())
}

/// 에이전트 안 127.0.0.1 → 실행기 소켓. app-server 의 `--code-mode-host` 는 http 주소만 받아요
pub async fn forward(socket: PathBuf) -> std::io::Result<SocketAddr> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let address = listener.local_addr()?;
    tokio::spawn(async move {
        loop {
            let mut from = match listener.accept().await {
                Ok((from, _)) => from,
                Err(error) => {
                    tracing::warn!(%error, "cannot accept a code host connection");
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    continue;
                }
            };
            let socket = socket.clone();
            tokio::spawn(async move {
                let carried = async {
                    from.set_nodelay(true)?;
                    let mut to = UnixStream::connect(&socket).await?;
                    tokio::io::copy_bidirectional(&mut from, &mut to).await
                };
                if let Err(error) = carried.await {
                    tracing::warn!(%error, "code host connection ended");
                }
            });
        }
    });
    Ok(address)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_connections_never_share_a_user() {
        let users = Arc::new(Users::default());
        let all: Vec<Lease> = (0..HOSTS).map(|_| users.take().unwrap()).collect();
        let distinct: std::collections::HashSet<u32> = all.iter().map(|l| l.uid).collect();
        assert_eq!(distinct.len(), HOSTS as usize);
        assert!(distinct.iter().all(|uid| ![0, 10001, 10002].contains(uid)));
        assert!(users.take().is_none());
        drop(all);
        assert!(users.take().is_some());
    }
}
