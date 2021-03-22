import { Story, StoryRankingFilter } from "./ApiStories";
import { addDays, addMonths } from "date-fns";

export type DateRange =
    | { of: "24-hours" }
    | { of: "3-days" }
    | { of: "week" }
    | { of: "month" }
    | { of: "custom"; value: { gt?: number; lt?: number } };

export const DateRange = {
    enumerate: (): DateRange[] => {
        return [{ of: "24-hours" }, { of: "3-days" }, { of: "week" }, { of: "month" }, { of: "custom", value: {} }];
    },

    getDateRangeLabel: (range: DateRange): string => {
        const of = range.of;
        if (of === "24-hours") {
            return "24 Hrs";
        } else if (of === "3-days") {
            return "3 Days";
        } else if (of === "week") {
            return "Week";
        } else if (of === "month") {
            return "Month";
        } else if (of === "custom") {
            return "Other";
        } else {
            return "Unknown";
        }
    },

    getGreaterThan: (range: DateRange): number | undefined => {
        if (range.of === "24-hours") {
            return Math.floor(addDays(new Date(), -1).getTime() / 1000);
        } else if (range.of === "3-days") {
            return Math.floor(addDays(new Date(), -3).getTime() / 1000);
        } else if (range.of === "week") {
            return Math.floor(addDays(new Date(), -7).getTime() / 1000);
        } else if (range.of === "month") {
            return Math.floor(addMonths(new Date(), -1).getTime() / 1000);
        } else if (range.of === "custom") {
            return range.value.gt;
        } else {
            return undefined;
        }
    },

    getAdjacentRange: (step: number, range: DateRange): DateRange => {
        const lt = (range.of === "custom" && range.value.lt) || addDays(new Date(), 1).getTime() / 1000;
        const gt = DateRange.getGreaterThan(range) || DateRange.getGreaterThan({ of: "week" })!;

        if (range.of === "month") {
            const [gtDate, ltDate] = [new Date(lt * 1000), new Date(gt * 1000)];
            const [stepGtDate, stepLtDate] = [addMonths(gtDate, step), addMonths(ltDate, step)];
            if (stepGtDate.getTime() > new Date().getTime()) return range;
            return { of: "custom", value: { gt: stepGtDate.getTime() / 1000, lt: stepLtDate.getTime() / 1000 } };
        } else {
            const distance = step * Math.abs(lt - gt);
            const [newGt, newLt] = [gt + distance, lt + distance];
            if (newGt > new Date().getTime()) return range;
            return { of: "custom", value: { gt: newGt, lt: newLt } };
        }
    },
};

export type DateDisplay = { of: "datetime" } | { of: "date" } | { of: "distance" } | { of: "custom"; value: string };

export const DateDisplay = {
    enumerate: (): DateDisplay[] => {
        return [{ of: "datetime" }, { of: "date" }, { of: "distance" }, { of: "custom", value: "" }];
    },
    getDateDisplayLabel: (display: DateDisplay): string => {
        const of = display.of;
        if (of === "datetime") return "Time";
        else if (of === "date") return "Date";
        else if (of === "distance") return "Distance";
        else if (of === "custom") return "Custom";
        else return "Unknown";
    },
};

export interface AppState {
    loading: boolean;
    filter: StoryRankingFilter;
    dateDisplay: DateDisplay;
    dateRange: DateRange;
    darkTheme: boolean;
    username?: string;
    expires?: Date;
    stories: Story[];
}
