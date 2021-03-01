import * as React from "react";
import "./App.css";
import NavigationBar from "./NavigationBar";
import PageContent from "./PageContent";
import { getStoriesRequest, Story, StoryRankingFilter, validateStory } from "./ApiStories";
import { useEffect, useState } from "react";

let FIRST_RUN = true;

function App() {
    const [stories, setStories] = useState([] as Story[]);
    const [filters, setFilters] = useState({} as StoryRankingFilter);

    useEffect(() => {
        const getStories = async () => {
            const request = getStoriesRequest(filters);
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

            setStories(stories);
        };

        if (FIRST_RUN) {
            getStories();
            FIRST_RUN = false;
        }
    });

    return (
        <div className="App">
            <NavigationBar filters={filters} setFilters={setFilters} />
            <PageContent stories={stories} />
        </div>
    );
}

export default App;
