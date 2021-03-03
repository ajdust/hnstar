import * as React from "react";
import { Story } from "./ApiStories";

function PageContent(props: { stories: Story[] }) {
    const stories = props.stories;
    const hnUrl = (id: number) => `https://news.ycombinator.com/item?id=${id}`;
    const urlSource = (url: string) => {
        try {
            return `(${new URL(url).hostname})`;
        } catch {
            return "";
        }
    };

    return (
        <div id="page" className="container entries">
            {stories.map((story) => {
                return (
                    <div key={story.key} className="entry row pl-4 pr-4">
                        <a id={`hn-${story.story_id}`} className="col-1 pr-1 story" href={hnUrl(story.story_id)}>
                            <div className="row">
                                <div className="comments col">{story.descendants}</div>
                                <div className="points homepage col pl-0">{story.score}</div>
                            </div>
                        </a>
                        <a className="link col-11 story pl-1" href={story.url}>
                            <span className="ml-1">{story.title + " "}</span>
                            <span className="source">{urlSource(story.url)}</span>
                        </a>
                    </div>
                );
            })}
        </div>
    );
}

export default PageContent;
