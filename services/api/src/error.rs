//! 화면에 돌려주는 실패. 안쪽 사정(SQL · 값)은 싣지 않아요.

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};

#[derive(Debug)]
pub enum Error {
    Unauthorized,
    NotFound,
    /// 화면이 본 것과 지금이 달라요. 다시 읽으면 돼요
    Conflict(&'static str),
    Invalid(&'static str),
    /// 위험한 답 — 한 번 더 확인해야 해요
    ConfirmRequired,
    Internal(anyhow::Error),
}

pub type Result<T> = std::result::Result<T, Error>;

impl Error {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Unauthorized => "unauthorized",
            Self::NotFound => "not_found",
            Self::Conflict(code) | Self::Invalid(code) => code,
            Self::ConfirmRequired => "confirm_required",
            Self::Internal(_) => "internal",
        }
    }

    pub fn status(&self) -> StatusCode {
        match self {
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::Invalid(_) => StatusCode::UNPROCESSABLE_ENTITY,
            Self::ConfirmRequired => StatusCode::PRECONDITION_REQUIRED,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.code())
    }
}

impl std::error::Error for Error {}

impl From<sqlx::Error> for Error {
    fn from(e: sqlx::Error) -> Self {
        Self::Internal(e.into())
    }
}

impl From<crate::crypto::CryptoError> for Error {
    fn from(e: crate::crypto::CryptoError) -> Self {
        Self::Internal(e.into())
    }
}

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        if let Self::Internal(cause) = &self {
            tracing::error!(error = %cause, "request failed");
        }
        (self.status(), Json(serde_json::json!({ "error": self.code() }))).into_response()
    }
}
