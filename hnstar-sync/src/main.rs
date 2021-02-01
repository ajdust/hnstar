use chrono::prelude::*;
use tokio_postgres::{NoTls, Error, Client};
use serde::Deserialize;

#[derive(Deserialize, Debug)]
struct Story {
    by: String,
    #[serde(default)]
    descendants: i32,
    id: i64,
    #[serde(default)]
    kids: Vec<i64>,
    score: i32,
    time: i64,
    title: String,
    #[serde(default)]
    url: String,
    #[serde(rename = "type")]
    type_: String,
}

#[derive(Deserialize, Debug)]
struct Comment {
    by: String,
    id: i64,
    #[serde(default)]
    kids: Vec<i64>,
    parent: i64,
    text: String,
    time: i64,
    #[serde(rename = "type")]
    type_: String,
}

/// SQL to merge stories into table
const MERGE_STORY_SQL: &str = "\
    insert into hnstar.story (story_id, timestamp, by, title, url, descendants, score)
    values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (story_id)
    do update set descendants = $6, score = $7";

async fn merge_top_stores(pg_client: &mut Client, stories: &Vec<Story>) {
    let txn = pg_client.transaction().await.unwrap();
    let sql = txn.prepare(MERGE_STORY_SQL).await.unwrap();
    for story in stories.iter() {
        txn.execute(&sql, &[
            &story.id, &story.time, &story.by, &story.title,
            &story.url, &story.descendants, &story.score]).await.unwrap();
    }
    txn.commit().await.unwrap();
}

async fn get_top_stories() -> Vec<Story> {
    let client = reqwest::ClientBuilder::new().build().unwrap();
    let story_ids = client.get("https://hacker-news.firebaseio.com/v0/topstories.json")
        .send().await.unwrap()
        .json::<Vec<i64>>()
        .await.unwrap();

    let mut stories = Vec::with_capacity(story_ids.len());
    for story_id in story_ids.iter() {
        let url = format!("https://hacker-news.firebaseio.com/v0/item/{}.json", story_id);
        let story = client.get(&url)
            .send().await.unwrap()
            .json::<Story>()
            .await.unwrap();
        stories.push(story);
    }

    stories
}

#[tokio::main]
async fn main() {
    let pg_url = std::env::var("POSTGRESQL_URL").unwrap();

    let (mut client, connection) = tokio_postgres::connect(&pg_url, NoTls).await.unwrap();
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    let top_stories = get_top_stories().await;
    println!("{:?}", top_stories);
    merge_top_stores(&mut client, &top_stories).await;
}
