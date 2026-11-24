//! 카드 · 선택지 · 실행 내용(design.md 7장). 화면의 TypeScript 타입은 여기서 만든 OpenAPI 로 생성해요.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::types::Json;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Risk {
    #[default]
    Low,
    Money,
    Production,
    Irreversible,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct CodeLine {
    pub t: String,
    pub s: String,
}

/// 파일 하나의 바뀜 — 카드는 파일마다 접고 펼쳐요(design.md 17장 제안 1)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct CodeFile {
    pub file: String,
    pub add: u32,
    pub del: u32,
    pub lines: Vec<CodeLine>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct CodeChange {
    pub file: String,
    pub add: u32,
    pub del: u32,
    pub files: u32,
    /// 모든 파일을 이어 붙인 줄(파일이 여럿이면 경로가 구분 줄로 들어가요). 예전 화면을 위해 남겨요
    pub lines: Vec<CodeLine>,
    /// 파일마다 나눈 것(파일이 둘 이상일 때만). 줄 수 한도는 `lines` 와 같아요
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub parts: Vec<CodeFile>,
}

/// 고르면 일어나는 일 — 선택지마다 하나. 보여 준 글이 곧 실행하는 글이에요
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Effect {
    /// 밖으로 보내요. 보낸 뒤에는 못 거둬들여요
    Send { to: String, text: String },
    /// 기기에서 누르는 순간 복사해요. 밖으로 나가지 않아요
    Copy { to: String, text: String },
    /// 에이전트에게 답을 전해요
    Tell {
        to: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        text: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        code: Option<CodeChange>,
        /// 세션에 돌려줄 값(승인 · 질문의 답)
        #[serde(default, skip_serializing_if = "Option::is_none")]
        reply: Option<Value>,
    },
    /// 밖의 것을 바꿔요
    Change {
        #[serde(default)]
        undo: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        args: Option<Value>,
    },
    /// 기록만 남겨요
    None,
}

impl Effect {
    /// 실행한 뒤에도 되돌릴 수 있나
    pub fn undoable(&self) -> bool {
        matches!(self, Self::Copy { .. } | Self::None | Self::Change { undo: true, .. })
    }

    /// 밖으로 나가는 것이 없어서 기다리지 않아도 되나
    pub fn immediate(&self) -> bool {
        matches!(self, Self::Copy { .. })
    }

    /// 고친 초안을 넣어요. 글이 없는 실행에는 초안을 붙일 수 없어요
    pub fn with_draft(&self, draft: &str) -> Option<Self> {
        let text = draft.to_owned();
        match self.clone() {
            Self::Send { to, .. } => Some(Self::Send { to, text }),
            Self::Copy { to, .. } => Some(Self::Copy { to, text }),
            Self::Tell { to, text: Some(_), code, reply } => Some(Self::Tell { to, text: Some(text), code, reply }),
            _ => None,
        }
    }

    /// '말씀하신 대로' — 추천과 같은 길로 그 말을 보내요. 밖의 것을 바꾸는 일은 말만으로 하지 않아요
    pub fn as_said(&self, said: &str) -> Self {
        let text = said.to_owned();
        match self {
            Self::Send { to, .. } => Self::Send { to: to.clone(), text },
            Self::Copy { to, .. } => Self::Copy { to: to.clone(), text },
            // reply(승인 값)는 옮기지 않아요 — 말이 승인으로 바뀌면 안 돼요
            Self::Tell { to, .. } => Self::Tell { to: to.clone(), text: Some(text), code: None, reply: None },
            Self::Change { .. } | Self::None => Self::None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct CardOption {
    pub label: String,
    #[serde(default)]
    pub detail: String,
    #[serde(default)]
    pub risk: Risk,
    /// 실행하면 처리 기록에 남는 한 줄
    pub done: String,
    pub effect: Effect,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, ToSchema)]
pub struct Turn {
    pub seq: i32,
    pub said: String,
    pub work: Option<String>,
    pub reply: Option<String>,
    #[schema(value_type = Option<Vec<CardOption>>)]
    pub options: Option<Json<Vec<CardOption>>>,
    pub recommended: i32,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow, ToSchema)]
pub struct Card {
    pub id: Uuid,
    pub kind: String,
    #[schema(value_type = Object)]
    pub source: Json<Value>,
    pub question: String,
    #[schema(value_type = Object)]
    pub body: Json<Value>,
    #[schema(value_type = Vec<CardOption>)]
    pub options: Json<Vec<CardOption>>,
    pub recommended: i32,
    pub risk: String,
    pub reply_path: String,
    pub waiting: bool,
    pub due_at: Option<DateTime<Utc>>,
    pub state: String,
    pub snooze_until: Option<DateTime<Utc>>,
    /// 답할 때 그대로 돌려줘요. 그사이 카드가 바뀌었으면 409
    pub version: i32,
    pub created_at: DateTime<Utc>,
    #[sqlx(skip)]
    pub turns: Vec<Turn>,
    /// 같은 사람 · 같은 일에 대해 비서가 기억하는 것(열린 카드에만 붙여요)
    #[sqlx(skip)]
    pub remembered: Vec<crate::memory::Memory>,
}

/// 커넥터와 에이전트가 올리는 새 카드
#[derive(Debug, Clone, Deserialize)]
pub struct NewCard {
    pub dedupe_key: String,
    pub kind: String,
    pub source: Value,
    pub source_ref: String,
    pub source_version: String,
    pub question: String,
    #[serde(default)]
    pub body: Value,
    pub options: Vec<CardOption>,
    #[serde(default)]
    pub recommended: i32,
    #[serde(default)]
    pub risk: Risk,
    pub reply_path: String,
    #[serde(default)]
    pub waiting: bool,
    pub due_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Surface {
    Web,
    Ipad,
    Iphone,
    Notification,
}

impl Surface {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Web => "web",
            Self::Ipad => "ipad",
            Self::Iphone => "iphone",
            Self::Notification => "notification",
        }
    }
}

impl Risk {
    /// 모르는 값은 가장 위험한 쪽으로 읽어요
    pub fn parse(s: &str) -> Self {
        match s {
            "low" => Self::Low,
            "money" => Self::Money,
            "production" => Self::Production,
            _ => Self::Irreversible,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Money => "money",
            Self::Production => "production",
            Self::Irreversible => "irreversible",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct AnswerInput {
    /// 기기가 만드는 열쇠. 같은 요청을 다시 보내도 한 번만 실행돼요
    pub request_key: Uuid,
    pub version: i32,
    #[serde(default)]
    pub turn_seq: i32,
    pub option: i32,
    #[serde(default)]
    pub draft: Option<String>,
    #[serde(default)]
    pub confirmed: bool,
    pub surface: Surface,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow, ToSchema)]
pub struct Receipt {
    pub id: Uuid,
    pub card: Uuid,
    #[schema(value_type = Effect)]
    pub effect: Json<Effect>,
    pub state: String,
    pub undoable: bool,
    pub run_after: DateTime<Utc>,
    /// 서버 시계로 센 남은 시간. 기기 시계가 틀려도 10초는 10초예요
    pub remaining_ms: i64,
    pub error_code: Option<String>,
    pub created_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
}
