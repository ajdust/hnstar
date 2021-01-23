use actix_web::{get, post, App, HttpResponse, HttpServer, Responder, web};
use r2d2_postgres::{postgres::NoTls, PostgresConnectionManager};
use serde::{Deserialize, Serialize};
use argonautica::{Hasher, Verifier};
use chrono::{Utc, Duration};
use std::fmt;
use base64::DecodeError;
use ring::{rand, signature};
use std::net::ToSocketAddrs;

#[get("/")]
async fn index() -> impl Responder {
    HttpResponse::Ok().body("Hello world")
}

#[derive(Clone)]
struct AppState {
    pool: r2d2::Pool<PostgresConnectionManager<NoTls>>,
    hash_key: String,
}

#[derive(Deserialize)]
struct RegisterModel {
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
    public_key: JWK,
    signature: String,
}

enum WebError {
    R2D2(r2d2::Error),
    R2D2PG(r2d2_postgres::postgres::Error),
    Argo(argonautica::Error),
    Decode(DecodeError),
    SerdeJson(serde_json::Error),
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
        }
    }
}

fn try_register(data: &web::Data<AppState>, model: &web::Json<RegisterModel>) -> Result<HttpResponse, WebError> {
    if model.password.chars().count() > 100 {
        return Ok(HttpResponse::BadRequest().body(format!("Given password is too long")));
    } else if model.password.chars().count() < 10 {
        return Ok(HttpResponse::BadRequest().body(format!("Given password is too short")));
    } else if model.username.chars().count() < 3 {
        return Ok(HttpResponse::BadRequest().body(format!("Given username is too short")));
    } else if model.username.chars().count() > 30 {
        return Ok(HttpResponse::BadRequest().body(format!("Given username is too short")));
    }

    let pool = data.pool.clone();

    let taken = {
        let mut client = pool.get()?;
        client
            .query_opt("select 1 from hnstar.user_auth au where au.username = $1", &[&model.username])?
            .map_or(false, |_| true)
    };

    if taken {
        return Ok(HttpResponse::BadRequest().body(format!("Given username is taken")));
    }

    let mut hasher = Hasher::default();
    let result = hasher
        .with_password(&model.password)
        .with_secret_key(&data.hash_key);
    let hash = result.hash()?;

    let user_sql = "\
            insert into hnstar.user_main (status)
            values ($1)
            returning user_main_id";

    let auth_sql = "\
            insert into hnstar.user_auth (user_main_id, username, hash)
            values ($1, $2, $3)";

    let mut client = pool.get()?;
    let mut txn = client.transaction()?;
    let id: i32 = txn.query_one(user_sql, &[&1])?.get(0); // TODO: use an enum and include more information
    txn.execute(auth_sql, &[&id, &model.username, &hash])?;
    txn.commit()?;
    Ok(HttpResponse::Ok().body(""))
}

#[post("/register")]
async fn register(data: web::Data<AppState>, model: web::Json<RegisterModel>) -> impl Responder {
    match try_register(&data, &model) {
        Ok(result) => {
            result
        }
        Err(error) => {
            HttpResponse::BadRequest().body(format!("Something went wrong: {:?}", error))
        }
    }
}

fn try_sign_in(data: &web::Data<AppState>, model: &web::Json<SignInModel>) -> Result<HttpResponse, WebError> {
    if model.password.chars().count() > 100 ||
        model.password.chars().count() < 10 ||
        model.username.chars().count() < 3 ||
        model.username.chars().count() > 30 {
        return Ok(HttpResponse::Unauthorized().body("Invalid credentials"));
    }

    let get_hash_sql = "\
        select au.hash, au.user_main_id from hnstar.user_auth au where au.username = $1
    ";

    let pool = data.pool.clone();
    let mut client = pool.get()?;
    let auth = client.query_opt(get_hash_sql, &[&model.username])?;
    if let Some(existing) = auth {

        let hash: String = existing.get(0);
        let uid: i32 = existing.get(1);

        // verify password hash matches
        let mut verifier = Verifier::default();
        let is_valid = verifier
            .with_hash(hash)
            .with_password(&model.password)
            .with_secret_key(&data.hash_key)
            .verify()?;
        if !is_valid {
            return Ok(HttpResponse::Unauthorized().body("Bad credentials"));
        }

        // Verify RSA public key JWK given is valid
        let sig_message = format!("{}{}", &model.username, &model.password);
        let signature_message_bytes = sig_message.into_bytes();
        let signature_bytes = base64::decode(&model.signature)?;
        let n = base64::decode_config(&model.public_key.n, base64::URL_SAFE)?;
        let e = base64::decode_config(&model.public_key.e, base64::URL_SAFE)?;
        let pub_key = signature::RsaPublicKeyComponents { n, e };
        let alg = &signature::RSA_PKCS1_2048_8192_SHA512;
        let res = pub_key.verify(alg, &signature_message_bytes, &signature_bytes);
        if !res.is_ok() {
            return Ok(HttpResponse::Unauthorized().body("Invalid signature"));
        }

        // Generate random session token
        let mut v: [u8; 64] = [0; 64];
        let sr = rand::SystemRandom::new();
        use rand::SecureRandom;
        sr.fill(&mut v).unwrap();
        let token = base64::encode(&v);

        // Insert the random session token in the database
        let insert_token_sql = "\
            insert into hnstar.user_session (user_main_id, token, public_key, expires)
            values ($1, $2, $3, $4)
        ";
        let mut txn = client.transaction()?;
        let expires = Utc::now() + Duration::days(30);
        let stored_public_key = serde_json::to_string(&model.public_key)?;
        txn.execute(insert_token_sql, &[&uid, &token, &stored_public_key, &expires.naive_utc()])?;
        txn.commit()?;

        #[derive(Serialize)]
        struct TokenExpiry { token: String, expires: String }
        let response = serde_json::to_string(&TokenExpiry { token, expires: expires.format("%+").to_string() })?;
        Ok(HttpResponse::Ok().body(response))
    } else {
        Ok(HttpResponse::Unauthorized().body("Invalid credentials"))
    }
}

#[post("/sign_in")]
async fn sign_in(data: web::Data<AppState>, model: web::Json<SignInModel>) -> impl Responder {
    match try_sign_in(&data, &model) {
        Ok(result) => {
            result
        }
        Err(error) => {
            HttpResponse::BadRequest().body(format!("Something went wrong: {:?}", error))
        }
    }
}

#[derive(Deserialize)]
struct AuthenticationModel {
    token: String,
    timestamp: String,
    signature: String,
}

#[post("/sign_out")]
async fn sign_out(data: web::Data<AppState>, model: web::Json<AuthenticationModel>) -> impl Responder {
    let pool = data.pool.clone();
    match pool.get() {
        Ok(mut client) => {
            match client.execute("update user_session set expires = now(), public_key = '' where token = $1", &[&model.token]) {
                Ok(_) => HttpResponse::Ok().body(""),
                Err(e) => HttpResponse::InternalServerError().body(format!("{:?}", e))
            }
        },
        Err(e) => {
            HttpResponse::InternalServerError().body(format!("{:?}", e))
        }
    }
}

#[post("/sign_in_refresh")]
async fn sign_in_refresh() -> impl Responder {
    HttpResponse::Ok().body("Hello world")
}

#[post("/change_password")]
async fn change_password() -> impl Responder {
    HttpResponse::Ok().body("Hello world")
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

    let mut addr_port = match std::env::var("BIND_ADDR_PORT") {
        Ok(bind) => bind.to_socket_addrs().unwrap().next().unwrap(),
        Err(e) => {
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
            .service(sign_in)
            .service(register)
            .service(api)
    }).bind(addr_port)?
        .run()
        .await
}

