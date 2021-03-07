import { Story, StoryRankingFilter } from "./ApiStories";

export interface AppState {
    loading: boolean;
    filter: StoryRankingFilter;
    dateDisplay: string;
    dateRange: string;
    username?: string;
    expires?: Date;
    stories: Story[];
}
