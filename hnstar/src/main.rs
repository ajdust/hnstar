mod aliases;
mod error_util;

use actix_web::{post, App, HttpResponse, HttpRequest, HttpServer, Responder, web, error};
use aliases::*;
use chrono::{Utc, Duration, DateTime, NaiveDateTime};
use deadpool_postgres::{Manager, ManagerConfig, Pool, RecyclingMethod};
use error_util::WebError;
use std::net::ToSocketAddrs;
use tokio_postgres::NoTls;
use serde::{Deserialize, Serialize};
use postgres_types::ToSql;

pub fn time_to_json(t: NaiveDateTime) -> String {
    DateTime::<Utc>::from_utc(t, Utc).to_rfc3339()
}

mod json_time {
    use super::*;
    use serde::{Serialize, Serializer, Deserialize, Deserializer, de::Error};

    pub fn serialize<S: Serializer>(time: &NaiveDateTime, serializer: S) -> Result<S::Ok, S::Error> {
        time_to_json(time.clone()).serialize(serializer)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<NaiveDateTime, D::Error> {
        let time: &str = Deserialize::deserialize(deserializer)?;
        Ok(DateTime::parse_from_rfc3339(time).map_err(D::Error::custom)?.naive_utc())
    }
}

#[derive(Deserialize, Serialize)]
pub struct UserData {
    #[serde(rename = "userId")]
    pub user_id: i32,
    pub username: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub status: i32,
    #[serde(with = "json_time")]
    pub created: chrono::NaiveDateTime,
    #[serde(with = "json_time")]
    pub updated: chrono::NaiveDateTime,
}

pub struct AuthenticatedConnection {
    pub user: UserData,
    pub conn: PgConn,
}

#[derive(Clone)]
struct AppState {
    pool: PgPool,
    auth_url: String,
    auth_client: reqwest::Client,
}

impl AppState {
    async fn conn(&self) -> Result<PgConn, WebError> {
        Ok(self.pool.get().await?)
    }

    async fn authenticate(&self, req: &HttpRequest, data: &web::Data<AppState>) -> Result<AuthenticatedConnection, WebError> {
        let auth_header = req.headers().get("Authorization")
            .and_then(|h| h.to_str().ok())
            .ok_or(WebError::Unauthorized(String::from("Authorization header missing")))?;
        let auth_req_url = match reqwest::Url::parse(format!("{}/user/get", data.auth_url).as_str()) {
            Ok(auth_req_url) => auth_req_url,
            Err(_) => { return Err(WebError::Invalid(format!("Error parsing authentication URL {}", data.auth_url))); }
        };

        let auth_resp = data.auth_client
            .post(auth_req_url)
            .header(reqwest::header::AUTHORIZATION, auth_header)
            .send().await?
            .json::<UserData>().await?;

        let response: Option<UserData> = Some(auth_resp);
        if let Some(user) = response {
            let conn = self.conn().await?;
            Ok(AuthenticatedConnection { user, conn })
        } else {
            Err(WebError::Unauthorized(String::from("Not authenticated")))
        }
    }
}

#[post("/authenticate/{mode}")]
async fn authenticate(req: HttpRequest, data: web::Data<AppState>, body: web::Bytes, mode: web::Path<String>) -> impl Responder {
    let m = mode.as_str();
    if m == "mirror" {
        let r = body.to_vec();
        let b = String::from_utf8(r).unwrap();
        return HttpResponse::Ok().body(b);
    }

    let response = if m == "sign_in" || m == "sign_up" {
        let auth_req_url = match reqwest::Url::parse(format!("{}/anonymous/{}", data.auth_url, m).as_str()) {
            Ok(auth_req_url) => auth_req_url,
            Err(_) => {
                return WebError::Invalid(format!("Error parsing authentication URL {}", data.auth_url))
                    .to_response();
            }
        };

        let resp = match data.auth_client
            .post(auth_req_url)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body)
            .send().await {
            Ok(resp) => resp,
            Err(err) => { return WebError::from(err).to_response(); }
        };

        Some(resp)
    } else if m == "sign_in_token_refresh" || m == "sign_out" || m == "get" {
        let auth_header = match req.headers().get("Authorization")
            .and_then(|h| h.to_str().ok())
            .ok_or(WebError::Unauthorized(String::from("Authorization header missing"))) {
            Ok(auth_header) => auth_header,
            Err(_) => {
                return HttpResponse::Unauthorized().body("No authorization header found");
            }
        };

        let auth_req_url = match reqwest::Url::parse(format!("{}/user/{}", data.auth_url, m).as_str()) {
            Ok(auth_req_url) => auth_req_url,
            Err(_) => {
                return WebError::Invalid(format!("Error parsing authentication URL {}", data.auth_url))
                    .to_response();
            }
        };

        let resp = match data.auth_client
            .post(auth_req_url)
            .header(reqwest::header::AUTHORIZATION, auth_header)
            .send().await {
            Ok(resp) => resp,
            Err(err) => { return WebError::from(err).to_response(); }
        };

        Some(resp)
    } else {
        None
    };

    if let Some(response) = response {
        let status = response.status();
        return if status == 200 {
            HttpResponse::Ok().body(response.text().await.unwrap())
        } else if status == 401 {
            HttpResponse::Unauthorized().body(response.text().await.unwrap())
        } else if status == 500 {
            HttpResponse::InternalServerError().body(response.text().await.unwrap())
        } else {
            HttpResponse::BadRequest().body(format!("Status: {} = {}", status, response.text().await.unwrap()))
        };
    } else {
        HttpResponse::NotFound().finish()
    }
}

#[derive(Deserialize)]
struct SetStory {
    story_id: i64,
    stars: Option<i32>,
    flags: Option<i32>,
    comment: Option<String>,
}

impl SetStory {
    fn is_valid(&self) -> Result<(), String> {
        let invalid_stars = if let Some(v) = self.stars { v < 0 || v > 10 } else { false };
        let invalid_flags = if let Some(f) = self.flags { f < 0 } else { false };
        if self.story_id <= 0 {
            Err(String::from("Invalid story_id"))
        } else if invalid_stars {
            Err(String::from("Invalid star count"))
        } else if invalid_flags {
            Err(String::from("Invalid flags"))
        } else {
            Ok(())
        }
    }
}

async fn do_set_story_ranking(auth: &mut AuthenticatedConnection, model: &Vec<SetStory>) -> Result<String, WebError> {
    let txn = auth.conn.transaction().await?;
    for set in model.iter() {
        if let Err(err) = set.is_valid() {
            return Err(WebError::Invalid(err));
        }

        // TODO: add clause to verify story_id exists
        let sql = "
                    insert into hnstar.story_user_rank (user_main_id, story_id, stars, flags, comment, created, updated)
                    values ($1, $2, coalesce($3, 0), coalesce($4, 0), coalesce($5, ''), now(), now())
                    on conflict (user_main_id, story_id)
                    do update set
                        stars = coalesce($3, hnstar.story_user_rank.stars),
                        flags = coalesce($4, hnstar.story_user_rank.flags),
                        comment = coalesce($5, hnstar.story_user_rank.comment),
                        updated = now()";
        txn.execute(sql, &[&auth.user.user_id, &set.story_id, &set.stars, &set.flags, &set.comment]).await?;
    }

    Ok(String::from("All good"))
}

#[post("/set")]
async fn set_story_ranking(req: HttpRequest, data: web::Data<AppState>, model: web::Json<Vec<SetStory>>) -> impl Responder {
    let mut auth = match data.authenticate(&req, &data).await {
        Ok(auth) => auth,
        Err(err) => { return err.to_response(); }
    };

    let result = do_set_story_ranking(&mut auth, &model).await;
    match result {
        Ok(json) => HttpResponse::Ok().body(json),
        Err(err) => err.to_response()
    }
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
    #[serde(rename = "pageSize")]
    page_size: Option<i32>,
    #[serde(rename = "pageNumber")]
    page_number: Option<i32>,
    title: Option<PgRegex>,
    url: Option<PgRegex>,
    score: Option<IntFilter>,
    #[serde(rename = "zScore")]
    z_score: Option<FloatFilter>,
    status: Option<i32>,
    flags: Option<i32>,
    stars: Option<IntFilter>,
    comment: Option<PgRegex>,
    sort: Option<Vec<StoryRankingSort>>,
}

#[derive(Serialize)]
struct GetStory {
    #[serde(rename = "storyId")]
    story_id: i64,
    score: i32,
    timestamp: i64,
    title: String,
    url: String,
    status: i32,
    descendants: i32,
    stars: Option<i32>,
    flags: Option<i32>,
    #[serde(rename = "fullCount")]
    full_count: i32,
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
        let full_count = row.get(9);
        GetStory {
            story_id,
            score,
            timestamp,
            title: htmlescape::decode_html(title)
                .map_or_else(|_| String::from(title), |v| v),
            url,
            status,
            descendants,
            stars,
            flags,
            full_count,
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

fn get_query<'a>(model: &StoryRankingFilter, user_id: i32) -> Result<QueryParameters, WebError> {
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
    let from_clause = String::from("
        with stats as (
            select avg(score) mean_score, stddev(score) stddev_score
            from hnstar.story
            where timestamp > $2
        ), scored_stories as (
            select * from hnstar.story, stats
        )
        select s.story_id, s.score, s.timestamp, s.title, s.url
            , s.status, s.descendants, r.stars, r.flags
            , cast(count(*) over() as integer) as full_count
        from scored_stories s
        left join hnstar.story_user_rank r
            on r.story_id = s.story_id and r.user_main_id = $1
    ");

    // where
    let mut parameters: Vec<SqlParameter> = vec![SqlParameter::Int(user_id)];
    let mut where_query: Vec<String> = vec![String::from("")];

    if let Some(gt_ts) = ts.gt {
        parameters.push(SqlParameter::from(gt_ts));
        where_query.push(format!("timestamp > ${}", parameters.len()));
    }

    if let Some(lt_ts) = ts.lt {
        parameters.push(SqlParameter::from(lt_ts));
        where_query.push(format!("timestamp < ${}", parameters.len()));
    }

    // Combine title, comment, and url filters with OR instead of AND
    if model.title.is_some() || model.comment.is_some() || model.url.is_some() {
        let mut sub_where_query: Vec<String> = vec![String::from("")];

        if let Some(title) = model.title.clone() {
            parameters.push(SqlParameter::from(title.regex));
            if title.not {
                sub_where_query.push(format!("title !~* ${}", parameters.len()));
            } else {
                sub_where_query.push(format!("title ~* ${}", parameters.len()));
            }
        }

        if let Some(comment) = model.comment.clone() {
            parameters.push(SqlParameter::from(comment.regex));
            if comment.not {
                sub_where_query.push(format!("comment !~* ${}", parameters.len()));
            } else {
                sub_where_query.push(format!("comment ~* ${}", parameters.len()));
            }
        }

        if let Some(url) = model.url.clone() {
            parameters.push(SqlParameter::from(url.regex));
            if url.not {
                sub_where_query.push(format!("url !~* ${}", parameters.len()));
            } else {
                sub_where_query.push(format!("url ~* ${}", parameters.len()));
            }
        }

        sub_where_query.retain(|v| !v.is_empty());
        let sub_where_clause = format!("({})", sub_where_query.join(" or "));
        where_query.push(sub_where_clause);
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

    where_query.retain(|v| !v.is_empty());
    let where_clause = format!("where {} ", where_query.join(" and "));

    // sorting
    let allowed_sorts = vec!["timestamp", "score", "stars"];
    let mut sort_query: Vec<String> = vec![];
    let default = vec![StoryRankingSort {
        sort: String::from("timestamp"),
        asc: false,
    }];
    let sorts = model.sort.as_ref().map_or(&default, |v| v);
    for sort in sorts.iter() {
        if allowed_sorts.contains(&sort.sort.as_str()) {
            if sort.asc {
                sort_query.push(format!("{} asc", sort.sort));
            } else {
                sort_query.push(format!("{} desc", sort.sort));
            }
        }
    }

    if sort_query.is_empty() {
        sort_query.push(String::from("timestamp desc"));
    }

    let page_size = clamp(model.page_size.map_or(100, |v| v), 1, 500);
    sort_query.push(String::from(format!("limit {}", page_size)));
    let page_number = clamp_min(model.page_number.map_or(0, |v| v), 0);
    sort_query.push(String::from(format!("offset {}", page_number * page_size)));

    let sort_clause = format!("order by {} ", sort_query.join(" "));

    let query = format!("{} \n{} \n{}", from_clause, where_clause, sort_clause);
    #[cfg(feature = "debug")]
        {
            println!("{}", &query);
            println!("{:?}", parameters);
        }
    Ok(QueryParameters { query, parameters })
}

fn clamp_min(i: i32, min: i32) -> i32 {
    if i < min { min } else { i }
}

fn clamp(i: i32, min: i32, max: i32) -> i32 {
    if i > max {
        max
    } else if i < min {
        min
    } else { i }
}

async fn do_get_story_ranking(auth: &mut AuthenticatedConnection, user_id: i32, model: &StoryRankingFilter) -> Result<String, WebError> {
    let query = get_query(model, user_id)?;
    let prep = auth.conn.prepare(&query.query).await?;
    let rows: Vec<tokio_postgres::row::Row> = auth.conn.query(
        &prep,
        &query.parameters.iter()
            .map(|v| v.to_dynamic())
            .collect::<Vec<_>>()).await?;
    let stories: Vec<GetStory> = rows.iter().map(GetStory::from).collect();
    Ok(serde_json::to_string(&stories)?)
}

#[post("/query")]
async fn get_story_ranking(req: HttpRequest, data: web::Data<AppState>, model: web::Json<StoryRankingFilter>) -> impl Responder {
    let mut auth = match data.authenticate(&req, &data).await {
        Ok(auth) => auth,
        Err(_) => {
            let conn = data.conn().await;
            match conn {
                Ok(conn) => AuthenticatedConnection {
                    conn,
                    user: UserData {
                        status: 0,
                        user_id: -1,
                        username: String::from("default"),
                        email: None,
                        name: None,
                        created: chrono::Utc::now().naive_utc(),
                        updated: chrono::Utc::now().naive_utc(),
                    },
                },
                Err(err) => {
                    return err.to_response();
                }
            }
        }
    };

    let user_id = auth.user.user_id;
    let result = do_get_story_ranking(&mut auth, user_id, &model).await;
    match result {
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

    let secure = if std::env::var("PRIVATE_KEY_FILE").is_ok() ||
        std::env::var("CERTIFICATE_FILE").is_ok() {
        use std::path::{Path};
        let private_key_file = std::env::var("PRIVATE_KEY_FILE")
            .map(|v| Path::new(&v).to_owned())
            .map_or(None, |p| if p.is_file() { Some(p) } else { None });
        if private_key_file.is_none() {
            println!("No PRIVATE_KEY_FILE found");
            return Ok(());
        }

        let certificate_file = std::env::var("CERTIFICATE_FILE")
            .map(|v| Path::new(&v).to_owned())
            .map_or(None, |p| if p.is_file() { Some(p) } else { None });
        if certificate_file.is_none() {
            println!("No CERTIFICATE_FILE found");
            return Ok(());
        }

        let mut tls = openssl::ssl::SslAcceptor::mozilla_intermediate(
            openssl::ssl::SslMethod::tls()).unwrap();
        tls.set_private_key_file(
            Path::new(&private_key_file.unwrap()), openssl::ssl::SslFiletype::PEM).unwrap();
        tls.set_certificate_file(
            Path::new(&certificate_file.unwrap()), openssl::ssl::SslFiletype::PEM).unwrap();
        Some(tls)
    } else {
        None
    };

    let server = HttpServer::new(|| {
        let pg_url = match std::env::var("POSTGRESQL_URL") {
            Ok(pg) => pg,
            Err(e) => {
                println!("Could not find POSTGRESQL_URL as an environment variable");
                panic!(e)
            }
        };

        use std::path::{Path};

        let static_directory = std::env::var("STATIC_DIRECTORY")
            .map(|v| Path::new(&v).to_owned())
            .map_or(None, |p| if p.is_dir() { Some(p) } else { None });

        let config = match pg_url.parse() {
            Ok(config) => config,
            Err(e) => {
                println!("Invalid POSTGRESQL_URL found");
                panic!(e)
            }
        };

        let manager_config = ManagerConfig { recycling_method: RecyclingMethod::Fast };
        let manager = Manager::from_config(config, NoTls, manager_config);
        let pool = Pool::new(manager, 30);

        let auth_url = std::env::var("MINIAUTHURE_URL").ok();
        if auth_url.is_none() {
            panic!("No MINIAUTHURE_URL found")
        }

        let auth_url = String::from(auth_url.unwrap());
        let auth_client = reqwest::ClientBuilder::new()
            .danger_accept_invalid_certs(true)
            .build().unwrap();
        let my_app_state = AppState { pool, auth_url, auth_client };

        let json_cfg = web::JsonConfig::default()
            .error_handler(|err, _req| {
                let err_message = format!("{:?}", &err);
                let bad_req = HttpResponse::BadRequest().body(err_message);
                error::InternalError::from_response(err, bad_req).into()
            });

        let ranks = web::scope("/ranks")
            .service(set_story_ranking)
            .service(get_story_ranking);

        let app = App::new()
            .data(my_app_state.clone())
            .app_data(json_cfg)
            .service(ranks)
            .service(authenticate);

        if let Some(static_directory) = static_directory {
            let path = static_directory.to_str().unwrap();
            app.service(actix_files::Files::new(
                "/", path).index_file("index.html"))
        } else {
            app
        }
    });

    if let Some(tls) = secure {
        server.bind_openssl(addr_port, tls)?
            .run()
            .await
    } else {
        server.bind(addr_port)?
            .run()
            .await
    }
}

