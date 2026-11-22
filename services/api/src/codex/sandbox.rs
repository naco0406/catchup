//! 샌드박스 한 자리(컨테이너 하나 = 세션 하나)와, 로그인 쪽에서 거기에 붙는 길.
//!
//! - 네트워크 · 비밀값 · DB · Docker 소켓이 없어요. 로그인 쪽과는 Unix 소켓 하나로만 이어져요.
//! - 감독(이 프로세스)은 root 지만 능력은 다섯뿐이고, 명령은 uid 10002 로 돌아서 감독 · 소켓 · 상태를 못 건드려요.
//! - 비울 때는 표시만 남기고 꺼져요. 컨테이너가 다시 켜져서(남은 프로세스 0) 지운 다음에야 빈 자리가 돼요.

use std::{
    fs, io,
    os::unix::fs::{MetadataExt, PermissionsExt, chown},
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::{UnixListener, UnixStream},
    process::Command,
    sync::{Mutex, Semaphore, watch},
};
use uuid::Uuid;

const USER: u32 = 10002;
const AGENT_GROUP: u32 = 10001;
const CONNECTIONS: usize = 8;
const HELLO: u64 = 4096;
pub const MAX_ARCHIVE: u64 = 64 * 1024 * 1024;
pub const MAX_PATCH: usize = 4 * 1024 * 1024;
const TOOL: Duration = Duration::from_secs(120);
/// 명령이 도는 곳과 같은 uid 라서, 저장소가 심은 git 설정 · 훅이 돌아도 샌드박스 안이에요
const START: &str = r#"set -eu
cd /workspace
git init -q
git -c user.name=CatchUp -c user.email=catchup@localhost add -A -f
git -c user.name=CatchUp -c user.email=catchup@localhost -c core.hooksPath=/dev/null commit -q --no-gpg-sign --allow-empty -m base
git update-ref refs/catchup/base HEAD"#;
const DIFF: &str = r#"set -eu
cd /workspace
export GIT_INDEX_FILE="$(mktemp -u /tmp/catchup-index.XXXXXX)"
git read-tree refs/catchup/base
git add -A
git diff --cached --binary --no-color --no-ext-diff --no-textconv refs/catchup/base
rm -f "$GIT_INDEX_FILE""#;
const WATCH: Duration = Duration::from_secs(2);
/// 작업 폴더 안의 파일 수
const MAX_ENTRIES: u64 = 200_000;

#[derive(Debug, Clone)]
pub struct Config {
    /// 이 자리만의 폴더. 에이전트 일꾼만 같이 봐요
    pub socket: PathBuf,
    pub state: PathBuf,
    pub work: PathBuf,
    pub codex: PathBuf,
    pub max_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Owner {
    pub cell: Uuid,
    pub session: Uuid,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Hello {
    Status,
    Claim(Owner),
    Release(Owner),
    /// 작업 폴더를 채워요. `bytes` 가 0 이면 빈 저장소, 아니면 tar.gz(바깥 폴더 하나를 벗겨요)가 이어서 와요
    Import {
        owner: Owner,
        bytes: u64,
    },
    /// 처음(base)에서 바뀐 것을 patch 로
    Export(Owner),
    /// 다음 줄부터는 exec-server 의 stdio
    Attach {
        owner: Owner,
        seat: Uuid,
    },
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Reply {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<Owner>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 작업 폴더가 한도를 넘었어요
    #[serde(default)]
    pub full: bool,
    /// 자리의 세대 — 컨테이너가 다시 켜질 때마다 바뀌어요. 바뀌었으면 앞의 실행 연결은 죽었어요
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seat: Option<Uuid>,
}

impl Reply {
    fn refuse(error: &str) -> Self {
        Self { ok: false, owner: None, error: Some(error.into()), full: false, seat: None }
    }
}

/// 자리의 주인
#[derive(Debug)]
pub struct Seat {
    owner: Option<Owner>,
    file: PathBuf,
    releasing: PathBuf,
}

impl Seat {
    /// `releasing` 표시가 있으면 다 지운 다음에야 빈 자리
    pub fn open(state: &Path, work: &Path) -> io::Result<Self> {
        let (file, releasing) = (state.join("owner.json"), state.join("releasing"));
        if releasing.exists() {
            empty(work)?;
            if file.exists() {
                fs::remove_file(&file)?;
            }
            fs::remove_file(&releasing)?;
        }
        // 깨진 주인 표시는 빈 자리로 보지 않아요
        let owner = match fs::read(&file) {
            Ok(bytes) => Some(serde_json::from_slice(&bytes)?),
            Err(e) if e.kind() == io::ErrorKind::NotFound => None,
            Err(e) => return Err(e),
        };
        Ok(Self { owner, file, releasing })
    }

    pub fn owner(&self) -> Option<&Owner> {
        self.owner.as_ref()
    }

    pub fn claim(&mut self, wanted: &Owner) -> io::Result<bool> {
        if self.releasing.exists() {
            return Ok(false);
        }
        if let Some(owner) = &self.owner {
            return Ok(owner == wanted);
        }
        let next = self.file.with_extension("next");
        fs::write(&next, serde_json::to_vec(wanted)?)?;
        fs::set_permissions(&next, fs::Permissions::from_mode(0o600))?;
        fs::rename(&next, &self.file)?;
        self.owner = Some(wanted.clone());
        Ok(true)
    }

    pub fn may_attach(&self, wanted: &Owner) -> bool {
        !self.releasing.exists() && self.owner.as_ref() == Some(wanted)
    }

    pub fn release(&mut self, wanted: &Owner) -> io::Result<bool> {
        if self.owner.as_ref() != Some(wanted) {
            return Ok(false);
        }
        fs::write(&self.releasing, b"")?;
        Ok(true)
    }
}

/// 링크는 따라가지 않아요
fn empty(dir: &Path) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() { fs::remove_dir_all(entry.path())? } else { fs::remove_file(entry.path())? }
    }
    Ok(())
}

/// (바이트, 파일 수). 링크는 따라가지 않아요
pub fn usage(dir: &Path) -> (u64, u64) {
    let (mut bytes, mut entries) = (0, 0);
    let mut dirs = vec![dir.to_path_buf()];
    while let Some(dir) = dirs.pop() {
        let Ok(list) = fs::read_dir(&dir) else { continue };
        for entry in list.flatten() {
            // DirEntry::metadata 는 링크를 따라가지 않아요
            let Ok(meta) = entry.metadata() else { continue };
            entries += 1;
            bytes += meta.blocks() * 512;
            if meta.is_dir() {
                dirs.push(entry.path());
            }
            if entries > MAX_ENTRIES {
                return (bytes, entries);
            }
        }
    }
    (bytes, entries)
}

struct Slot {
    config: Config,
    boot: Uuid,
    seat: Mutex<Seat>,
    connections: Semaphore,
    full: watch::Sender<bool>,
    stop: watch::Sender<bool>,
}

pub async fn serve(config: Config) -> anyhow::Result<()> {
    let seat = Seat::open(&config.state, &config.work)?;
    fs::set_permissions(&config.state, fs::Permissions::from_mode(0o700))?;
    chown(&config.work, Some(USER), Some(USER))?;
    let dir = config.socket.parent().ok_or_else(|| anyhow::anyhow!("bad socket path"))?;
    chown(dir, Some(0), Some(AGENT_GROUP))?;
    fs::set_permissions(dir, fs::Permissions::from_mode(0o750))?;
    if fs::symlink_metadata(&config.socket).is_ok() {
        fs::remove_file(&config.socket)?;
    }
    let listener = UnixListener::bind(&config.socket)?;
    chown(&config.socket, Some(0), Some(AGENT_GROUP))?;
    fs::set_permissions(&config.socket, fs::Permissions::from_mode(0o660))?;

    let (stop, mut stopping) = watch::channel(false);
    let slot = Arc::new(Slot {
        boot: Uuid::new_v4(),
        config,
        seat: Mutex::new(seat),
        connections: Semaphore::new(CONNECTIONS),
        full: watch::channel(false).0,
        stop,
    });
    tokio::spawn(watch_size(slot.clone()));
    tracing::info!("sandbox ready");
    loop {
        tokio::select! {
            accepted = listener.accept() => {
                let (stream, _) = accepted?;
                let slot = slot.clone();
                tokio::spawn(async move {
                    if let Err(error) = handle(&slot, stream).await {
                        tracing::warn!(%error, "sandbox connection failed");
                    }
                });
            }
            // main 이 끝나면 컨테이너의 나머지 프로세스도 모두 죽어요
            _ = stopping.changed() => return Ok(()),
        }
    }
}

fn as_user(program: &str, args: &[&str], work: &Path) -> Command {
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(work)
        .env_clear()
        .env("PATH", "/usr/local/cargo/bin:/usr/local/bin:/usr/bin:/bin")
        .env("HOME", "/home/agent")
        .env("LANG", "C.UTF-8")
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .uid(USER)
        .gid(USER)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    command
}

async fn import(work: &Path, read: &mut (impl AsyncReadExt + Unpin), bytes: u64) -> anyhow::Result<bool> {
    // 이미 채운 자리면 그대로 — 다시 보내도 작업을 덮어쓰지 않게
    let seen = as_user("git", &["-C", "/workspace", "rev-parse", "-q", "--verify", "refs/catchup/base"], work).status().await?;
    if seen.success() {
        tokio::io::copy(&mut read.take(bytes), &mut tokio::io::sink()).await?;
        return Ok(true);
    }
    if bytes > 0 {
        let args = ["-xzf", "-", "--strip-components=1", "--no-same-owner", "--no-same-permissions", "-C", "/workspace"];
        let mut tar = as_user("tar", &args, work).stdin(Stdio::piped()).spawn()?;
        let mut stdin = tar.stdin.take().ok_or_else(|| anyhow::anyhow!("tar has no stdin"))?;
        let fed = tokio::time::timeout(TOOL, tokio::io::copy(&mut read.take(bytes), &mut stdin)).await??;
        drop(stdin);
        let unpacked = tokio::time::timeout(TOOL, tar.wait()).await??.success();
        if fed != bytes || !unpacked {
            return Ok(false);
        }
    }
    Ok(tokio::time::timeout(TOOL, as_user("sh", &["-c", START], work).status()).await??.success())
}

/// 너무 크면 None
async fn export(work: &Path) -> anyhow::Result<Option<Vec<u8>>> {
    let mut diff = as_user("sh", &["-c", DIFF], work).stdout(Stdio::piped()).spawn()?;
    let stdout = diff.stdout.take().ok_or_else(|| anyhow::anyhow!("diff has no stdout"))?;
    let mut patch = Vec::new();
    tokio::time::timeout(TOOL, stdout.take(MAX_PATCH as u64 + 1).read_to_end(&mut patch)).await??;
    if patch.len() > MAX_PATCH {
        diff.kill().await?;
        return Ok(None);
    }
    let finished = tokio::time::timeout(TOOL, diff.wait()).await??.success();
    Ok(finished.then_some(patch))
}

async fn watch_size(slot: Arc<Slot>) {
    loop {
        tokio::time::sleep(WATCH).await;
        let work = slot.config.work.clone();
        let Ok((bytes, entries)) = tokio::task::spawn_blocking(move || usage(&work)).await else { continue };
        let over = bytes > slot.config.max_bytes || entries > MAX_ENTRIES;
        let was = slot.full.send_replace(over);
        if over {
            if !was {
                tracing::warn!("workspace is over its limit; stopping its processes");
            }
            // 그 uid 의 프로세스를 모두 멈춰요
            let killed = Command::new("/bin/sh").args(["-c", "kill -KILL -1"]).env_clear().uid(USER).gid(USER).status().await;
            if let Err(error) = killed {
                tracing::error!(%error, "cannot stop sandbox processes");
            }
        }
    }
}

async fn say(stream: &mut (impl AsyncWriteExt + Unpin), reply: &Reply) -> anyhow::Result<()> {
    let mut line = serde_json::to_vec(reply)?;
    line.push(b'\n');
    stream.write_all(&line).await?;
    stream.flush().await?;
    Ok(())
}

async fn handle(slot: &Slot, stream: UnixStream) -> anyhow::Result<()> {
    let Ok(_permit) = slot.connections.try_acquire() else {
        let mut stream = stream;
        return say(&mut stream, &Reply::refuse("busy")).await;
    };
    let (read, mut write) = stream.into_split();
    let mut read = BufReader::new(read);
    let mut line = Vec::new();
    tokio::time::timeout(Duration::from_secs(5), (&mut read).take(HELLO).read_until(b'\n', &mut line)).await??;
    let Ok(hello) = serde_json::from_slice::<Hello>(&line) else { return say(&mut write, &Reply::refuse("bad_request")).await };
    let full = *slot.full.borrow();
    match hello {
        Hello::Status => {
            let owner = slot.seat.lock().await.owner().cloned();
            say(&mut write, &Reply { ok: true, owner, error: None, full, seat: Some(slot.boot) }).await
        }
        Hello::Claim(wanted) => {
            let mut seat = slot.seat.lock().await;
            let reply = if seat.claim(&wanted)? {
                Reply { ok: true, owner: Some(wanted), error: None, full, seat: Some(slot.boot) }
            } else {
                Reply::refuse("taken")
            };
            say(&mut write, &reply).await
        }
        Hello::Release(wanted) => {
            let released = slot.seat.lock().await.release(&wanted)?;
            let reply = if released {
                Reply { ok: true, owner: None, error: None, full: false, seat: Some(slot.boot) }
            } else {
                Reply::refuse("not_owner")
            };
            say(&mut write, &reply).await?;
            if released {
                let _ = slot.stop.send(true);
            }
            Ok(())
        }
        Hello::Import { owner, bytes } => {
            if bytes > MAX_ARCHIVE || slot.seat.lock().await.owner() != Some(&owner) {
                return say(&mut write, &Reply::refuse("not_yours")).await;
            }
            say(&mut write, &Reply { ok: true, owner: None, error: None, full, seat: Some(slot.boot) }).await?;
            let reply = if import(&slot.config.work, &mut read, bytes).await? {
                Reply { ok: true, owner: None, error: None, full, seat: Some(slot.boot) }
            } else {
                Reply::refuse("import_failed")
            };
            say(&mut write, &reply).await
        }
        Hello::Export(owner) => {
            if slot.seat.lock().await.owner() != Some(&owner) {
                return say(&mut write, &Reply::refuse("not_yours")).await;
            }
            let Some(patch) = export(&slot.config.work).await? else { return say(&mut write, &Reply::refuse("export_failed")).await };
            say(&mut write, &Reply { ok: true, owner: None, error: None, full, seat: Some(slot.boot) }).await?;
            write.write_all(&patch).await?;
            write.shutdown().await?;
            Ok(())
        }
        Hello::Attach { owner, seat } => {
            if seat != slot.boot || !slot.seat.lock().await.may_attach(&owner) {
                return say(&mut write, &Reply::refuse("not_yours")).await;
            }
            if full {
                return say(&mut write, &Reply::refuse("full")).await;
            }
            say(&mut write, &Reply { ok: true, owner: None, error: None, full, seat: Some(slot.boot) }).await?;
            exec_server(&slot.config, read, write).await
        }
    }
}

async fn exec_server(
    config: &Config,
    mut read: BufReader<tokio::net::unix::OwnedReadHalf>,
    mut write: tokio::net::unix::OwnedWriteHalf,
) -> anyhow::Result<()> {
    let mut child = Command::new(&config.codex)
        .args(["exec-server", "--listen", "stdio", "--concurrent-requests", "8"])
        .current_dir(&config.work)
        .env_clear()
        .env("PATH", "/usr/local/cargo/bin:/usr/local/bin:/usr/bin:/bin")
        .env("HOME", "/home/agent")
        .env("CODEX_HOME", "/home/agent/.codex")
        .env("TMPDIR", "/tmp")
        .env("LANG", "C.UTF-8")
        .uid(USER)
        .gid(USER)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()?;
    let (Some(mut stdin), Some(mut stdout)) = (child.stdin.take(), child.stdout.take()) else {
        anyhow::bail!("exec-server has no pipes")
    };
    tokio::select! {
        _ = tokio::io::copy(&mut read, &mut stdin) => {}
        _ = tokio::io::copy(&mut stdout, &mut write) => {}
    }
    drop(stdin);
    if tokio::time::timeout(Duration::from_secs(3), child.wait()).await.is_err() {
        child.kill().await?;
    }
    Ok(())
}

async fn greet(socket: &Path, hello: &Hello) -> anyhow::Result<(Reply, BufReader<UnixStream>)> {
    let mut stream = BufReader::new(tokio::time::timeout(Duration::from_secs(5), UnixStream::connect(socket)).await??);
    let mut line = serde_json::to_vec(hello)?;
    line.push(b'\n');
    stream.write_all(&line).await?;
    stream.flush().await?;
    let mut reply = Vec::new();
    tokio::time::timeout(Duration::from_secs(10), (&mut stream).take(HELLO).read_until(b'\n', &mut reply)).await??;
    Ok((serde_json::from_slice(&reply)?, stream))
}

pub async fn ask(socket: &Path, hello: &Hello) -> anyhow::Result<Reply> {
    Ok(greet(socket, hello).await?.0)
}

pub async fn send_archive(socket: &Path, owner: &Owner, archive: &[u8]) -> anyhow::Result<()> {
    let hello = Hello::Import { owner: owner.clone(), bytes: archive.len() as u64 };
    let (ready, mut stream) = greet(socket, &hello).await?;
    anyhow::ensure!(ready.ok, "sandbox refused the archive");
    stream.write_all(archive).await?;
    stream.flush().await?;
    let mut line = Vec::new();
    tokio::time::timeout(TOOL * 2, (&mut stream).take(HELLO).read_until(b'\n', &mut line)).await??;
    anyhow::ensure!(serde_json::from_slice::<Reply>(&line)?.ok, "sandbox could not unpack the archive");
    Ok(())
}

pub async fn take_patch(socket: &Path, owner: &Owner) -> anyhow::Result<Vec<u8>> {
    let mut stream = BufReader::new(UnixStream::connect(socket).await?);
    let mut hello = serde_json::to_vec(&Hello::Export(owner.clone()))?;
    hello.push(b'\n');
    stream.write_all(&hello).await?;
    stream.flush().await?;
    let mut line = Vec::new();
    tokio::time::timeout(TOOL * 2, (&mut stream).take(HELLO).read_until(b'\n', &mut line)).await??;
    anyhow::ensure!(serde_json::from_slice::<Reply>(&line)?.ok, "sandbox could not export");
    let mut patch = Vec::new();
    tokio::time::timeout(TOOL, (&mut stream).take(MAX_PATCH as u64 + 1).read_to_end(&mut patch)).await??;
    anyhow::ensure!(patch.len() <= MAX_PATCH, "patch is too large");
    Ok(patch)
}

/// 통로(`lanes.rs`)가 자리의 exec-server 에 붙어요
pub async fn attach(socket: &Path, owner: &Owner, seat: Uuid) -> anyhow::Result<BufReader<UnixStream>> {
    let (reply, stream) = greet(socket, &Hello::Attach { owner: owner.clone(), seat }).await?;
    anyhow::ensure!(reply.ok, "sandbox refused");
    Ok(stream)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Dirs(PathBuf);

    impl Dirs {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("catchup-seat-test-{}", Uuid::new_v4().simple()));
            for dir in ["state", "work", "outside"] {
                fs::create_dir_all(root.join(dir)).unwrap();
            }
            Self(root)
        }
        fn at(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
        fn seat(&self) -> Seat {
            Seat::open(&self.at("state"), &self.at("work")).unwrap()
        }
    }

    impl Drop for Dirs {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0); // 이 시험이 만든 임시 폴더
        }
    }

    fn owner() -> Owner {
        Owner { cell: Uuid::new_v4(), session: Uuid::new_v4() }
    }

    #[test]
    fn a_seat_has_one_owner_across_restarts() {
        let (dirs, a, b) = (Dirs::new(), owner(), owner());
        let mut seat = dirs.seat();
        assert!(seat.claim(&a).unwrap() && seat.claim(&a).unwrap());
        assert!(!seat.claim(&b).unwrap());
        let mut again = dirs.seat();
        assert_eq!(again.owner(), Some(&a));
        let same_cell = Owner { cell: a.cell, session: Uuid::new_v4() };
        assert!(again.may_attach(&a) && !again.may_attach(&b) && !again.may_attach(&same_cell));
        assert!(!again.claim(&b).unwrap() && !again.release(&b).unwrap());
    }

    #[test]
    fn a_released_seat_is_free_only_after_it_is_wiped() {
        let (dirs, a, b) = (Dirs::new(), owner(), owner());
        let mut seat = dirs.seat();
        seat.claim(&a).unwrap();
        fs::create_dir_all(dirs.at("work").join("repo/.git")).unwrap();
        fs::write(dirs.at("work").join("repo/.git/hook"), b"poison").unwrap();
        assert!(seat.release(&a).unwrap());
        assert!(!seat.claim(&b).unwrap() && !seat.may_attach(&a), "비우기 전에는 누구의 것도 아니에요");
        let mut clean = dirs.seat();
        assert_eq!(fs::read_dir(dirs.at("work")).unwrap().count(), 0);
        assert!(clean.claim(&b).unwrap());
    }

    #[test]
    fn wiping_and_measuring_do_not_follow_links() {
        let (dirs, a) = (Dirs::new(), owner());
        fs::write(dirs.at("outside").join("keep"), vec![1u8; 1 << 20]).unwrap();
        std::os::unix::fs::symlink(dirs.at("outside"), dirs.at("work").join("out")).unwrap();
        assert!(usage(&dirs.at("work")).0 < 1 << 20);
        let mut seat = dirs.seat();
        seat.claim(&a).unwrap();
        seat.release(&a).unwrap();
        dirs.seat();
        assert!(dirs.at("outside").join("keep").exists());
    }

    #[test]
    fn a_broken_owner_record_is_not_a_free_seat() {
        let dirs = Dirs::new();
        fs::write(dirs.at("state").join("owner.json"), b"{").unwrap();
        assert!(Seat::open(&dirs.at("state"), &dirs.at("work")).is_err());
    }
}
