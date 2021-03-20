import * as React from "react";
import NavigationBar from "./NavigationBar";
import PageContent from "./PageContent";
import { getStoriesRequest, Story, StoryRankingFilter, validateStory } from "./ApiStories";
import { useEffect, useState } from "react";
import { AppState, DateDisplay, DateRange } from "./AppState";
import { addDays, addMonths } from "date-fns";
import { ProgressBar } from "react-bootstrap";

function getFilterFromUrl(): StoryRankingFilter {
    const sp = new URL(window.location.toString()).searchParams;
    const defaultFilter = {
        pageSize: 100,
        pageNumber: 0,
    };

    const filterJson = sp.get("filter");
    if (!filterJson) {
        return defaultFilter;
    }

    try {
        const filter = JSON.parse(filterJson);

        // enforce defaults
        for (const key of Object.keys(defaultFilter)) {
            if (!filter[key]) {
                // @ts-ignore
                filter[key] = defaultFilter[key];
            }
        }

        return filter;
    } catch (e) {
        return defaultFilter;
    }
}

function setFilterToUrl(filter: StoryRankingFilter) {
    const sp = new URL(window.location.toString()).searchParams;
    sp.set("filter", JSON.stringify(filter));
    window.history.pushState(null, document.title, "?" + sp.toString());
}

interface StickySettings {
    dateDisplay?: DateDisplay;
    dateRange?: DateRange;
    zScore?: string;
    sort?: string;
}

function getStickySettings(): StickySettings {
    try {
        const item = window.localStorage.getItem("sticky");
        if (item) {
            return JSON.parse(item);
        } else {
            return {};
        }
    } catch (e) {
        console.warn("sticky settings reset", e);
        window.localStorage.setItem("sticky", "");
        return {};
    }
}

function setStickySettings(settings: StickySettings) {
    window.localStorage.setItem("sticky", JSON.stringify(settings));
}

function App() {
    const stickySettings = getStickySettings();
    const defaultFilter = getFilterFromUrl();

    // Apply sticky settings to filter if no URL filter is present
    try {
        const sp = new URL(window.location.toString()).searchParams;
        if (!sp.toString()) {
            // TODO: validate the JSON.parse usage
            if (stickySettings.zScore) defaultFilter.zScore = JSON.parse(stickySettings.zScore);
            if (stickySettings.sort) defaultFilter.sort = JSON.parse(stickySettings.sort);
        }
    } catch (e) {
        console.warn(e);
    }

    const [appState, setAppState] = useState({
        stories: [],
        dateDisplay: stickySettings.dateDisplay || "distance",
        dateRange: stickySettings.dateRange || "custom",
        filter: defaultFilter,
        loading: false,
    } as AppState);

    const setFilter = (filter: StoryRankingFilter) => setAppState({ ...appState, filter });
    const setPage = (pageSize: number, pageNumber: number) =>
        setAppState({ ...appState, filter: { ...appState.filter, pageSize: pageSize, pageNumber: pageNumber } });
    const setDateDisplay = (dateDisplay: DateDisplay) => {
        setAppState({ ...appState, dateDisplay });
        const ss = getStickySettings();
        ss.dateDisplay = dateDisplay;
        setStickySettings(ss);
    };
    const setDateRange = (dateRange: DateRange) => {
        const ss = getStickySettings();
        ss.dateRange = dateRange;
        setStickySettings(ss);

        let thenMs = null;
        if (dateRange.of === "24-hours") {
            thenMs = Math.floor(addDays(new Date(), -1).getTime() / 1000);
        } else if (dateRange.of === "3-days") {
            thenMs = Math.floor(addDays(new Date(), -3).getTime() / 1000);
        } else if (dateRange.of === "week") {
            thenMs = Math.floor(addDays(new Date(), -7).getTime() / 1000);
        } else if (dateRange.of === "month") {
            thenMs = Math.floor(addMonths(new Date(), -1).getTime() / 1000);
        } else {
            setAppState({ ...appState, dateRange: dateRange });
            return;
        }

        if (!thenMs) return;
        setAppState({
            ...appState,
            dateRange: dateRange,
            filter: { ...appState.filter, timestamp: { gt: thenMs } },
        });
    };

    useEffect(() => {
        const getStories = async () => {
            const request = getStoriesRequest(appState.filter);
            try {
                const response = await fetch(request);
                if (response.status !== 200) {
                    console.warn(response);
                    return;
                }

                const rawStories = (await response.json()) as Story[];
                const stories: Story[] = [];
                for (const story of rawStories) {
                    const error = validateStory(story);
                    if (error) {
                        console.warn(error, story);
                        return;
                    }

                    stories.push(story);
                }

                setAppState({ ...appState, stories, loading: false });
            } catch (e) {
                console.error(e);
                setAppState({ ...appState, stories: [], loading: false });
            }
        };

        setAppState({ ...appState, loading: true });
        getStories().then(() => {
            window.scrollTo(0, 0);
            // Set filter to URL
            setFilterToUrl(appState.filter);

            // Set sticky filter settings if set
            const ss = getStickySettings();
            if (appState.filter.zScore) {
                ss.zScore = JSON.stringify(appState.filter.zScore);
            }
            if (appState.filter.sort) {
                ss.sort = JSON.stringify(appState.filter.sort);
            }
            setStickySettings(ss);
        });
    }, [appState.filter]);

    return (
        <div className="App">
            <NavigationBar
                dateDisplay={appState.dateDisplay}
                setDateDisplay={setDateDisplay}
                dateRange={appState.dateRange}
                setDateRange={setDateRange}
                filter={appState.filter}
                setFilter={setFilter}
                loading={appState.loading}
            />
            <ProgressBar className={"gray-progress-bar"} animated={appState.loading} now={100} />
            <PageContent
                stories={appState.stories}
                page={{ size: appState.filter.pageSize, number: appState.filter.pageNumber }}
                dateDisplay={appState.dateDisplay}
                setPage={setPage}
                loading={appState.loading}
            />
        </div>
    );
}

export default App;
