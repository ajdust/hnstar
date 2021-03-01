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
            <div className="menu row mr-5">
                <div className="comments col-1">comments</div>
                <div className="points col-1">points</div>
                <div className="col-8"></div>
            </div>
            {stories.map((story) => {
                return (
                    <div key={story.key} className="entry row">
                        <a
                            id={`hn-${story.story_id}`}
                            className="col-1 justify-content-right story"
                            href={hnUrl(story.story_id)}
                        >
                            <div className="row mr-1">
                                <div className="comments col">{story.descendants}</div>
                                <div className="points homepage col">{story.score}</div>
                            </div>
                        </a>
                        <a className="link col-8 story" href={story.url}>
                            {story.title + " "}
                            <span className="source">{urlSource(story.url)}</span>
                        </a>
                    </div>
                );
            })}
        </div>
    );
}

export default PageContent;
