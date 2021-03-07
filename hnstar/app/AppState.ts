import { Story, StoryRankingFilter } from "./ApiStories";

export interface AppState {
    filter: StoryRankingFilter;
    dateDisplay: string;
    dateRange: string;
    username?: string;
    expires?: Date;
    stories: Story[];
}
