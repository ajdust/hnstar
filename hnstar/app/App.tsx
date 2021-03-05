import * as React from "react";
import NavigationBar from "./NavigationBar";
import PageContent from "./PageContent";
import { getStoriesRequest, Story, StoryRankingFilter, validateStory } from "./ApiStories";
import { useEffect, useState } from "react";
import { AppState } from "./AppState";

function App() {
    const [appState, setAppState] = useState({
        stories: [],
        dateDisplay: "distance",
        filter: {
            pageSize: 100,
            pageNumber: 0,
        },
    } as AppState);

    const setFilter = (filter: StoryRankingFilter) => setAppState({ ...appState, filter });
    const setPage = (pageSize: number, pageNumber: number) =>
        setAppState({ ...appState, filter: { ...appState.filter, pageSize: pageSize, pageNumber: pageNumber } });
    const setDateDisplay = (dateDisplay: string) => setAppState({ ...appState, dateDisplay });

    useEffect(() => {
        const getStories = async () => {
            const request = getStoriesRequest(appState.filter);
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

            setAppState({ ...appState, stories });
        };

        getStories().then(() => window.scrollTo(0, 0));
    }, [appState.filter]);

    return (
        <div className="App">
            <NavigationBar
                dateDisplay={appState.dateDisplay}
                setDateDisplay={setDateDisplay}
                filter={appState.filter}
                setFilter={setFilter}
            />
            <PageContent
                stories={appState.stories}
                page={{ size: appState.filter.pageSize, number: appState.filter.pageNumber }}
                dateDisplay={appState.dateDisplay}
                setPage={setPage}
            />
        </div>
    );
}

export default App;
