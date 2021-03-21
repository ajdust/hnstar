import * as React from "react";
import NavigationBar from "./NavigationBar";
import PageContent from "./PageContent";
import { getStoriesRequest, Story, StoryRankingFilter, validateStory } from "./ApiStories";
import { AppState, DateDisplay, DateRange } from "./AppState";
import { ProgressBar } from "react-bootstrap";
import update from "immutability-helper";

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
    darkTheme?: boolean;
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

class App extends React.Component<any, AppState> {
    state: AppState;

    setFilter = (filter: StoryRankingFilter): Promise<void> => {
        const state = { ...this.state, filter };
        return new Promise<void>((resolve, _) => {
            this.setState(state, resolve);
        });
    };

    setPage = (pageSize: number, pageNumber: number): Promise<void> => {
        return new Promise<void>((resolve, _) => {
            this.setState(
                { ...this.state, filter: { ...this.state.filter, pageSize: pageSize, pageNumber: pageNumber } },
                resolve
            );
        });
    };

    setDateDisplay = (dateDisplay: DateDisplay): Promise<void> => {
        const ss = getStickySettings();
        ss.dateDisplay = dateDisplay;
        setStickySettings(ss);
        return new Promise<void>((resolve, _) => {
            this.setState({ ...this.state, dateDisplay }, resolve);
        });
    };

    setDarkTheme = (darkTheme: boolean): Promise<void> => {
        console.log("settting", darkTheme);
        const ss = getStickySettings();
        ss.darkTheme = darkTheme;
        setStickySettings(ss);
        if (darkTheme) {
            // @ts-ignore
            window.DARK_THEME.enable();
        } else {
            // @ts-ignore
            window.DARK_THEME.disable();
        }
        return new Promise<void>((resolve, _) => {
            this.setState({ ...this.state, darkTheme }, resolve);
        });
    };

    setDateRange = (dateRange: DateRange): Promise<void> => {
        const ss = getStickySettings();
        ss.dateRange = dateRange;
        setStickySettings(ss);
        const state = update(this.state, {
            dateRange: { $set: dateRange },
        });
        return new Promise<void>((resolve, _) => {
            this.setState(state, resolve);
        });
    };

    getStories = async () => {
        const request = getStoriesRequest(this.state.filter);
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

            this.setState({ ...this.state, stories, loading: false });
        } catch (e) {
            console.error(e);
            this.setState({ ...this.state, stories: [], loading: false });
        }
    };

    afterGetStories = () => {
        window.scrollTo(0, 0);
        // Set filter to URL
        setFilterToUrl(this.state.filter);

        // Set sticky filter settings if set
        const ss = getStickySettings();
        if (this.state.filter.zScore) {
            ss.zScore = JSON.stringify(this.state.filter.zScore);
        }
        if (this.state.filter.sort) {
            ss.sort = JSON.stringify(this.state.filter.sort);
        }
        setStickySettings(ss);
    };

    constructor(props: any) {
        super(props);
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

        this.state = {
            stories: [],
            dateDisplay: stickySettings.dateDisplay || { of: "distance" },
            dateRange: stickySettings.dateRange || { of: "week" },
            darkTheme: stickySettings.darkTheme || false,
            filter: defaultFilter,
            loading: true,
        };

        if (this.state.darkTheme) {
            // @ts-ignore
            window.DARK_THEME.enable();
        }

        this.getStories().then(this.afterGetStories);
    }

    componentDidUpdate(_: Readonly<any>, prevState: Readonly<AppState>, __?: any) {
        const prev = JSON.stringify(prevState.filter);
        const now = JSON.stringify(this.state.filter);
        if (prev !== now) {
            this.setState({ ...this.state, loading: true });
            this.getStories().then(this.afterGetStories);
        }
    }

    render() {
        return (
            <div className="App">
                <NavigationBar
                    dateDisplay={this.state.dateDisplay}
                    setDateDisplay={this.setDateDisplay}
                    dateRange={this.state.dateRange}
                    setDateRange={this.setDateRange}
                    filter={this.state.filter}
                    setFilter={this.setFilter}
                    loading={this.state.loading}
                    darkTheme={this.state.darkTheme}
                    setDarkTheme={this.setDarkTheme}
                />
                <ProgressBar className={"gray-progress-bar"} animated={this.state.loading} now={100} />
                <PageContent
                    stories={this.state.stories}
                    page={{ size: this.state.filter.pageSize, number: this.state.filter.pageNumber }}
                    dateDisplay={this.state.dateDisplay}
                    setPage={this.setPage}
                    loading={this.state.loading}
                />
            </div>
        );
    }
}

export default App;
