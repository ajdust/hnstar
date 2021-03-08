use deadpool_postgres::{ClientWrapper, Pool};

pub type PgConn = deadpool::managed::Object<ClientWrapper, tokio_postgres::error::Error>;
pub type PgPool = Pool;
