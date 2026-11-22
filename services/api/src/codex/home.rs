//! 칸마다 CODEX_HOME 하나.
//! - 로그인(`auth.json`)은 메모리 디스크에만 평문으로 있어요. DB 에는 칸 키로 잠근 것만.
//! - 이어 가기에 필요한 세션 기록만 남는 디스크에 둬요(`sessions` · `sqlite`).
//! - 로컬 실행 환경이 없어요. 실행은 샌드박스의 exec-server 로만.

use std::{
    fs,
    io::{self, Write},
    os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt, symlink},
    path::{Path, PathBuf},
};

use uuid::Uuid;

use crate::crypto::sha256;

const MAX_AUTH: u64 = 256 * 1024;

// 승인 정책은 여기 안 써요 — 0.163.0 은 설정 파일의 "untrusted" 를 거부해요(2026-11-22 실측). 스레드마다 줘요
// code_mode_host: 지금 모델은 모두 code_mode_only 라 켜야 실행 도구가 생겨요. JS 는 여기서 안 돌고 codehost.rs 로 나가요
const CONFIG: &str = r#"# CatchUp 이 쓰는 파일이에요. 켤 때마다 다시 써요.
cli_auth_credentials_store = "file"
web_search = "disabled"

[history]
persistence = "none"

[analytics]
enabled = false

[feedback]
enabled = false

# 모델 정보(multi_agent_version v2)가 features.multi_agent 를 무시해요. 하위 에이전트는 이것만 꺼요(실측)
[agents]
enabled = false

[features]
apps = false
plugins = false
remote_plugin = false
hooks = false
multi_agent = false
browser_use = false
computer_use = false
in_app_browser = false
image_generation = false
code_mode_host = true
skill_search = false
tool_suggest = false
default_mode_request_user_input = true
"#;

/// `include_local = false` 가 핵심 — 설정에는 실행 환경이 하나도 없어요.
/// 세션의 샌드박스는 실행 중에 등록해요(`lanes.rs`)
const ENVIRONMENTS: &str = "default = \"none\"\ninclude_local = false\n";

fn private_dir(path: &Path) -> io::Result<()> {
    fs::DirBuilder::new().recursive(true).mode(0o700).create(path)?;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
}

fn private_file(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let next = path.with_extension("next");
    let _ = fs::remove_file(&next);
    let mut file = fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&next)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    fs::rename(&next, path)
}

#[derive(Debug, Clone)]
pub struct Home {
    path: PathBuf,
}

impl Home {
    /// `volatile` 은 tmpfs, `durable` 은 볼륨
    pub fn prepare(volatile: &Path, durable: &Path, cell: Uuid) -> io::Result<Self> {
        let path = volatile.join(cell.simple().to_string());
        let kept = durable.join(cell.simple().to_string());
        private_dir(&path)?;
        private_dir(&kept.join("sessions"))?;
        private_dir(&kept.join("sqlite"))?;
        let link = path.join("sessions");
        match fs::symlink_metadata(&link) {
            Ok(found) if found.is_symlink() => {}
            Ok(_) => return Err(io::Error::new(io::ErrorKind::AlreadyExists, "sessions is not a link")),
            Err(_) => symlink(kept.join("sessions"), &link)?,
        }
        let sqlite = serde_json::Value::String(kept.join("sqlite").to_string_lossy().into_owned());
        private_file(&path.join("config.toml"), format!("sqlite_home = {sqlite}\n{CONFIG}").as_bytes())?;
        private_file(&path.join("environments.toml"), ENVIRONMENTS.as_bytes())?;
        Ok(Self { path })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn restore_auth(&self, auth: &[u8]) -> io::Result<()> {
        private_file(&self.path.join("auth.json"), auth)
    }

    /// 지금 로그인과 그 지문. 다 쓰이기 전(깨진 JSON)이면 None — 깨진 것을 되쓰지 않게
    pub fn auth(&self) -> io::Result<Option<(Vec<u8>, Vec<u8>)>> {
        let path = self.path.join("auth.json");
        let found = match fs::symlink_metadata(&path) {
            Ok(found) => found,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e),
        };
        if !found.is_file() || found.len() > MAX_AUTH {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "unexpected auth file"));
        }
        let bytes = fs::read(&path)?;
        if serde_json::from_slice::<serde_json::Value>(&bytes).is_err() {
            return Ok(None);
        }
        let fingerprint = sha256(&bytes);
        Ok(Some((bytes, fingerprint)))
    }

    pub fn forget_auth(&self) -> io::Result<()> {
        match fs::remove_file(self.path.join("auth.json")) {
            Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Roots(PathBuf);

    impl Roots {
        fn new() -> Self {
            Self(std::env::temp_dir().join(format!("catchup-home-test-{}", Uuid::new_v4().simple())))
        }
        fn home(&self, cell: Uuid) -> io::Result<Home> {
            Home::prepare(&self.0.join("mem"), &self.0.join("disk"), cell)
        }
    }

    impl Drop for Roots {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0); // 이 시험이 만든 임시 폴더
        }
    }

    fn mode(path: &Path) -> u32 {
        fs::metadata(path).unwrap().permissions().mode() & 0o777
    }

    fn files_under(path: &Path) -> Vec<PathBuf> {
        let mut out = vec![];
        for entry in fs::read_dir(path).unwrap().flatten() {
            if entry.file_type().unwrap().is_dir() { out.extend(files_under(&entry.path())) } else { out.push(entry.path()) }
        }
        out
    }

    #[test]
    fn the_login_is_private_and_never_on_the_durable_disk() {
        let roots = Roots::new();
        let home = roots.home(Uuid::new_v4()).unwrap();
        home.restore_auth(br#"{"canary":1}"#).unwrap();
        assert_eq!(mode(home.path()), 0o700);
        assert_eq!(mode(&home.path().join("auth.json")), 0o600);
        assert!(files_under(&roots.0.join("disk")).is_empty());
    }

    #[test]
    fn there_is_never_a_local_environment() {
        let roots = Roots::new();
        let home = roots.home(Uuid::new_v4()).unwrap();
        assert_eq!(fs::read_to_string(home.path().join("environments.toml")).unwrap(), "default = \"none\"\ninclude_local = false\n");
    }

    #[test]
    fn a_half_written_login_is_not_saved_back() {
        let roots = Roots::new();
        let home = roots.home(Uuid::new_v4()).unwrap();
        fs::write(home.path().join("auth.json"), b"{\"tok").unwrap();
        assert!(home.auth().unwrap().is_none());
    }

    #[test]
    fn a_linked_login_is_refused() {
        let roots = Roots::new();
        let home = roots.home(Uuid::new_v4()).unwrap();
        symlink("/etc/passwd", home.path().join("auth.json")).unwrap();
        assert!(home.auth().is_err());
    }

    #[test]
    fn cells_do_not_share_a_home() {
        let roots = Roots::new();
        let (a, b) = (roots.home(Uuid::new_v4()).unwrap(), roots.home(Uuid::new_v4()).unwrap());
        a.restore_auth(b"{}").unwrap();
        assert!(b.auth().unwrap().is_none());
    }
}
