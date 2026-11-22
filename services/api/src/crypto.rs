//! 칸 키와 비밀값(design.md 13장). 칸 키는 바깥 열쇠로 감싸고, 연결 토큰 · 알림 구독은 칸 키로 암호화해요.
//! 봉투마다 칸 ID 와 쓰임새를 AAD 로 묶어서, 다른 칸 · 다른 자리로 옮겨 붙이면 열리지 않아요.

use ring::{
    aead::{AES_256_GCM, Aad, LessSafeKey, Nonce, UnboundKey},
    digest,
    rand::{SecureRandom, SystemRandom},
};
use uuid::Uuid;

const VERSION: u8 = 1;
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CryptoError {
    Key,
    Random,
    Envelope,
}

impl std::fmt::Display for CryptoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // 무엇을 풀다 실패했는지(값 · 길이)는 적지 않아요
        f.write_str(match self {
            Self::Key => "invalid key",
            Self::Random => "random source failed",
            Self::Envelope => "cannot open sealed value",
        })
    }
}

impl std::error::Error for CryptoError {}

pub struct Key(LessSafeKey);

impl Key {
    pub fn new(bytes: &[u8]) -> Result<Self, CryptoError> {
        UnboundKey::new(&AES_256_GCM, bytes).map(|k| Self(LessSafeKey::new(k))).map_err(|_| CryptoError::Key)
    }

    pub fn from_hex(hex: &str) -> Result<Self, CryptoError> {
        Self::new(&unhex(hex.trim()).ok_or(CryptoError::Key)?)
    }

    fn aad(cell: Uuid, purpose: &str) -> Vec<u8> {
        [&[VERSION][..], cell.as_bytes(), purpose.as_bytes()].concat()
    }

    pub fn seal(&self, cell: Uuid, purpose: &str, plain: &[u8]) -> Result<Vec<u8>, CryptoError> {
        let nonce: [u8; NONCE_LEN] = random()?;
        let mut body = plain.to_vec();
        self.0
            .seal_in_place_append_tag(Nonce::assume_unique_for_key(nonce), Aad::from(Self::aad(cell, purpose)), &mut body)
            .map_err(|_| CryptoError::Envelope)?;
        Ok([&[VERSION][..], &nonce, &body].concat())
    }

    pub fn open(&self, cell: Uuid, purpose: &str, sealed: &[u8]) -> Result<Vec<u8>, CryptoError> {
        if sealed.len() < 1 + NONCE_LEN + TAG_LEN || sealed[0] != VERSION {
            return Err(CryptoError::Envelope);
        }
        let nonce = Nonce::try_assume_unique_for_key(&sealed[1..1 + NONCE_LEN]).map_err(|_| CryptoError::Envelope)?;
        let mut body = sealed[1 + NONCE_LEN..].to_vec();
        let plain = self.0.open_in_place(nonce, Aad::from(Self::aad(cell, purpose)), &mut body).map_err(|_| CryptoError::Envelope)?;
        Ok(plain.to_vec())
    }

    /// 새 칸 키를 만들어 이 열쇠로 감싸요. DB 에는 감싼 것만 둬요
    pub fn new_cell_key(&self, cell: Uuid) -> Result<Vec<u8>, CryptoError> {
        self.seal(cell, "cell-key", &random::<32>()?)
    }

    pub fn cell_key(&self, cell: Uuid, wrapped: &[u8]) -> Result<Key, CryptoError> {
        Key::new(&self.open(cell, "cell-key", wrapped)?)
    }
}

pub fn random<const N: usize>() -> Result<[u8; N], CryptoError> {
    let mut out = [0u8; N];
    SystemRandom::new().fill(&mut out).map_err(|_| CryptoError::Random)?;
    Ok(out)
}

pub fn sha256(bytes: &[u8]) -> Vec<u8> {
    digest::digest(&digest::SHA256, bytes).as_ref().to_vec()
}

pub(crate) fn unhex(s: &str) -> Option<Vec<u8>> {
    if !s.len().is_multiple_of(2) || !s.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn master() -> Key {
        Key::from_hex(&"11".repeat(32)).unwrap()
    }

    #[test]
    fn opens_what_it_sealed() {
        let cell = Uuid::new_v4();
        let sealed = master().seal(cell, "connection:codex", b"token").unwrap();
        assert!(!sealed.windows(5).any(|w| w == b"token"));
        assert_eq!(master().open(cell, "connection:codex", &sealed).unwrap(), b"token");
    }

    #[test]
    fn another_cell_cannot_open() {
        let sealed = master().seal(Uuid::new_v4(), "push", b"x").unwrap();
        assert_eq!(master().open(Uuid::new_v4(), "push", &sealed), Err(CryptoError::Envelope));
    }

    #[test]
    fn another_purpose_cannot_open() {
        let cell = Uuid::new_v4();
        let sealed = master().seal(cell, "push", b"x").unwrap();
        assert_eq!(master().open(cell, "connection:codex", &sealed), Err(CryptoError::Envelope));
    }

    #[test]
    fn tampered_or_short_values_do_not_open() {
        let cell = Uuid::new_v4();
        let mut sealed = master().seal(cell, "push", b"x").unwrap();
        for short in [0, 1, 13, 28] {
            assert_eq!(master().open(cell, "push", &sealed[..short]), Err(CryptoError::Envelope));
        }
        let last = sealed.len() - 1;
        sealed[last] ^= 1;
        assert_eq!(master().open(cell, "push", &sealed), Err(CryptoError::Envelope));
    }

    #[test]
    fn same_value_seals_differently() {
        let cell = Uuid::new_v4();
        assert_ne!(master().seal(cell, "push", b"x").unwrap(), master().seal(cell, "push", b"x").unwrap());
    }

    #[test]
    fn cell_keys_are_separate() {
        let (a, b) = (Uuid::new_v4(), Uuid::new_v4());
        let (wa, wb) = (master().new_cell_key(a).unwrap(), master().new_cell_key(b).unwrap());
        assert!(master().cell_key(b, &wa).is_err());
        let sealed = master().cell_key(a, &wa).unwrap().seal(a, "push", b"x").unwrap();
        assert!(master().cell_key(b, &wb).unwrap().open(a, "push", &sealed).is_err());
    }

    #[test]
    fn bad_master_keys_are_refused() {
        for bad in ["", "11", "zz", "é1"] {
            assert!(Key::from_hex(bad).is_err());
        }
    }
}
