// Webpack defined variable ENVIRONMENT
// @ts-ignore
const API_URL = ENVIRONMENT && ENVIRONMENT.toLowerCase() === "production" ? "/hnstar/" : "/";

export interface Story {
    storyId: number;
    score: number;
    timestamp: number;
    title: string;
    url: string;
    status: number;
    descendants: number | null;
    stars: number | null;
    flags: number | null;
    key: number;
    fullCount: number;
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
    sort: "timestamp" | "score";
    asc: boolean;
}

export interface PgRegex {
    regex: string;
    not: boolean;
}

export interface StoryRankingFilter {
    timestamp?: BigIntFilter;
    pageSize: number;
    pageNumber: number;
    title?: PgRegex;
    url?: PgRegex;
    score?: IntFilter;
    zScore?: FloatFilter;
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
    if (typeof story.storyId !== "number") return "Invalid story: bad story_id";
    if (typeof story.score !== "number") return "Invalid story: bad score";
    if (typeof story.timestamp !== "number") return "Invalid story: bad timestamp";
    if (typeof story.title !== "string" || !story.title || !story.title.trim()) return "Invalid story: bad title";
    story.key = story.storyId;
    return null;
}

export function validateNumberFilter(filterString: string | undefined): IntFilter | undefined {
    if (!filterString) return undefined;

    try {
        const filter = JSON.parse(filterString);
        const keys = Object.keys(filter);
        if (keys.length <= 2) {
            const lt = filter.lt ? parseInt(filter.lt) : undefined;
            const gt = filter.gt ? parseInt(filter.gt) : undefined;
            return { lt, gt };
        }

        return undefined;
    } catch (e) {
        console.error("Invalid filter", e);
        return undefined;
    }
}

export function validateSorts(sortString: string | undefined): StoryRankingSort[] | undefined {
    if (!sortString) return undefined;

    try {
        const sorts = JSON.parse(sortString);
        if (!sorts.length) {
            return undefined;
        }

        const validSorts = [];
        for (const sort of sorts) {
            const keys = Object.keys(sort);
            if (
                keys.length == 2 &&
                sort.hasOwnProperty("sort") &&
                sort.hasOwnProperty("asc") &&
                (sort.sort === "timestamp" || sort.sort === "score")
            ) {
                validSorts.push(sort);
            }
        }

        return validSorts;
    } catch (e) {
        console.error("Invalid sort", e);
        return undefined;
    }
}
