//! 웹 푸시 — 내용은 RFC 8291(aes128gcm), 보낸 쪽 증명은 RFC 8292(VAPID). 암호는 ring 만 써요.
//! 구독 주소는 사용자가 주는 값이라 알려진 푸시 서비스의 https 만 받아요(서버가 안쪽 주소를 부르지 않게).

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD as B64};
use ring::{
    aead, agreement, hkdf,
    rand::SystemRandom,
    signature::{ECDSA_P256_SHA256_FIXED_SIGNING, EcdsaKeyPair, KeyPair},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    crypto::{CryptoError, Key, random, sha256, unhex},
    db::Db,
    error::{Error, Result},
    executor::Task,
    vault,
};

const RECORD: u32 = 4096;
const MAX_PAYLOAD: usize = 3000;
const MAX_DEVICES: i64 = 20;
const MAX_TRIES: i32 = 5;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Subscription {
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

fn allowed_host(host: &str) -> bool {
    matches!(host, "fcm.googleapis.com" | "web.push.apple.com" | "updates.push.services.mozilla.com")
        || host.ends_with(".notify.windows.com")
}

impl Subscription {
    fn parts(&self) -> Result<(reqwest::Url, Vec<u8>, Vec<u8>)> {
        let bad = || Error::Invalid("bad_subscription");
        if self.endpoint.len() > 2048 {
            return Err(bad());
        }
        let url = reqwest::Url::parse(&self.endpoint).map_err(|_| bad())?;
        let plain_https = url.scheme() == "https" && url.port().is_none() && url.username().is_empty() && url.password().is_none();
        if !plain_https || !url.host_str().is_some_and(allowed_host) {
            return Err(bad());
        }
        let key = B64.decode(self.p256dh.trim_end_matches('=')).map_err(|_| bad())?;
        let auth = B64.decode(self.auth.trim_end_matches('=')).map_err(|_| bad())?;
        if key.len() != 65 || key[0] != 4 || auth.len() != 16 {
            return Err(bad());
        }
        Ok((url, key, auth))
    }
}

struct Len(usize);

impl hkdf::KeyType for Len {
    fn len(&self) -> usize {
        self.0
    }
}

fn derive<const N: usize>(salt: &[u8], secret: &[u8], info: &[&[u8]]) -> std::result::Result<[u8; N], CryptoError> {
    let prk = hkdf::Salt::new(hkdf::HKDF_SHA256, salt).extract(secret);
    let mut out = [0u8; N];
    prk.expand(info, Len(N)).and_then(|okm| okm.fill(&mut out)).map_err(|_| CryptoError::Key)?;
    Ok(out)
}

fn encrypt(receiver: &[u8], auth: &[u8], plain: &[u8]) -> std::result::Result<Vec<u8>, CryptoError> {
    if plain.len() > MAX_PAYLOAD {
        return Err(CryptoError::Envelope);
    }
    let rng = SystemRandom::new();
    let private = agreement::EphemeralPrivateKey::generate(&agreement::ECDH_P256, &rng).map_err(|_| CryptoError::Random)?;
    let sender = private.compute_public_key().map_err(|_| CryptoError::Key)?;
    let peer = agreement::UnparsedPublicKey::new(&agreement::ECDH_P256, receiver);
    let shared = agreement::agree_ephemeral(private, &peer, |s| s.to_vec()).map_err(|_| CryptoError::Key)?;

    let salt: [u8; 16] = random()?;
    let ikm: [u8; 32] = derive(auth, &shared, &[b"WebPush: info\0", receiver, sender.as_ref()])?;
    let cek: [u8; 16] = derive(&salt, &ikm, &[b"Content-Encoding: aes128gcm\0"])?;
    let nonce: [u8; 12] = derive(&salt, &ikm, &[b"Content-Encoding: nonce\0"])?;

    let mut record = [plain, &[2u8]].concat();
    let key = aead::LessSafeKey::new(aead::UnboundKey::new(&aead::AES_128_GCM, &cek).map_err(|_| CryptoError::Key)?);
    key.seal_in_place_append_tag(aead::Nonce::assume_unique_for_key(nonce), aead::Aad::empty(), &mut record)
        .map_err(|_| CryptoError::Envelope)?;
    Ok([&salt[..], &RECORD.to_be_bytes(), &[65], sender.as_ref(), &record].concat())
}

pub struct Vapid {
    pair: EcdsaKeyPair,
    contact: String,
}

impl Vapid {
    pub fn new(pkcs8_hex: &str, contact: &str) -> std::result::Result<Self, CryptoError> {
        let der = unhex(pkcs8_hex.trim()).ok_or(CryptoError::Key)?;
        let pair =
            EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &der, &SystemRandom::new()).map_err(|_| CryptoError::Key)?;
        Ok(Self { pair, contact: contact.to_owned() })
    }

    pub fn public_key(&self) -> String {
        B64.encode(self.pair.public_key().as_ref())
    }

    fn authorization(&self, audience: &str) -> std::result::Result<String, CryptoError> {
        let expires = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|_| CryptoError::Key)?.as_secs() + 12 * 60 * 60;
        let header = B64.encode(json!({ "typ": "JWT", "alg": "ES256" }).to_string());
        let claims = B64.encode(json!({ "aud": audience, "exp": expires, "sub": self.contact }).to_string());
        let signing = format!("{header}.{claims}");
        let signature = self.pair.sign(&SystemRandom::new(), signing.as_bytes()).map_err(|_| CryptoError::Key)?;
        Ok(format!("vapid t={signing}.{}, k={}", B64.encode(signature.as_ref()), self.public_key()))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Delivery {
    Sent,
    /// 구독이 없어졌어요. 기기를 지워요
    Gone,
    Retry,
    Refused,
}

pub trait Notifier: Send + Sync + 'static {
    fn deliver<'a>(&'a self, to: &'a Subscription, payload: &'a [u8]) -> Task<'a, Delivery>;
}

pub struct WebPush {
    client: reqwest::Client,
    vapid: Vapid,
}

impl WebPush {
    pub fn new(vapid: Vapid) -> anyhow::Result<Self> {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(10))
            .no_proxy()
            .build()?;
        Ok(Self { client, vapid })
    }
}

impl Notifier for WebPush {
    fn deliver<'a>(&'a self, to: &'a Subscription, payload: &'a [u8]) -> Task<'a, Delivery> {
        Box::pin(async move {
            let Ok((url, key, auth)) = to.parts() else { return Delivery::Gone };
            let Ok(body) = encrypt(&key, &auth, payload) else { return Delivery::Refused };
            let Ok(authorization) = self.vapid.authorization(&url.origin().ascii_serialization()) else { return Delivery::Refused };
            let request = self
                .client
                .post(url)
                .header("authorization", authorization)
                .header("content-encoding", "aes128gcm")
                .header("content-type", "application/octet-stream")
                .header("ttl", "14400")
                .header("urgency", "high")
                .body(body);
            match request.send().await.map(|r| r.status().as_u16()) {
                Ok(200..=299) => Delivery::Sent,
                Ok(404 | 410) => Delivery::Gone,
                Ok(429 | 500..=599) | Err(_) => Delivery::Retry,
                Ok(_) => Delivery::Refused,
            }
        })
    }
}

pub async fn register(db: &Db, master: &Key, cell: Uuid, subscription: &Subscription) -> Result<Uuid> {
    subscription.parts()?;
    let plain = serde_json::to_vec(subscription).map_err(|e| Error::Internal(e.into()))?;
    let mut tx = db.cell_tx(cell).await?;
    let hash = sha256(subscription.endpoint.as_bytes());
    let others: i64 = sqlx::query_scalar("SELECT count(*) FROM catchup.push_devices WHERE endpoint_hash <> $1")
        .bind(&hash)
        .fetch_one(&mut *tx)
        .await?;
    if others >= MAX_DEVICES {
        return Err(Error::Invalid("too_many_devices"));
    }
    let sealed = vault::cell_key(master, &mut tx, cell).await?.seal(cell, "push", &plain)?;
    let id = sqlx::query_scalar(
        "INSERT INTO catchup.push_devices AS d (cell, endpoint_hash, sealed) VALUES ($1, $2, $3)
         ON CONFLICT (cell, endpoint_hash) DO UPDATE SET sealed = EXCLUDED.sealed RETURNING d.id",
    )
    .bind(cell)
    .bind(hash)
    .bind(sealed)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(id)
}

pub async fn unregister(db: &Db, cell: Uuid, id: Uuid) -> Result<()> {
    let mut tx = db.cell_tx(cell).await?;
    if sqlx::query("DELETE FROM catchup.push_devices WHERE id = $1").bind(id).execute(&mut *tx).await?.rows_affected() == 0 {
        return Err(Error::NotFound);
    }
    tx.commit().await?;
    Ok(())
}

#[derive(FromRow)]
struct Job {
    card: Uuid,
    card_version: i32,
    attempts: i32,
}

/// 때가 된 알림 하나. 보낼 것이 없으면 false
pub async fn send_next(db: &Db, master: &Key, notifier: &dyn Notifier, cell: Uuid) -> Result<bool> {
    let mut tx = db.cell_tx(cell).await?;
    let job: Option<Job> = sqlx::query_as(
        "UPDATE catchup.push_jobs j SET attempts = j.attempts + 1, lease_until = now() + interval '5 minutes'
         FROM (SELECT card, card_version FROM catchup.push_jobs
               WHERE finished_at IS NULL AND run_after <= now() AND (lease_until IS NULL OR lease_until <= now())
               ORDER BY run_after LIMIT 1 FOR UPDATE SKIP LOCKED) next
         WHERE j.card = next.card AND j.card_version = next.card_version
         RETURNING j.card, j.card_version, j.attempts",
    )
    .fetch_optional(&mut *tx)
    .await?;
    let Some(job) = job else { return Ok(false) };
    // 그사이 정했으면 알리지 않아요
    let open: Option<(String, String)> =
        sqlx::query_as("SELECT question, risk FROM catchup.decision_cards WHERE id = $1 AND state = 'open'")
            .bind(job.card)
            .fetch_optional(&mut *tx)
            .await?;
    let devices: Vec<(Uuid, Vec<u8>)> = sqlx::query_as("SELECT id, sealed FROM catchup.push_devices").fetch_all(&mut *tx).await?;
    let key = vault::cell_key(master, &mut tx, cell).await?;
    tx.commit().await?;

    let mut gone = Vec::new();
    let mut retry = false;
    if let Some((question, risk)) = open {
        let question: String = question.chars().take(240).collect();
        // 위험한 카드는 알림 단추로 답할 수 없어요
        let payload = json!({ "card": job.card, "question": question, "actions": risk == "low" }).to_string();
        for (id, sealed) in devices {
            let Some(to) = key.open(cell, "push", &sealed).ok().and_then(|p| serde_json::from_slice::<Subscription>(&p).ok()) else {
                gone.push(id);
                continue;
            };
            match notifier.deliver(&to, payload.as_bytes()).await {
                Delivery::Gone => gone.push(id),
                Delivery::Retry => retry = true,
                Delivery::Sent | Delivery::Refused => {}
            }
        }
    }

    let mut tx = db.cell_tx(cell).await?;
    for id in gone {
        sqlx::query("DELETE FROM catchup.push_devices WHERE id = $1").bind(id).execute(&mut *tx).await?;
    }
    let again = retry && job.attempts < MAX_TRIES;
    sqlx::query(
        "UPDATE catchup.push_jobs
         SET lease_until = NULL, finished_at = CASE WHEN $3 THEN NULL ELSE now() END,
             run_after = CASE WHEN $3 THEN now() + make_interval(secs => 30 * power(2, attempts)) ELSE run_after END
         WHERE card = $1 AND card_version = $2 AND attempts = $4",
    )
    .bind(job.card)
    .bind(job.card_version)
    .bind(again)
    .bind(job.attempts)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ring::signature::{ECDSA_P256_SHA256_FIXED, UnparsedPublicKey};

    #[test]
    fn the_browser_can_decrypt() {
        let rng = SystemRandom::new();
        let private = agreement::EphemeralPrivateKey::generate(&agreement::ECDH_P256, &rng).unwrap();
        let public = private.compute_public_key().unwrap().as_ref().to_vec();
        let auth = [7u8; 16];
        let body = encrypt(&public, &auth, b"hello").unwrap();

        let (salt, rest) = body.split_at(16);
        assert_eq!(rest[..4], RECORD.to_be_bytes());
        assert_eq!(rest[4], 65);
        let (sender, record) = rest[5..].split_at(65);
        let peer = agreement::UnparsedPublicKey::new(&agreement::ECDH_P256, sender);
        let shared = agreement::agree_ephemeral(private, &peer, |s| s.to_vec()).unwrap();
        let ikm: [u8; 32] = derive(&auth, &shared, &[b"WebPush: info\0", &public, sender]).unwrap();
        let cek: [u8; 16] = derive(salt, &ikm, &[b"Content-Encoding: aes128gcm\0"]).unwrap();
        let nonce: [u8; 12] = derive(salt, &ikm, &[b"Content-Encoding: nonce\0"]).unwrap();
        let key = aead::LessSafeKey::new(aead::UnboundKey::new(&aead::AES_128_GCM, &cek).unwrap());
        let mut record = record.to_vec();
        let plain = key.open_in_place(aead::Nonce::assume_unique_for_key(nonce), aead::Aad::empty(), &mut record).unwrap();
        assert_eq!(&*plain, b"hello\x02");
    }

    /// RFC 8291 부록 A 의 값 — 우리 열쇠 유도가 표준과 같은지
    #[test]
    fn derivation_matches_the_standard_vector() {
        let d = |s: &str| B64.decode(s).unwrap();
        let shared = d("kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs");
        let auth = d("BTBZMqHH6r4Tts7J_aSIgg");
        let receiver = d("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4");
        let sender = d("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
        let salt = d("DGv6ra1nlYgDCS1FRnbzlw");
        let ikm: [u8; 32] = derive(&auth, &shared, &[b"WebPush: info\0", &receiver, &sender]).unwrap();
        let cek: [u8; 16] = derive(&salt, &ikm, &[b"Content-Encoding: aes128gcm\0"]).unwrap();
        let nonce: [u8; 12] = derive(&salt, &ikm, &[b"Content-Encoding: nonce\0"]).unwrap();
        assert_eq!(B64.encode(ikm), "S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg");
        assert_eq!(B64.encode(cek), "oIhVW04MRdy2XN9CiKLxTg");
        assert_eq!(B64.encode(nonce), "4h_95klXJ5E_qnoN");
    }

    #[test]
    fn vapid_signature_verifies() {
        let der = EcdsaKeyPair::generate_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &SystemRandom::new()).unwrap();
        let hex: String = der.as_ref().iter().map(|b| format!("{b:02x}")).collect();
        let vapid = Vapid::new(&hex, "https://localhost").unwrap();
        let header = vapid.authorization("https://web.push.apple.com").unwrap();
        let token = header.strip_prefix("vapid t=").unwrap().split(',').next().unwrap();
        let (signed, signature) = token.rsplit_once('.').unwrap();
        let public = B64.decode(vapid.public_key()).unwrap();
        UnparsedPublicKey::new(&ECDSA_P256_SHA256_FIXED, public).verify(signed.as_bytes(), &B64.decode(signature).unwrap()).unwrap();
    }

    #[test]
    fn inside_addresses_are_refused() {
        let good = Subscription { endpoint: String::new(), p256dh: B64.encode([4u8; 65]), auth: B64.encode([1u8; 16]) };
        for endpoint in [
            "http://fcm.googleapis.com/x",
            "https://127.0.0.1/x",
            "https://169.254.169.254/latest/meta-data",
            "https://postgres:5432/",
            "https://fcm.googleapis.com:8443/x",
            "https://fcm.googleapis.com@localhost/x",
            "https://fcm.googleapis.com.evil.example/x",
            "https://evilnotify.windows.com/x",
        ] {
            assert!(Subscription { endpoint: endpoint.into(), ..good.clone() }.parts().is_err(), "{endpoint}");
        }
        assert!(Subscription { endpoint: "https://web.push.apple.com/abc".into(), ..good }.parts().is_ok());
    }
}
