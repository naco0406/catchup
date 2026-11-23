//! 패스키(WebAuthn) 로그인 — 코드 없이 얼굴 · 지문으로 들어와요.
//!
//! 서버는 공개 열쇠만 가져요. 로그인은 '서버가 낸 물음에, 이 사이트에서, 사람을 확인한 뒤, 등록한 열쇠로 한 서명'일 때만 돼요.
//! - 물음은 한 번만 · 5분 안에(지문만 보관)
//! - 출처는 서버가 아는 화면 주소여야 하고, 열쇠가 묶인 주소(rpId)의 지문이 같아야 해요 — 다른 사이트에서 받은 서명은 못 써요
//! - 사람 확인(얼굴 · 지문 · 기기 암호)이 된 서명만 받아요
//! - 열쇠는 P-256(ES256)만, 증명서(attestation)는 받지 않아요. 등록은 이미 로그인한 기기에서만 해요

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use ring::signature::{ECDSA_P256_SHA256_ASN1, UnparsedPublicKey};
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    crypto::{random, sha256},
    db::Db,
    error::{Error, Result},
};

/// 있었어요(user present) · 사람을 확인했어요(user verified) · 열쇠가 들어 있어요(attested credential data)
const PRESENT: u8 = 0x01;
const VERIFIED: u8 = 0x04;
const ATTESTED: u8 = 0x40;
/// P-256 공개 열쇠의 SPKI 머리. 그 뒤가 04 || x || y(65바이트)예요
const SPKI_P256: [u8; 26] = [
    0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03,
    0x01, 0x07, 0x03, 0x42, 0x00,
];
const MAX_FIELD: usize = 4096;

/// 등록할 때 화면에 주는 것(navigator.credentials.create 의 재료)
#[derive(Debug, Serialize, ToSchema)]
pub struct RegisterOptions {
    pub challenge: String,
    /// 열쇠가 묶이는 주소(사이트의 호스트)
    pub rp_id: String,
    pub user_id: String,
    pub user_name: String,
    /// 이미 등록한 열쇠 — 같은 기기에 두 번 만들지 않게
    pub exclude: Vec<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct LoginOptions {
    pub challenge: String,
    pub rp_id: String,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct Passkey {
    pub id: Uuid,
    pub label: String,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
}

/// 모두 base64url 이에요
#[derive(Clone, Debug, Deserialize, ToSchema)]
pub struct RegisterInput {
    pub credential: String,
    pub client_data: String,
    pub authenticator_data: String,
    /// 브라우저의 getPublicKey()(SPKI)
    pub public_key: String,
    #[serde(default)]
    pub label: String,
}

#[derive(Clone, Debug, Deserialize, ToSchema)]
pub struct LoginInput {
    pub credential: String,
    pub client_data: String,
    pub authenticator_data: String,
    pub signature: String,
    #[serde(default)]
    pub label: String,
}

fn unb64(text: &str) -> Option<Vec<u8>> {
    if text.len() > MAX_FIELD {
        return None;
    }
    URL_SAFE_NO_PAD.decode(text.trim_end_matches('=')).ok()
}

/// 출처 → 열쇠가 묶이는 주소(호스트). 포트와 길은 빼요
pub fn rp_id(origin: &str) -> Option<String> {
    let authority = origin.split_once("://")?.1.split(['/', '?', '#']).next()?;
    let host = authority.rsplit('@').next()?.split(':').next()?.to_lowercase();
    (!host.is_empty() && !host.contains(['[', ']'])).then_some(host)
}

#[derive(Deserialize)]
struct ClientData {
    #[serde(rename = "type")]
    kind: String,
    challenge: String,
    origin: String,
    #[serde(default, rename = "crossOrigin")]
    cross_origin: bool,
}

/// 브라우저가 서명에 넣은 것: 무엇을 하려는지 · 어느 물음인지 · 어느 사이트인지. 돌려주는 것은 (물음, 묶인 주소)
fn client(json: &[u8], want: &str, origins: &[String]) -> Option<(Vec<u8>, String)> {
    let data: ClientData = serde_json::from_slice(json).ok()?;
    if data.kind != want || data.cross_origin || !origins.contains(&data.origin) {
        return None;
    }
    Some((unb64(&data.challenge)?, rp_id(&data.origin)?))
}

struct Device<'a> {
    count: u32,
    /// 등록할 때만: 열쇠 ID 와, 그 뒤에 붙은 열쇠(COSE)
    attested: Option<(&'a [u8], &'a [u8])>,
}

/// 인증 장치가 낸 것: 묶인 주소의 지문 · 사람을 확인했는지 · 쓴 횟수
fn device<'a>(data: &'a [u8], rp_id: &str) -> Option<Device<'a>> {
    let (home, rest) = data.split_at_checked(32)?;
    let (&flags, rest) = rest.split_first()?;
    let (count, rest) = rest.split_at_checked(4)?;
    if !bool::from(home.ct_eq(&sha256(rp_id.as_bytes()))) || flags & PRESENT == 0 || flags & VERIFIED == 0 {
        return None;
    }
    let attested = if flags & ATTESTED == 0 {
        None
    } else {
        let (_aaguid, rest) = rest.split_at_checked(16)?;
        let (len, rest) = rest.split_at_checked(2)?;
        Some(rest.split_at_checked(usize::from(u16::from_be_bytes([len[0], len[1]])))?)
    };
    Some(Device { count: u32::from_be_bytes(count.try_into().ok()?), attested })
}

/// 브라우저가 준 열쇠(SPKI) → P-256 점. 장치 기록(COSE)에 같은 x · y 가 들어 있어야 해요
fn point(spki: &[u8], cose: &[u8]) -> Option<Vec<u8>> {
    let point = spki.strip_prefix(&SPKI_P256)?;
    if point.len() != 65 || point[0] != 0x04 {
        return None;
    }
    // CBOR 의 32바이트 묶음(58 20 …)으로 x 와 y 가 차례로 있어요
    let has = |half: &[u8]| cose.windows(34).any(|w| w[0] == 0x58 && w[1] == 0x20 && w[2..] == *half);
    (has(&point[1..33]) && has(&point[33..65])).then(|| point.to_vec())
}

fn label_of(label: &str) -> String {
    let label: String = crate::codex::request::visible(label.trim()).chars().take(120).collect();
    if label.is_empty() { "passkey".to_owned() } else { label }
}

async fn ask(db: &Db, kind: &str, cell: Option<Uuid>) -> Result<String> {
    let challenge = random::<32>()?;
    sqlx::query("SELECT front.passkey_ask($1, $2, $3)").bind(sha256(&challenge)).bind(kind).bind(cell).execute(db.pool()).await?;
    Ok(URL_SAFE_NO_PAD.encode(challenge))
}

async fn answered(db: &Db, challenge: &[u8], kind: &str, cell: Option<Uuid>) -> Result<bool> {
    Ok(sqlx::query_scalar("SELECT front.passkey_answer($1, $2, $3)")
        .bind(sha256(challenge))
        .bind(kind)
        .bind(cell)
        .fetch_one(db.pool())
        .await?)
}

#[derive(sqlx::FromRow)]
struct Listed {
    #[sqlx(flatten)]
    passkey: Passkey,
    credential: Vec<u8>,
}

async fn listed(db: &Db, cell: Uuid) -> Result<Vec<Listed>> {
    Ok(sqlx::query_as("SELECT id, label, created_at, last_used_at, credential FROM front.passkey_list($1)")
        .bind(cell)
        .fetch_all(db.pool())
        .await?)
}

pub async fn list(db: &Db, cell: Uuid) -> Result<Vec<Passkey>> {
    Ok(listed(db, cell).await?.into_iter().map(|l| l.passkey).collect())
}

/// 등록을 시작해요(로그인한 기기에서만). `origin` 은 요청의 출처예요
pub async fn begin_register(db: &Db, cell: Uuid, origin: &str) -> Result<RegisterOptions> {
    let rp_id = rp_id(origin).ok_or(Error::Invalid("bad_origin"))?;
    let email: Option<String> = sqlx::query_scalar("SELECT front.email_of($1)").bind(cell).fetch_one(db.pool()).await?;
    Ok(RegisterOptions {
        challenge: ask(db, "register", Some(cell)).await?,
        rp_id,
        user_id: URL_SAFE_NO_PAD.encode(cell.as_bytes()),
        user_name: email.unwrap_or_else(|| "CatchUp".to_owned()),
        exclude: listed(db, cell).await?.iter().map(|l| URL_SAFE_NO_PAD.encode(&l.credential)).collect(),
    })
}

pub async fn register(db: &Db, cell: Uuid, origins: &[String], input: &RegisterInput) -> Result<Passkey> {
    const BAD: Error = Error::Invalid("bad_passkey");
    let credential = unb64(&input.credential).filter(|c| (1..=1023).contains(&c.len())).ok_or(BAD)?;
    let (challenge, rp_id) = unb64(&input.client_data).and_then(|json| client(&json, "webauthn.create", origins)).ok_or(BAD)?;
    // 물음부터 써 버려요 — 뒤에서 틀려도 같은 물음을 다시 쓸 수 없어요
    if !answered(db, &challenge, "register", Some(cell)).await? {
        return Err(BAD);
    }
    let data = unb64(&input.authenticator_data).ok_or(BAD)?;
    let seen = device(&data, &rp_id).ok_or(BAD)?;
    let (id, cose) = seen.attested.ok_or(BAD)?;
    let key = unb64(&input.public_key).and_then(|spki| point(&spki, cose)).ok_or(BAD)?;
    if id != credential {
        return Err(BAD);
    }
    let made: Option<Uuid> = sqlx::query_scalar("SELECT front.passkey_add($1, $2, $3, $4, $5)")
        .bind(cell)
        .bind(&credential)
        .bind(key)
        .bind(i64::from(seen.count))
        .bind(label_of(&input.label))
        .fetch_one(db.pool())
        .await?;
    let made = made.ok_or(Error::Conflict("passkey_exists"))?;
    list(db, cell).await?.into_iter().find(|p| p.id == made).ok_or(Error::NotFound)
}

pub async fn remove(db: &Db, cell: Uuid, id: Uuid) -> Result<()> {
    let gone: bool = sqlx::query_scalar("SELECT front.passkey_remove($1, $2)").bind(cell).bind(id).fetch_one(db.pool()).await?;
    if gone { Ok(()) } else { Err(Error::NotFound) }
}

/// 로그인을 시작해요. 누구인지 묻지 않아요 — 기기가 가진 열쇠가 알려 줘요
pub async fn begin_login(db: &Db, origin: &str) -> Result<LoginOptions> {
    let rp_id = rp_id(origin).ok_or(Error::Invalid("bad_origin"))?;
    Ok(LoginOptions { challenge: ask(db, "login", None).await?, rp_id })
}

/// 서명을 확인하고 기기 세션을 만들어요. 돌려주는 것은 세션 토큰이에요. 틀린 까닭은 알려 주지 않아요
pub async fn login(db: &Db, origins: &[String], input: &LoginInput) -> Result<String> {
    const NO: Error = Error::Unauthorized;
    let credential = unb64(&input.credential).ok_or(NO)?;
    let json = unb64(&input.client_data).ok_or(NO)?;
    let (challenge, rp_id) = client(&json, "webauthn.get", origins).ok_or(NO)?;
    if !answered(db, &challenge, "login", None).await? {
        return Err(NO);
    }
    let data = unb64(&input.authenticator_data).ok_or(NO)?;
    let seen = device(&data, &rp_id).ok_or(NO)?;
    let signature = unb64(&input.signature).ok_or(NO)?;
    let found: Option<(Uuid, Vec<u8>, i64)> = sqlx::query_as("SELECT id, public_key, sign_count FROM front.passkey_find($1)")
        .bind(&credential)
        .fetch_optional(db.pool())
        .await?;
    let (id, key, _) = found.ok_or(NO)?;
    // 서명한 것: 장치가 낸 것 || 브라우저가 낸 것의 지문
    let signed = [data.as_slice(), &sha256(&json)].concat();
    UnparsedPublicKey::new(&ECDSA_P256_SHA256_ASN1, &key).verify(&signed, &signature).map_err(|_| NO)?;

    let token = URL_SAFE_NO_PAD.encode(random::<32>()?);
    let cell: Option<Uuid> = sqlx::query_scalar("SELECT front.passkey_login($1, $2, $3, $4)")
        .bind(id)
        .bind(i64::from(seen.count))
        .bind(sha256(token.as_bytes()))
        .bind(label_of(&input.label))
        .fetch_one(db.pool())
        .await?;
    cell.map(|_| token).ok_or(NO)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_bound_address_is_the_host_only() {
        assert_eq!(rp_id("https://app.example.com").as_deref(), Some("app.example.com"));
        assert_eq!(rp_id("https://localhost:8443/x?y").as_deref(), Some("localhost"));
        assert_eq!(rp_id("http://LOCALHOST:5181").as_deref(), Some("localhost"));
        assert_eq!(rp_id("app.example.com"), None);
        assert_eq!(rp_id("https://"), None);
    }

    #[test]
    fn the_browser_part_must_name_this_site_and_this_purpose() {
        let sites = ["https://app.example.com".to_owned()];
        let json = |kind: &str, origin: &str, cross: bool| {
            serde_json::json!({ "type": kind, "challenge": "AQID", "origin": origin, "crossOrigin": cross }).to_string().into_bytes()
        };
        assert_eq!(
            client(&json("webauthn.get", "https://app.example.com", false), "webauthn.get", &sites),
            Some((vec![1, 2, 3], "app.example.com".to_owned()))
        );
        assert!(client(&json("webauthn.create", "https://app.example.com", false), "webauthn.get", &sites).is_none());
        assert!(client(&json("webauthn.get", "https://app.example.com.evil.test", false), "webauthn.get", &sites).is_none());
        assert!(client(&json("webauthn.get", "https://app.example.com", true), "webauthn.get", &sites).is_none());
        assert!(client(b"not json", "webauthn.get", &sites).is_none());
    }

    #[test]
    fn the_device_part_needs_the_right_site_and_a_verified_person() {
        let build = |site: &str, flags: u8, tail: &[u8]| [sha256(site.as_bytes()), vec![flags, 0, 0, 0, 9], tail.to_vec()].concat();
        assert_eq!(device(&build("a.test", 0x05, &[]), "a.test").map(|d| d.count), Some(9));
        assert!(device(&build("a.test", 0x05, &[]), "b.test").is_none(), "다른 주소에 묶인 서명");
        assert!(device(&build("a.test", 0x01, &[]), "a.test").is_none(), "사람을 확인하지 않았어요");
        assert!(device(&build("a.test", 0x04, &[]), "a.test").is_none());
        assert!(device(&[0; 10], "a.test").is_none());
        // 등록: aaguid(16) · 길이(2) · 열쇠 ID · 열쇠
        let tail = [vec![0; 16], vec![0, 2, 7, 8], vec![1, 2, 3]].concat();
        let with_key = build("a.test", 0x45, &tail);
        let seen = device(&with_key, "a.test").unwrap();
        assert_eq!(seen.attested, Some((&[7u8, 8][..], &[1u8, 2, 3][..])));
        assert!(device(&build("a.test", 0x45, &[0; 17]), "a.test").is_none(), "잘린 기록");
    }

    #[test]
    fn the_key_must_match_what_the_device_recorded() {
        let (x, y) = ([1u8; 32], [2u8; 32]);
        let spki = [&SPKI_P256[..], &[4], &x, &y].concat();
        let cose = [&[0xa5, 1, 2, 3, 0x26, 0x20, 1, 0x21, 0x58, 0x20][..], &x, &[0x22, 0x58, 0x20], &y].concat();
        assert_eq!(point(&spki, &cose).map(|p| p.len()), Some(65));
        let other = [&[0xa5, 1, 2, 3, 0x26, 0x20, 1, 0x21, 0x58, 0x20][..], &x, &[0x22, 0x58, 0x20], &[3u8; 32]].concat();
        assert!(point(&spki, &other).is_none());
        assert!(point(&spki[1..], &cose).is_none());
        assert!(point(&[&SPKI_P256[..], &[4], &x].concat(), &cose).is_none());
    }
}
