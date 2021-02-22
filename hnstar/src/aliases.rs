use deadpool_postgres::{ClientWrapper, Pool, Transaction};

pub type PgConn = deadpool::managed::Object<ClientWrapper, tokio_postgres::error::Error>;
pub type PgPool = Pool;
pub type PgTran<'a> = Transaction<'a>;
