//! 저장소 받기. 샌드박스에는 망이 없어서 로그인 쪽이 tar.gz 로 받아 소켓으로 넣어요.
//! 지금은 공개 저장소만(토큰 없음). 비공개는 GitHub 연결이 생긴 뒤에.

use std::time::Duration;

use super::sandbox::MAX_ARCHIVE;
use crate::error::{Error, Result};

const API: &str = "https://api.github.com/";
const DOWNLOAD_HOST: &str = "codeload.github.com";

/// `owner/name` 이나 GitHub 주소를 `owner/name` 으로
pub fn parse(given: &str) -> Option<String> {
    let given = given.trim().trim_end_matches('/');
    let path = given.strip_prefix("https://github.com/").unwrap_or(given);
    let path = path.strip_suffix(".git").unwrap_or(path);
    let (owner, name) = path.split_once('/')?;
    let owner_ok =
        (1..=39).contains(&owner.len()) && owner.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') && !owner.starts_with('-');
    let name_ok = (1..=100).contains(&name.len())
        && name.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
        && !name.starts_with('.');
    (owner_ok && name_ok).then(|| format!("{owner}/{name}"))
}

pub async fn fetch(repo: &str) -> Result<Vec<u8>> {
    let repo = parse(repo).ok_or(Error::Invalid("bad_repo"))?;
    let failed = |_| Error::Conflict("repo_unavailable");
    let policy = reqwest::redirect::Policy::custom(|attempt| {
        let url = attempt.url();
        let expected = url.scheme() == "https" && url.host_str() == Some(DOWNLOAD_HOST) && attempt.previous().len() < 3;
        if expected { attempt.follow() } else { attempt.stop() }
    });
    let client = reqwest::Client::builder().redirect(policy).timeout(Duration::from_secs(120)).no_proxy().build().map_err(failed)?;
    // 밖으로는 일반 이름만 보내요
    let mut response =
        client.get(format!("{API}repos/{repo}/tarball")).header("user-agent", "archive-client").send().await.map_err(failed)?;
    match response.status().as_u16() {
        200 => {}
        403 | 429 => return Err(Error::Conflict("repo_rate_limited")),
        404 => return Err(Error::Conflict("repo_not_found_or_private")),
        _ => return Err(Error::Conflict("repo_unavailable")),
    }
    let mut archive = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(failed)? {
        if (archive.len() + chunk.len()) as u64 > MAX_ARCHIVE {
            return Err(Error::Conflict("repo_too_large"));
        }
        archive.extend_from_slice(&chunk);
    }
    if archive.is_empty() {
        return Err(Error::Conflict("repo_unavailable"));
    }
    Ok(archive)
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn only_a_github_repository_is_accepted() {
        for good in ["acme/shop", "https://github.com/acme/shop", "https://github.com/acme/shop.git", "acme/shop.js"] {
            assert!(parse(good).is_some(), "{good}");
        }
        for bad in [
            "",
            "shop",
            "../etc",
            "acme/..",
            "acme/shop/../../x",
            "https://evil.example/acme/shop",
            "acme/sh op",
            "a@b/c",
            "acme/shop?ref=x",
            "acme/shop#x",
        ] {
            assert!(parse(bad).is_none(), "{bad}");
        }
    }
}
