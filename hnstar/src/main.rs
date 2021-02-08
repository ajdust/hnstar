use actix_web::{get, post, App, HttpResponse, HttpRequest, HttpServer, Responder, web, error};
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
use validator::{Validate};
use r2d2_postgres::postgres::types::ToSql;

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

#[derive(Serialize, Deserialize, Validate)]
struct UserProfile {
    name: String,
    #[validate(email)]
    email: String,
}

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

fn verify(jwk_public_key: &JWK, message_signature: &String, message: &String) -> bool {
    let signature_bytes =
        if let Some(b) = base64::decode(&message_signature).ok() {
            b
        } else {
            return false;
        };

    let message_bytes = message.clone().into_bytes();
    let n =
        if let Some(b) = base64::decode_config(&jwk_public_key.n, base64::URL_SAFE).ok() {
            b
        } else {
            return false;
        };
    let e =
        if let Some(b) = base64::decode_config(&jwk_public_key.e, base64::URL_SAFE).ok() {
            b
        } else {
            return false;
        };
    let pk = signature::RsaPublicKeyComponents { n, e };

    let alg = &signature::RSA_PKCS1_2048_8192_SHA512;
    let res = pk.verify(alg, &message_bytes, &signature_bytes);
    res.is_ok()
}

fn is_recent_datetime(dt_str: &String, duration: Duration) -> bool {
    true
    // TODO: enable when basic testing is done
    // if let Some(dt) = chrono::DateTime::parse_from_str(&dt_str, "yyyy-MM-ddTHH-mm-ss").ok() {
    //     let ndt = dt.naive_utc();
    //     let now = chrono::Utc::now().naive_utc();
    //     ndt < now - duration || ndt > now + duration
    // } else {
    //     false
    // }
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
    let pk_sql = "select public_key, user_main_id from hnstar.user_session where token = $1 and expires > now()";
    if let Some(pk_row) = conn.query_opt(pk_sql, &[&model.token])? {
        let jwk: JWK = serde_json::from_str(pk_row.get(0))?;

        // Verify the signature
        let verified = verify(&jwk, &model.signature,
                              &format!("{}{}", model.timestamp, model.token));
        if verified {
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
            model.username.chars().count() > 30 ||
            !is_recent_datetime(&model.timestamp, Duration::minutes(10)) {
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

impl UserProfile {
    fn is_valid(&self) -> Option<WebError> {
        if self.email.chars().count() > 200 {
            return Some(WebError::Invalid(String::from("Email address must be shorter than 200 characters")));
        } else if self.email.chars().count() == 0 {
            return Some(WebError::Invalid(String::from("Email address must be present")));
        } else if self.name.chars().count() == 0 {
            return Some(WebError::Invalid(String::from("Name must be present")));
        } else if self.name.chars().count() > 200 {
            return Some(WebError::Invalid(String::from("Name must be shorter than 200 characters")));
        } else if let Err(val_err) = self.validate() {
            return Some(WebError::Invalid(String::from(format!("{}", val_err))));
        }

        None
    }

    fn update_profile(&self, txn: &mut Transaction, user_id: i32) -> Result<(), WebError> {
        let update_sql = "\
            update hnstar.user_main set email = $2, name = $3\
            where user_main_id = $1";

        txn.execute(update_sql, &[&user_id, &self.email, &self.name])?;
        Ok(())
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

#[post("/change_profile")]
async fn change_profile(req: HttpRequest, data: web::Data<AppState>, model: web::Json<UserProfile>) -> impl Responder {
    match data.authenticate(&req)
        .and_then(|mut auth| {
            if let Some(err) = model.is_valid() {
                return Err(err);
            }

            let mut txn = auth.conn.transaction()?;
            model.update_profile(&mut txn, auth.user.user_id)?;
            txn.commit()?;
            Ok("")
        }) {
        Ok(json) => HttpResponse::Ok().body(json),
        Err(err) => err.to_response()
    }
}

#[post("/story_rankings")]
async fn set_story_ranking() -> impl Responder {
    HttpResponse::Ok().body("Hello world")
}

#[derive(Deserialize, Copy, Clone)]
struct IntFilter {
    gt: Option<i32>,
    lt: Option<i32>,
}

#[derive(Deserialize, Copy, Clone)]
struct BigIntFilter {
    gt: Option<i64>,
    lt: Option<i64>,
}

#[derive(Deserialize, Copy, Clone)]
struct FloatFilter {
    gt: Option<f64>,
    lt: Option<f64>,
}

#[derive(Deserialize, Clone)]
struct StoryRankingSort {
    sort: String,
    asc: bool,
}

#[derive(Deserialize, Clone)]
struct PgRegex {
    regex: String,
    not: bool,
}

#[derive(Deserialize)]
struct StoryRankingFilter {
    timestamp: Option<BigIntFilter>,
    page_size: Option<i32>,
    page_number: Option<i32>,
    title: Option<PgRegex>,
    url: Option<PgRegex>,
    score: Option<IntFilter>,
    z_score: Option<FloatFilter>,
    status: Option<i32>,
    flags: Option<i32>,
    stars: Option<IntFilter>,
    comment: Option<PgRegex>,
    sort: Option<Vec<StoryRankingSort>>,
}

#[derive(Deserialize, Serialize)]
struct GetStory {
    story_id: i64,
    score: i32,
    timestamp: i64,
    title: String,
    url: String,
    status: i32,
    descendants: i32,
    stars: Option<i32>,
    flags: Option<i32>,
}

impl From<&tokio_postgres::row::Row> for GetStory {
    fn from(row: &tokio_postgres::row::Row) -> Self {
        let story_id = row.get(0);
        let score = row.get(1);
        let timestamp = row.get(2);
        let title = row.get(3);
        let url = row.get(4);
        let status = row.get(5);
        let descendants = row.get(6);
        let stars = row.get(7);
        let flags = row.get(8);
        GetStory {
            story_id,
            score,
            timestamp,
            title,
            url,
            status,
            descendants,
            stars,
            flags,
        }
    }
}

#[derive(Debug)]
enum SqlParameter {
    Int(i32),
    BigInt(i64),
    Float(f64),
    Varchar(String),
}

impl From<i64> for SqlParameter { fn from(i: i64) -> Self { SqlParameter::BigInt(i) } }

impl From<i32> for SqlParameter { fn from(i: i32) -> Self { SqlParameter::Int(i) } }

impl From<f64> for SqlParameter { fn from(f: f64) -> Self { SqlParameter::Float(f) } }

impl From<String> for SqlParameter { fn from(s: String) -> Self { SqlParameter::Varchar(s) } }

impl SqlParameter {
    fn to_dynamic(&self) -> &(dyn ToSql + Sync) {
        match self {
            SqlParameter::Int(i) => i as &(dyn ToSql + Sync),
            SqlParameter::BigInt(i) => i as &(dyn ToSql + Sync),
            SqlParameter::Float(f) => f as &(dyn ToSql + Sync),
            SqlParameter::Varchar(v) => v as &(dyn ToSql + Sync),
        }
    }
}

struct QueryParameters {
    query: String,
    parameters: Vec<SqlParameter>,
}

fn get_query<'a>(model: web::Json<StoryRankingFilter>) -> Result<QueryParameters, WebError> {
    let default = BigIntFilter {
        gt: Some((chrono::Utc::now() + Duration::days(-10)).timestamp()),
        lt: None,
    };
    let ts = model.timestamp
        .map_or(default, |v| v);

    if ts.gt.is_none() && ts.lt.is_none() {
        return Err(WebError::Invalid(String::from("Must specify timestamp filter")));
    }

    // from
    let from_clause = String::from("\
        with stats as (
            select avg(score) mean_score, stddev(score) stddev_score
            from hnstar.story
            where timestamp > $1
        ), scored_stories as (
            select * from hnstar.story, stats
        )
        select s.story_id, s.score, s.timestamp, s.title, s.url, s.status, s.descendants, r.stars, r.flags
        from scored_stories s
        left join hnstar.story_user_rank r on r.story_id = s.story_id
    ");
    // TODO: add mandatory user id constraint

    // where
    let mut parameters: Vec<SqlParameter> = vec![];
    let mut where_query: Vec<String> = vec![];

    if let Some(gt_ts) = ts.gt {
        parameters.push(SqlParameter::from(gt_ts));
        where_query.push(format!("timestamp > ${}", parameters.len()));
    }

    if let Some(lt_ts) = ts.lt {
        parameters.push(SqlParameter::from(lt_ts));
        where_query.push(format!("timestamp < ${}", parameters.len()));
    }

    if let Some(title) = model.title.clone() {
        parameters.push(SqlParameter::from(title.regex));
        if title.not {
            where_query.push(format!("title !~* ${}", parameters.len()));
        } else {
            where_query.push(format!("title ~* ${}", parameters.len()));
        }
    }

    if let Some(comment) = model.comment.clone() {
        parameters.push(SqlParameter::from(comment.regex));
        if comment.not {
            where_query.push(format!("comment !~* ${}", parameters.len()));
        } else {
            where_query.push(format!("comment ~* ${}", parameters.len()));
        }
    }

    if let Some(url) = model.url.clone() {
        parameters.push(SqlParameter::from(url.regex));
        if url.not {
            where_query.push(format!("url !~* ${}", parameters.len()));
        } else {
            where_query.push(format!("url ~* ${}", parameters.len()));
        }
    }

    if let Some(score) = &model.score {
        if let Some(gt_score) = score.gt {
            parameters.push(SqlParameter::from(gt_score));
            where_query.push(format!("score > ${}", parameters.len()));
        }

        if let Some(lt_score) = score.lt {
            parameters.push(SqlParameter::from(lt_score));
            where_query.push(format!("score < ${}", parameters.len()));
        }
    }

    // z_score with mean and stddev over timestamp range
    if let Some(z_score) = &model.z_score {
        if let Some(gt_z_score) = z_score.gt {
            parameters.push(SqlParameter::from(gt_z_score));
            where_query.push(format!("((cast(s.score as float) - s.mean_score) / s.stddev_score) >= ${}", parameters.len()));
        }

        if let Some(lt_z_score) = z_score.lt {
            parameters.push(SqlParameter::from(lt_z_score));
            where_query.push(format!("((cast(s.score as float) - s.mean_score) / s.stddev_score) >= ${}", parameters.len()));
        }
    }

    if let Some(stars) = model.stars {
        if let Some(gt_stars) = stars.gt {
            parameters.push(SqlParameter::from(gt_stars));
            where_query.push(format!("stars > ${}", parameters.len()));
        }

        if let Some(lt_stars) = stars.lt {
            parameters.push(SqlParameter::from(lt_stars));
            where_query.push(format!("stars < ${}", parameters.len()));
        }
    }

    if let Some(status) = model.status {
        parameters.push(SqlParameter::from(status));
        where_query.push(format!("status = ${}", parameters.len()));
    }

    if let Some(flags) = model.flags {
        parameters.push(SqlParameter::from(flags));
        where_query.push(format!("flags = ${}", parameters.len()));
    }

    let where_clause = format!("where {} ", where_query.join(" and "));

    // sorting
    let mut sort_query: Vec<String> = vec![];
    let default = vec![StoryRankingSort {
        sort: String::from("timestamp"),
        asc: false,
    }];
    let sorts = model.sort.as_ref().map_or(&default, |v| v);
    for sort in sorts.iter() {
        if sort.asc {
            sort_query.push(format!("{} asc", sort.sort));
        } else {
            sort_query.push(format!("{} desc", sort.sort));
        }
    }

    let page_size = model.page_size.map_or(100, |v| v);
    sort_query.push(String::from(format!("limit {}", page_size)));
    let page_number = model.page_number.map_or(0, |v| v);
    sort_query.push(String::from(format!("offset {}", page_number * page_size)));

    let sort_clause = format!("order by {} ", sort_query.join(" "));

    let query = format!("{} \n{} \n{}", from_clause, where_clause, sort_clause);
    println!("{}", &query);
    println!("{:?}", parameters);
    Ok(QueryParameters { query, parameters })
}

#[get("/story_rankings")]
async fn get_story_ranking(req: HttpRequest, data: web::Data<AppState>, model: web::Json<StoryRankingFilter>) -> impl Responder {
    match data.authenticate(&req)
        .and_then(|mut auth| {
            let query = get_query(model)?;
            let prep = auth.conn.prepare(&query.query)?;
            let rows: Vec<tokio_postgres::row::Row> = auth.conn.query(
                &prep,
                &query.parameters.iter()
                    .map(|v| v.to_dynamic())
                    .collect::<Vec<_>>())?;
            let stories: Vec<GetStory> = rows.iter().map(GetStory::from).collect();
            Ok(serde_json::to_string(&stories)?)
        }) {
        Ok(json) => HttpResponse::Ok().body(json),
        Err(err) => err.to_response()
    }
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

        let json_cfg = web::JsonConfig::default()
            .error_handler(|err, _req| {
                let err_message = format!("{:?}", &err);
                let bad_req = HttpResponse::BadRequest().body(err_message);
                error::InternalError::from_response(err, bad_req).into()
            });

        let auth = web::scope("/auth")
            .service(register)
            .service(sign_in)
            .service(sign_out)
            .service(sign_in_refresh)
            .service(change_password)
            .service(change_profile);

        let ranks = web::scope("/ranks")
            .service(set_story_ranking)
            .service(get_story_ranking);

        let api = web::scope("/api")
            .service(auth)
            .service(ranks);

        App::new()
            .data(my_app_state.clone())
            .app_data(json_cfg)
            .service(index)
            .service(api)
    }).bind(addr_port)?
        .run()
        .await
}

