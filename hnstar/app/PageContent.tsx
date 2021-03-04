import * as React from "react";
import { Story } from "./ApiStories";
import { format as formatDate, formatDistance } from "date-fns";

interface PageContentProps {
    stories: Story[];
    page: { size: number; number: number };
    setPage: (pageSize: number, pageNumber: number) => void;
    dateDisplay: string;
}

function PageContent(props: PageContentProps) {
    const { stories, dateDisplay } = props;
    const hnUrl = (id: number) => `https://news.ycombinator.com/item?id=${id}`;
    const urlSource = (url: string) => {
        try {
            return `(${new URL(url).hostname})`;
        } catch {
            return "";
        }
    };

    if (!stories || stories.length === 0) {
        return <div>No stories found</div>;
    }

    const now = new Date();
    const distance = (ts: number) => {
        const dt = new Date(ts * 1000);
        if (!dateDisplay || dateDisplay === "distance") {
            const dist = formatDistance(dt, now);
            return `${dist} ago`;
        } else if (dateDisplay === "date") {
            if (dt.getFullYear() === now.getFullYear()) {
                return formatDate(dt, "M-dd");
            } else {
                return formatDate(dt, "yyyy-MM-dd");
            }
        } else if (dateDisplay === "datetime") {
            if (dt.getFullYear() === now.getFullYear()) {
                if (dt.getMonth() === now.getMonth() && dt.getDate() === now.getDate()) {
                    return formatDate(dt, "HH:mm");
                } else {
                    return formatDate(dt, "M-dd HH:mm");
                }
            } else {
                return formatDate(dt, "yyyy-MM-dd HH:mm");
            }
        } else {
            try {
                return formatDate(dt, dateDisplay);
            } catch {
                return formatDistance(dt, now);
            }
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
                            <span className="source">
                                {urlSource(story.url)} {distance(story.timestamp)}
                            </span>
                        </a>
                    </div>
                );
            })}
        </div>
    );
}

export default PageContent;
