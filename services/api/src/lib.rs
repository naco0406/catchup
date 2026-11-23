//! CatchUp 서버 — 공용 앞단과 사용자 칸 일꾼(design.md 3장).

pub mod assistant;
pub mod auth;
pub mod cards;
pub mod codex;
pub mod connections;
pub mod crypto;
pub mod db;
pub mod error;
pub mod events;
pub mod executor;
pub mod http;
pub mod inbox;
pub mod local;
pub mod memory;
pub mod model;
pub mod ops;
pub mod passkeys;
pub mod promises;
pub mod push;
pub mod vault;
pub mod worker;
