import * as React from "react";
import { Story } from "./ApiStories";
import { format as formatDate, formatDistance } from "date-fns";
import { Pagination } from "react-bootstrap";
import { DateDisplay } from "./AppState";

interface PageContentProps {
    stories: Story[];
    page: { size: number; number: number };
    setPage: (pageSize: number, pageNumber: number) => void;
    dateDisplay: DateDisplay;
    loading: boolean;
}

function PageContent(props: PageContentProps) {
    const { stories, dateDisplay, page, setPage, loading } = props;
    const hnUrl = (id: number) => `https://news.ycombinator.com/item?id=${id}`;
    const urlSource = (url: string) => {
        try {
            return `(${new URL(url).hostname})`;
        } catch {
            return "";
        }
    };

    const onClickPage = (pageNumber: number) => {
        console.log(pageNumber);
        setPage(page.size, pageNumber);
    };

    if (!stories || stories.length === 0) {
        return <div className="p-4">No stories found</div>;
    }

    const now = new Date();
    const distance = (ts: number) => {
        const dt = new Date(ts * 1000);
        if (!dateDisplay || dateDisplay.of === "distance") {
            const dist = formatDistance(dt, now);
            return `${dist} ago`;
        } else if (dateDisplay.of === "date") {
            if (dt.getFullYear() === now.getFullYear()) {
                return formatDate(dt, "M-dd");
            } else {
                return formatDate(dt, "yyyy-MM-dd");
            }
        } else if (dateDisplay.of === "datetime") {
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
                return formatDate(dt, dateDisplay.value);
            } catch {
                return formatDistance(dt, now);
            }
        }
    };

    // Pagination
    const active = page.number;
    const items = [];
    const pageCount = Math.ceil((stories.length ? stories[0].fullCount : 0) / page.size) - 1;
    if (pageCount > 0 && active >= 4) {
        items.push(
            <Pagination.Item key={0} onClick={() => onClickPage(0)} disabled={loading}>
                &lt;&lt;
            </Pagination.Item>
        );
        items.push(
            <Pagination.Item key={"previous"} onClick={() => onClickPage(active - 1)} disabled={loading}>
                &lt;
            </Pagination.Item>
        );
        for (let number = active - 1; number <= active + 1 && number <= pageCount; number++) {
            items.push(
                <Pagination.Item
                    key={number}
                    active={number === active}
                    onClick={() => onClickPage(number)}
                    disabled={loading}
                >
                    {number}
                </Pagination.Item>
            );
        }
    } else {
        for (let number = 0; number <= 4 && number <= pageCount; number++) {
            items.push(
                <Pagination.Item
                    key={number}
                    active={number === active}
                    onClick={() => onClickPage(number)}
                    disabled={loading}
                >
                    {number}
                </Pagination.Item>
            );
        }
    }

    if (active < pageCount) {
        items.push(
            <Pagination.Item key="next" onClick={() => onClickPage(active + 1)} disabled={loading}>
                &gt;
            </Pagination.Item>
        );
    }

    const pagination = (
        <div className="entry row pl-4 pr-4 mt-3">
            <div className="col-1 pr-1"></div>
            <div className="col-11">
                <Pagination>{items}</Pagination>
            </div>
        </div>
    );

    return (
        <>
            <div id="page" className="container">
                {page.number > 0 && pagination}
                <div className="entries">
                    {stories.map((story) => {
                        return (
                            <div key={story.key} className="entry row pl-4 pr-4">
                                <a
                                    id={`hn-${story.storyId}`}
                                    className="col-1 pr-1 story"
                                    href={hnUrl(story.storyId)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <div className="row">
                                        <div className="comments col">{story.descendants}</div>
                                        <div className="points homepage col pl-0">{story.score}</div>
                                    </div>
                                </a>
                                <a
                                    className="link col-11 story pl-1"
                                    href={story.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <span>{story.title + " "}</span>
                                    <span className="source">
                                        {urlSource(story.url)} {distance(story.timestamp)}
                                    </span>
                                </a>
                            </div>
                        );
                    })}
                </div>
                {pagination}
            </div>
        </>
    );
}

export default PageContent;
