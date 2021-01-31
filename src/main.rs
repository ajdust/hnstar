use actix_web::{get, post, App, HttpResponse, HttpRequest, HttpServer, Responder, web};
use r2d2_postgres::{postgres::NoTls, PostgresConnectionManager};
use serde::{Deserialize, Serialize};
use argonautica::{Hasher, Verifier};
use chrono::{Utc, Duration};
use std::fmt;
use base64::DecodeError;
use ring::{rand, signature};
use std::net::ToSocketAddrs;
use r2d2::PooledConnection;
use r2d2_postgres::postgres::Transaction;

type PgConn = PooledConnection<PostgresConnectionManager<NoTls>>;
type PgPool = r2d2::Pool<PostgresConnectionManager<NoTls>>;

fn gen_session_token() -> String {
    // Generate random session token
    let mut v: [u8; 64] = [0; 64];
    let sr = rand::SystemRandom::new();
    use rand::SecureRandom;
    sr.fill(&mut v).unwrap();
    let token = base64::encode(&v);
    token
}

#[derive(Clone)]
struct AppState {
    pool: PgPool,
    hash_key: String,
}

#[derive(Deserialize)]
struct UsernamePasswordModel {
    username: String,
    password: String,
}

#[derive(Deserialize, Serialize)]
struct JWK
{
    alg: String,
    kty: String,
    e: String,
    n: String,
}

#[derive(Deserialize)]
struct SignInModel {
    username: String,
    password: String,
    timestamp: String,
    public_key: JWK,
    signature: String,
}

#[derive(Deserialize)]
struct SignatureAuthorizationModel {
    token: String,
    timestamp: String,
    signature: String,
}

struct AuthenticatedUser {
    user_id: i32,
    token: String,
}

struct AuthenticatedConnection {
    user: AuthenticatedUser,
    conn: PgConn,
}

#[derive(Serialize)]
struct TokenExpiry { token: String, expires: String }

enum WebError {
    R2D2(r2d2::Error),
    R2D2PG(r2d2_postgres::postgres::Error),
    Argo(argonautica::Error),
    Decode(DecodeError),
    SerdeJson(serde_json::Error),
    Invalid(String),
    Unauthorized(String),
}

impl From<r2d2::Error> for WebError {
    fn from(error: r2d2::Error) -> Self {
        WebError::R2D2(error)
    }
}

impl From<r2d2_postgres::postgres::Error> for WebError {
    fn from(error: r2d2_postgres::postgres::Error) -> Self {
        WebError::R2D2PG(error)
    }
}

impl From<argonautica::Error> for WebError {
    fn from(error: argonautica::Error) -> Self {
        WebError::Argo(error)
    }
}

impl From<DecodeError> for WebError {
    fn from(error: DecodeError) -> Self { WebError::Decode(error) }
}

impl From<serde_json::Error> for WebError {
    fn from(error: serde_json::Error) -> Self { WebError::SerdeJson(error) }
}

impl fmt::Debug for WebError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WebError::R2D2(e) => e.fmt(f),
            WebError::R2D2PG(e) => e.fmt(f),
            WebError::Argo(e) => e.fmt(f),
            WebError::Decode(e) => e.fmt(f),
            WebError::SerdeJson(e) => e.fmt(f),
            WebError::Invalid(e) => e.fmt(f),
            WebError::Unauthorized(e) => e.fmt(f),
        }
    }
}

impl WebError {
    fn to_response(&self) -> HttpResponse {
        match self {
            WebError::Invalid(err) => HttpResponse::BadRequest().body(err),
            WebError::Unauthorized(err) => HttpResponse::Unauthorized().body(err),
            err => HttpResponse::InternalServerError().body(format!("{:?}", err))
        }
    }
}

fn verify(jwk_public_key: &JWK, signature: &String, signature_message: &String) -> bool {
    let signature_bytes =
        if let Some(b) = base64::decode(&signature).ok() { b } else { return false; };

    let signature_message_bytes = signature_message.clone().into_bytes();
    let n =
        if let Some(b) = base64::decode_config(&jwk_public_key.n, base64::URL_SAFE).ok() { b } else { return false; };
    let e =
        if let Some(b) = base64::decode_config(&jwk_public_key.e, base64::URL_SAFE).ok() { b } else { return false; };
    let pk = signature::RsaPublicKeyComponents { n, e };

    let alg = &signature::RSA_PKCS1_2048_8192_SHA512;
    let res = pk.verify(alg, &signature_message_bytes, &signature_bytes);
    res.is_ok()
}

fn is_recent_datetime(dt_str: &String, duration: Duration) -> bool {
    if let Some(dt) = chrono::DateTime::parse_from_str(&dt_str, "yyyy-MM-ddTHH-mm-ss").ok() {
        let ndt = dt.naive_utc();
        let now = chrono::Utc::now().naive_utc();
        ndt < now - duration || ndt > now + duration
    } else {
        false
    }
}

fn try_authenticate(conn: &mut PgConn, req: &HttpRequest) -> Result<AuthenticatedUser, WebError> {
    // Get the header out of the request
    let authorization_header = req.headers().get("Authorization")
        .and_then(|h| h.to_str().ok())
        .ok_or(WebError::Unauthorized(String::from("Authorization header missing")))?;

    // Get the header
    let b64_token = if !authorization_header.starts_with("Signature ") {
        Err(WebError::Unauthorized(String::from("Invalid Authorization header")))
    } else {
        Ok(&authorization_header[10..])
    }?;

    // Parse the header
    let signature_model_json = base64::decode(b64_token)
        .map(|v| String::from_utf8(v))?
        .map_err(|e| WebError::Unauthorized(String::from(e.to_string())))?;
    let model: SignatureAuthorizationModel = serde_json::from_str(&signature_model_json)?;

    // Verify the timestamp is up to date
    if !is_recent_datetime(&model.timestamp, Duration::minutes(10)) {
        return Err(WebError::Unauthorized(String::from("Authorization timestamp out of range")));
    }

    // Get the token from the database
    let pk_sql = "select public_key, user_main_id from user_session where token = $1 and expires > now()";
    if let Some(pk_row) = conn.query_opt(pk_sql, &[&model.token])? {
        let jwk: JWK = serde_json::from_str(pk_row.get(0))?;

        // Verify the signature
        let verified = verify(&jwk, &model.signature,
                              &format!("{}{}", model.timestamp, model.token));
        if !verified {
            let user_id: i32 = pk_row.get(1);
            Ok(AuthenticatedUser { user_id, token: model.token })
        } else {
            Err(WebError::Invalid(String::from("Invalid signature")))
        }
    } else {
        Err(WebError::Unauthorized(String::from("Token not found")))
    }
}

fn try_refresh(conn: &mut PgConn, req: &HttpRequest) -> Result<String, WebError> {
    let auth_user = try_authenticate(conn, &req)?;
    let remove_session_sql = "/\
            update user_session set
                public_key = '',
                expires = if expires < now() then expires else now() end if
            where token = $1
            returning public_key";
    let new_session_sql = "/
            insert into user_session (user_main_id, public_key, token, expires)
            values ($1, $2, $3, $4)";

    let mut txn = conn.transaction()?;
    let pk_maybe = txn.query_one(remove_session_sql, &[&auth_user.token])?;
    let pk: String = pk_maybe.get(0);

    let token = gen_session_token();
    let expires = Utc::now() + Duration::days(30);
    txn.execute(new_session_sql, &[&auth_user.user_id, &pk, &token, &expires.naive_utc()])?;
    txn.commit()?;

    let result = serde_json::to_string(&TokenExpiry { token, expires: expires.format("%+").to_string() })?;
    Ok(result)
}

impl UsernamePasswordModel {
    fn validate(&self) -> Option<WebError> {
        let model = self;
        if model.password.chars().count() > 100 {
            return Some(WebError::Invalid(format!("Given password is too long")));
        } else if model.password.chars().count() < 10 {
            return Some(WebError::Invalid(format!("Given password is too short")));
        } else if model.username.chars().count() < 3 {
            return Some(WebError::Invalid(format!("Given username is too short")));
        } else if model.username.chars().count() > 30 {
            return Some(WebError::Invalid(format!("Given username is too short")));
        }
        None
    }

    fn insert_password(&self, txn: &mut Transaction, user_id: i32, hash_secret: &String) -> Result<(), WebError> {
        let mut hasher = Hasher::default();
        let result = hasher
            .with_password(&self.password)
            .with_secret_key(hash_secret);
        let hash = result.hash()?;
        let auth_sql = "\
            insert into hnstar.user_auth (user_main_id, username, hash)
            values ($1, $2, $3)";

        txn.execute(auth_sql, &[&user_id, &self.username, &hash])?;
        Ok(())
    }

    fn try_register(&self, conn: &mut PgConn, hash_secret: &String) -> Result<i32, WebError> {
        let model = self;
        if let Some(err) = self.validate() {
            return Err(err);
        }

        let taken = {
            conn
                .query_opt("select 1 from hnstar.user_auth au where au.username = $1", &[&model.username])?
                .map_or(false, |_| true)
        };

        if taken {
            return Err(WebError::Invalid(format!("Given username is taken")));
        }

        let mut txn = conn.transaction()?;
        let user_sql = "\
            insert into hnstar.user_main (status)
            values ($1)
            returning user_main_id";
        let id: i32 = txn.query_one(user_sql, &[&1])?.get(0); // TODO: add more information to registration
        model.insert_password(&mut txn, id, hash_secret)?;
        txn.commit()?;
        Ok(id)
    }
}

impl SignInModel {
    fn try_sign_in(&self, conn: &mut PgConn, hash_secret: &String) -> Result<String, WebError> {
        let model = self;
        if model.password.chars().count() > 100 ||
            model.password.chars().count() < 10 ||
            model.username.chars().count() < 3 ||
            model.username.chars().count() > 30 {
            return Err(WebError::Unauthorized(String::from("Invalid credentials")));
        }

        // Verify valid public key (RSA JWK)
        let verified = verify(&model.public_key, &model.signature,
                              &format!("{}{}", &model.timestamp, &model.username));
        if !verified {
            return Err(WebError::Unauthorized(String::from("Invalid signature")));
        }

        // Find the username is the database
        let get_hash_sql = "\
            select au.hash, au.user_main_id from hnstar.user_auth au where au.username = $1";

        let auth = conn.query_opt(get_hash_sql, &[&model.username])?;
        if let Some(existing) = auth {
            let hash: String = existing.get(0);
            let uid: i32 = existing.get(1);

            // Verify password hash matches
            let mut verifier = Verifier::default();
            let is_valid = verifier
                .with_hash(hash)
                .with_password(&model.password)
                .with_secret_key(hash_secret)
                .verify()?;
            if !is_valid {
                return Err(WebError::Unauthorized(String::from("Bad credentials")));
            }

            // Insert a random session token in the database
            let insert_token_sql = "\
                insert into hnstar.user_session (user_main_id, token, public_key, expires)
                values ($1, $2, $3, $4)";
            let mut txn = conn.transaction()?;
            let expires = Utc::now() + Duration::days(30);
            let stored_public_key = serde_json::to_string(&model.public_key)?;
            let token = gen_session_token();
            txn.execute(insert_token_sql, &[&uid, &token, &stored_public_key, &expires.naive_utc()])?;
            txn.commit()?;

            let response = serde_json::to_string(
                &TokenExpiry { token, expires: expires.format("%+").to_string() })?;
            Ok(response)
        } else {
            Err(WebError::Unauthorized(String::from("Invalid credentials")))
        }
    }
}

impl AppState {
    fn conn(&self) -> Result<PgConn, WebError> {
        Ok(self.pool.clone().get()?)
    }

    fn authenticate(&self, req: &HttpRequest) -> Result<AuthenticatedConnection, WebError> {
        self.conn()
            .and_then(|mut c| try_authenticate(&mut c, &req)
                .map(|u| AuthenticatedConnection {
                    user: u,
                    conn: c,
                }))
    }
}

#[get("/")]
async fn index() -> impl Responder {
    HttpResponse::Ok().body("Hello world")
}

#[post("/register")]
async fn register(data: web::Data<AppState>, model: web::Json<UsernamePasswordModel>) -> impl Responder {
    match data.conn()
        .and_then(|mut c| model.try_register(&mut c, &data.hash_key)) {
        Ok(uid) => HttpResponse::Ok().body(format!("{}", uid)),
        Err(error) => error.to_response()
    }
}

#[post("/sign_in")]
async fn sign_in(data: web::Data<AppState>, model: web::Json<SignInModel>) -> impl Responder {
    match data.conn()
        .and_then(|mut c| model.try_sign_in(&mut c, &data.hash_key)) {
        Ok(json) => HttpResponse::Ok().body(json),
        Err(error) => error.to_response()
    }
}

#[post("/sign_out")]
async fn sign_out(req: HttpRequest, data: web::Data<AppState>) -> impl Responder {
    match data.authenticate(&req)
        .and_then(|mut auth|
            auth.conn.execute("update user_session set expires = now(), public_key = '' where token = $1", &[&auth.user.token])
                .map_err(|err| WebError::from(err))) {
        Ok(_) => HttpResponse::Ok().body(""),
        Err(error) => error.to_response()
    }
}

#[post("/sign_in_refresh")]
async fn sign_in_refresh(req: HttpRequest, data: web::Data<AppState>) -> impl Responder {
    match data.conn()
        .and_then(|mut c| try_refresh(&mut c, &req)) {
        Ok(json) => HttpResponse::Ok().body(json),
        Err(err) => err.to_response()
    }
}

#[post("/change_password")]
async fn change_password(req: HttpRequest, data: web::Data<AppState>, model: web::Json<UsernamePasswordModel>) -> impl Responder {
    match data.authenticate(&req)
        .and_then(|mut auth| {
            if let Some(err) = model.validate() {
                return Err(err);
            }

            let mut txn = auth.conn.transaction()?;
            model.insert_password(&mut txn, auth.user.user_id, &data.hash_key)?;
            txn.commit()?;
            Ok("")
        }) {
        Ok(json) => HttpResponse::Ok().body(json),
        Err(err) => err.to_response()
    }
}

#[post("/change_email")]
async fn change_email() -> impl Responder {
    HttpResponse::Ok().body("Hello world")
}

#[post("/change_name")]
async fn change_name() -> impl Responder {
    HttpResponse::Ok().body("Hello world")
}

#[post("/story_rankings")]
async fn set_story_ranking() -> impl Responder {
    HttpResponse::Ok().body("Hello world")
}

#[get("/story_rankings")]
async fn get_story_ranking() -> impl Responder {
    HttpResponse::Ok().body("Hello world")
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let addr_port = match std::env::var("BIND_ADDR_PORT") {
        Ok(bind) => bind.to_socket_addrs().unwrap().next().unwrap(),
        Err(_) => {
            println!("No BIND_ADDR_PORT environment variable, defaulting to localhost:8000");
            String::from("127.0.0.1:8000").to_socket_addrs().unwrap().next().unwrap()
        }
    };

    HttpServer::new(|| {
        let pg_url = match std::env::var("POSTGRESQL_URL") {
            Ok(pg) => pg,
            Err(e) => {
                println!("Could not find POSTGRESQL_URL as an environment variable");
                panic!(e)
            }
        };

        let hash_key = match std::env::var("HASH_KEY") {
            Ok(pg) => pg,
            Err(e) => {
                println!("Could not find HASH_KEY as an environment variable");
                panic!(e)
            }
        };

        let config = match pg_url.parse() {
            Ok(config) => config,
            Err(e) => {
                println!("Invalid POSTGRESQL_URL found");
                panic!(e)
            }
        };

        let manager = PostgresConnectionManager::new(config, NoTls);
        let pool = match r2d2::Pool::new(manager) {
            Ok(pool) => pool,
            Err(e) => {
                println!("Could not make r2d2 connection pool");
                panic!(e)
            }
        };

        let my_app_state = AppState { pool, hash_key };

        let auth = web::scope("/auth")
            .service(register)
            .service(sign_in)
            .service(sign_out)
            .service(sign_in_refresh)
            .service(change_password);

        let profile = web::scope("/profile")
            .service(change_email)
            .service(change_name);

        let ranks = web::scope("/ranks")
            .service(set_story_ranking)
            .service(get_story_ranking);

        let api = web::scope("/api")
            .service(auth)
            .service(profile)
            .service(ranks);

        App::new()
            .data(my_app_state.clone())
            .service(index)
            .service(api)
    }).bind(addr_port)?
        .run()
        .await
}

