//! Codex 하네스(plan.md 3단계). 판은 0.163.0 으로 고정.
//!
//! 로그인 쪽과 실행 쪽을 갈라요(2026-11-22 실측):
//! - 한 컨테이너에 두면 승인된 명령이 `auth.json` 을 그대로 읽어요.
//! - 그래서 app-server(로그인 · 모델)는 로컬 실행 환경을 아예 갖지 않아요(`include_local = false`).
//!   명령은 비밀이 없는 샌드박스의 exec-server 로만 나가요. 샌드박스가 없으면 실행도 없어요.

pub mod account;
pub mod backoff;
pub mod bridge;
pub mod codehost;
pub mod drafts;
pub mod gateway;
pub mod home;
pub mod hub;
pub mod lanes;
pub mod repo;
pub mod request;
pub mod rpc;
pub mod runner;
pub mod sandbox;
pub mod sessions;
pub mod talk;

pub const VERSION: &str = "0.163.0";
