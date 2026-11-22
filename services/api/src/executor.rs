//! 실제로 보내고 바꾸는 쪽. 커넥터마다 하나씩 구현해요.
//! 규칙: `Action::id` 가 멱등 열쇠예요. 같은 id 로 두 번 불려도 한 번만 일어나야 해요.

use std::{future::Future, pin::Pin};

use serde_json::Value;
use uuid::Uuid;

use crate::model::{CardOption, Effect};

pub type Task<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

#[derive(Debug, Clone)]
pub struct Action {
    pub cell: Uuid,
    pub id: Uuid,
    pub source_ref: String,
    pub source_version: String,
    pub effect: Effect,
    pub reverse: Option<Value>,
}

#[derive(Debug, Clone)]
pub struct Revision {
    pub question: String,
    pub body: Value,
    pub options: Vec<CardOption>,
    pub recommended: i32,
}

/// 실행 바로 앞에서 읽은 원본
#[derive(Debug, Clone)]
pub struct Source {
    pub version: String,
    /// 바뀌었다면 고친 카드
    pub revision: Option<Revision>,
}

#[derive(Debug, Clone)]
pub enum Outcome {
    Done {
        reverse: Option<Value>,
    },
    /// 확실히 일어나지 않았어요
    Failed(&'static str),
    /// 일어났는지 몰라요. 저절로 다시 하지 않아요
    Unknown,
}

#[derive(Debug, Clone)]
pub enum Found {
    Done {
        reverse: Option<Value>,
    },
    NotDone,
    /// 커넥터가 확인할 길이 없어요
    Unknown,
}

pub trait Executor: Send + Sync + 'static {
    fn source<'a>(&'a self, action: &'a Action) -> Task<'a, Result<Source, &'static str>>;
    fn execute<'a>(&'a self, action: &'a Action) -> Task<'a, Outcome>;
    /// 실행하다 죽은 뒤 '어디까지 했는지' 물어요
    fn find<'a>(&'a self, action: &'a Action) -> Task<'a, Found>;
    fn revert<'a>(&'a self, action: &'a Action) -> Task<'a, Outcome>;
}
