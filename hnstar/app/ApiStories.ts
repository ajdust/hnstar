const API_URL = "/";

export interface Story {
    story_id: number;
    score: number;
    timestamp: number;
    title: string;
    url: string;
    status: number;
    descendants: number | null;
    stars: number | null;
    flags: number | null;
    key: number;
}

export interface IntFilter {
    gt: number | null;
    lt: number | null;
}

export interface BigIntFilter {
    gt: number | null;
    lt: number | null;
}

export interface FloatFilter {
    gt: number | null;
    lt: number | null;
}

export interface StoryRankingSort {
    sort: String;
    asc: boolean;
}

export interface PgRegex {
    regex: String;
    not: boolean;
}

export interface StoryRankingFilter {
    timestamp: BigIntFilter | null;
    page_size: number | null;
    page_number: number | null;
    title: PgRegex | null;
    url: PgRegex | null;
    score: IntFilter | null;
    z_score: FloatFilter | null;
    status: number | null;
    flags: number | null;
    stars: IntFilter | null;
    comment: PgRegex | null;
    sort: (StoryRankingSort | null)[];
}

export function getStoriesRequest(filter: StoryRankingFilter): Request {
    return new Request(API_URL + "ranks/query", {
        method: "POST",
        body: JSON.stringify(filter),
        headers: {
            "Content-Type": "application/json",
        },
    });
}
