use actix_web::HttpResponse;
use std::fmt;

pub enum WebError {
    Tokio(tokio_postgres::Error),
    Pool(deadpool::managed::PoolError<tokio_postgres::Error>),
    SerdeJson(serde_json::Error),
    Invalid(String),
    Unauthorized(String),
}

impl From<serde_json::Error> for WebError {
    fn from(error: serde_json::Error) -> Self { WebError::SerdeJson(error) }
}

impl From<tokio_postgres::Error> for WebError {
    fn from(error: tokio_postgres::Error) -> Self { WebError::Tokio(error) }
}

impl From<deadpool::managed::PoolError<tokio_postgres::Error>> for WebError {
    fn from(error: deadpool::managed::PoolError<tokio_postgres::Error>) -> Self { WebError::Pool(error) }
}

impl fmt::Debug for WebError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WebError::Tokio(e) => e.fmt(f),
            WebError::Pool(e) => e.fmt(f),
            WebError::SerdeJson(e) => e.fmt(f),
            WebError::Invalid(e) => e.fmt(f),
            WebError::Unauthorized(e) => e.fmt(f),
        }
    }
}

impl WebError {
    pub fn to_response(&self) -> HttpResponse {
        match self {
            WebError::Invalid(err) => HttpResponse::BadRequest().body(err),
            WebError::Unauthorized(err) => HttpResponse::Unauthorized().body(err),
            err => HttpResponse::InternalServerError().body(format!("{:?}", err))
        }
    }
}

