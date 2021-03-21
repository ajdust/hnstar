import { Story, StoryRankingFilter } from "./ApiStories";

export type DateRange =
    | { of: "24-hours" }
    | { of: "3-days" }
    | { of: "week" }
    | { of: "month" }
    | { of: "custom"; value: { gt: number | undefined; lt: number | undefined } };
export type DateDisplay = { of: "datetime" } | { of: "date" } | { of: "distance" } | { of: "custom"; value: string };

export interface AppState {
    loading: boolean;
    filter: StoryRankingFilter;
    dateDisplay: DateDisplay;
    dateRange: DateRange;
    username?: string;
    expires?: Date;
    stories: Story[];
}
