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
    gt?: number;
    lt?: number;
}

export interface BigIntFilter {
    gt?: number;
    lt?: number;
}

export interface FloatFilter {
    gt?: number;
    lt?: number;
}

export interface StoryRankingSort {
    sort: "timestamp" | "score" | "stars";
    asc: boolean;
}

export interface PgRegex {
    regex: String;
    not: boolean;
}

export interface StoryRankingFilter {
    timestamp?: BigIntFilter;
    page_size?: number;
    page_number?: number;
    title?: PgRegex;
    url?: PgRegex;
    score?: IntFilter;
    z_score?: FloatFilter;
    status?: number;
    flags?: number;
    stars?: IntFilter;
    comment?: PgRegex;
    sort?: StoryRankingSort[];
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

export function validateStory(story: Story): string | null {
    if (!story) return "Invalid story: no data";
    if (typeof story.story_id !== "number") return "Invalid story: bad story_id";
    if (typeof story.score !== "number") return "Invalid story: bad score";
    if (typeof story.timestamp !== "number") return "Invalid story: bad timestamp";
    if (typeof story.title !== "string" || !story.title || !story.title.trim()) return "Invalid story: bad title";
    story.key = story.story_id;
    return null;
}
