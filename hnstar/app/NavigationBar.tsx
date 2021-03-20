import * as React from "react";
import {
    Navbar,
    Nav,
    Modal,
    Button,
    Form,
    FormControl,
    Col,
    InputGroup,
    ButtonGroup,
    ToggleButton,
} from "react-bootstrap";
import { ChangeEvent, useState } from "react";
import { StoryRankingFilter, StoryRankingSort } from "./ApiStories";
import { format as dateformat, addMinutes, addMonths, addDays } from "date-fns";
import { DateDisplay, DateRange } from "./AppState";

interface NavigationProps {
    filter: StoryRankingFilter;
    setFilter: (filter: StoryRankingFilter) => void;
    dateDisplay: DateDisplay;
    setDateDisplay: (dateDisplay: DateDisplay) => void;
    dateRange: DateRange;
    setDateRange: (dateRange: DateRange) => void;
    loading: boolean;
}

function NavigationBar(props: NavigationProps) {
    const { filter, setFilter, dateDisplay, setDateDisplay, dateRange, setDateRange, loading } = props;
    // const [showSignIn, setShowSignIn] = useState(false);
    // const handleHideSignIn = () => setShowSignIn(false);
    // const handleShowSignIn = () => setShowSignIn(true);

    const [showFilter, setShowFilter] = useState(false);
    const handleHideFilter = () => setShowFilter(false);
    const handleShowFilter = () => setShowFilter(true);

    const [showSettings, setShowSettings] = useState(false);
    const handleHideSettings = () => setShowSettings(false);
    const handleShowSettings = () => setShowSettings(true);

    const [search, setSearch] = useState(filter.title?.regex || "");

    const [lastCustomDateDisplay, setLastCustomDateDisplay] = useState(
        dateDisplay.of === "custom" ? dateDisplay.value : ""
    );
    const [lastCustomDateRange, setLastCustomDateRange] = useState(
        dateRange.of === "custom" ? dateRange.value : { gt: undefined, lt: undefined }
    );

    const validRegExp = (regex: string) => {
        try {
            return new RegExp(regex) ? true : false;
        } catch {
            return false;
        }
    };
    const getInputNumber = (n: number | undefined): string => (n ? n.toString() : "");
    const getDt = (epoch: number | undefined): string =>
        !epoch ? "" : dateformat(new Date(epoch * 1000), "yyyy-MM-dd");
    const getEpoch = (date: string): number | undefined => {
        if (!date || date.trim() === "") return undefined;
        let dt = new Date(date);
        // undo timezone adaption
        dt = addMinutes(dt, dt.getTimezoneOffset());

        return date.trim() === "" ? undefined : Math.ceil(dt.getTime() / 1000);
    };
    const getDateRangeLabel = (dr: string): string => {
        if (dr === "24-hours") {
            return "24 Hours";
        } else if (dr === "3-days") {
            return "3 Days";
        } else if (dr === "week") {
            return "Week";
        } else if (dr === "month") {
            return "Month";
        } else if (dr === "custom") {
            return "Custom";
        } else {
            return "Unknown";
        }
    };

    const setAdjacentRange = (previous: "previous" | "next") => {
        if (!filter.timestamp || !filter.timestamp.gt) return;
        if (!filter.timestamp.lt) filter.timestamp.lt = getEpoch(addDays(new Date(), 1).toISOString())!;
        const { gt, lt } = filter.timestamp;
        if (dateRange.of !== "month") {
            const distance = (previous === "next" ? 1 : -1) * Math.abs(lt - gt);
            const ts = { gt: gt + distance, lt: lt + distance };
            if (ts.gt > new Date().getTime()) return;
            setLastCustomDateRange({ gt: new Date(ts.gt * 1000), lt: new Date(ts.lt * 1000) });
            setDateRange({ of: "custom", value: { gt: new Date(ts.gt * 1000), lt: new Date(ts.lt * 1000) } });
            setFilter({ ...filter, timestamp: ts });
        } else {
            const [gtDt, ltDt] = [new Date(getDt(gt)), new Date(getDt(lt))];
            const add = previous === "next" ? 1 : -1;
            const [gtDtM, ltDtM] = [addMonths(gtDt, add), addMonths(ltDt, add)];
            if (gtDtM.getTime() > new Date().getTime()) return;
            setLastCustomDateRange({ gt: gtDtM, lt: ltDtM });
            setDateRange({ of: "custom", value: { gt: gtDtM, lt: ltDtM } });
            setFilter({
                ...filter,
                timestamp: {
                    gt: getEpoch(gtDtM.toISOString())!,
                    lt: getEpoch(ltDtM.toISOString())!,
                },
            });
        }
    };

    return (
        <>
            <Navbar bg="light" expand="sm">
                <Navbar.Brand href="#">hnstar</Navbar.Brand>
                <Navbar.Toggle aria-controls="basic-navbar-nav" />
                <Navbar.Collapse id="basic-navbar-nav">
                    <Nav className="mr-auto">
                        {/*<Nav.Link style={{ minWidth: "4rem" }} onClick={handleShowSignIn}>*/}
                        {/*    sign in*/}
                        {/*</Nav.Link>*/}
                        <Nav.Link onClick={handleShowFilter}>filter</Nav.Link>
                        <Nav.Link onClick={handleShowSettings}>settings</Nav.Link>
                    </Nav>

                    <InputGroup className="mr-auto" style={{ maxWidth: "25rem" }}>
                        <FormControl
                            type="text"
                            placeholder="Search"
                            disabled={loading}
                            value={search}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                const value = e.currentTarget.value;
                                setSearch(value);
                                if (value && validRegExp(value)) {
                                    setFilter({
                                        ...filter,
                                        title: { regex: value, not: false },
                                        url: { regex: value, not: false },
                                    });
                                } else {
                                    setFilter({
                                        ...filter,
                                        title: undefined,
                                        url: undefined,
                                    });
                                }
                            }}
                        />
                        <InputGroup.Append>
                            <Button type="button" variant="outline-success">
                                Search
                            </Button>
                        </InputGroup.Append>
                    </InputGroup>
                </Navbar.Collapse>
            </Navbar>
            {/*<Modal show={showSignIn} onHide={handleHideSignIn}>*/}
            {/*    <Modal.Body>*/}
            {/*        <Form.Group controlId="formBasicEmail">*/}
            {/*            <Form.Label>Username</Form.Label>*/}
            {/*            <Form.Control type="email" placeholder="Enter email" />*/}
            {/*        </Form.Group>*/}

            {/*        <Form.Group controlId="formBasicPassword">*/}
            {/*            <Form.Label>Password</Form.Label>*/}
            {/*            <Form.Control type="password" placeholder="Password" />*/}
            {/*        </Form.Group>*/}
            {/*        <Form.Group controlId="formBasicCheckbox">*/}
            {/*            <Form.Check type="checkbox" label="Remember me" checked />*/}
            {/*        </Form.Group>*/}
            {/*    </Modal.Body>*/}
            {/*    <Modal.Footer>*/}
            {/*        <Button variant="secondary" onClick={handleHideSignIn}>*/}
            {/*            Close*/}
            {/*        </Button>*/}
            {/*        <Button variant="primary" onClick={handleHideSignIn}>*/}
            {/*            Sign In*/}
            {/*        </Button>*/}
            {/*    </Modal.Footer>*/}
            {/*</Modal>*/}
            <Modal show={showFilter} onHide={handleHideFilter}>
                <Modal.Body>
                    <Form.Group controlId="filterTimestamp">
                        <Form.Row>
                            <Col>
                                <Form.Label>Since</Form.Label>
                                <Form.Control
                                    type="date"
                                    disabled={loading || dateRange.of !== "custom"}
                                    value={getDt(filter.timestamp?.gt)}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                        const value = getEpoch(e.currentTarget.value);
                                        if (value) {
                                            setLastCustomDateRange({
                                                ...lastCustomDateRange,
                                                gt: new Date(value * 1000),
                                            });
                                            setFilter({
                                                ...filter,
                                                timestamp: { ...filter.timestamp, gt: value },
                                            });
                                        } else {
                                            setLastCustomDateRange({ ...lastCustomDateRange, gt: undefined });
                                            setFilter({ ...filter, timestamp: undefined });
                                        }
                                    }}
                                />
                            </Col>
                            <Col>
                                <Form.Label>Until</Form.Label>
                                <Form.Control
                                    type="date"
                                    disabled={loading || dateRange.of !== "custom"}
                                    value={getDt(filter.timestamp?.lt)}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                        const value = getEpoch(e.currentTarget.value);
                                        if (value) {
                                            setLastCustomDateRange({
                                                ...lastCustomDateRange,
                                                lt: new Date(value * 1000),
                                            });
                                            setFilter({
                                                ...filter,
                                                timestamp: { ...filter.timestamp, lt: value },
                                            });
                                        } else {
                                            setLastCustomDateRange({ ...lastCustomDateRange, lt: undefined });
                                            setFilter({ ...filter, timestamp: undefined });
                                        }
                                    }}
                                />
                            </Col>
                        </Form.Row>
                        <Form.Row className="pt-2">
                            <Col>
                                <Button
                                    type="button"
                                    className="mr-1"
                                    variant="light"
                                    onClick={() => setAdjacentRange("previous")}
                                >
                                    &lt;
                                </Button>
                                <Button
                                    type="button"
                                    className="mr-1"
                                    variant="light"
                                    onClick={() => setAdjacentRange("next")}
                                >
                                    &gt;
                                </Button>
                                <ButtonGroup toggle>
                                    {["24-hours", "3-days", "week", "month", "custom"].map((range, idx) => (
                                        <ToggleButton
                                            key={idx}
                                            type="radio"
                                            variant="secondary"
                                            name="radio"
                                            value={range}
                                            checked={dateRange.of === range}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                                const v = e.currentTarget.value;
                                                if (
                                                    v === "24-hours" ||
                                                    v === "3-days" ||
                                                    v === "week" ||
                                                    v === "month"
                                                ) {
                                                    setDateRange({ of: v });
                                                } else if (v === "custom") {
                                                    setDateRange({ of: v, value: lastCustomDateRange });
                                                }
                                            }}
                                        >
                                            {getDateRangeLabel(range)}
                                        </ToggleButton>
                                    ))}
                                </ButtonGroup>
                            </Col>
                        </Form.Row>
                    </Form.Group>
                    <Form.Group controlId="filterScore">
                        <Form.Label>Score and z-Score</Form.Label>
                        <Form.Row>
                            <Col>
                                <Form.Control
                                    type="number"
                                    placeholder="Minimum Score"
                                    disabled={loading}
                                    value={getInputNumber(filter.score?.gt)}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                        let value = parseInt(e.currentTarget.value);
                                        if (value < 0) value = 0;
                                        setFilter({
                                            ...filter,
                                            score: { ...filter.score, gt: value },
                                        });
                                    }}
                                />
                            </Col>
                            <Col>
                                <Form.Control
                                    type="text"
                                    placeholder="Min z-Score (-5.0 to 5.0)"
                                    disabled={loading}
                                    value={
                                        filter.zScore?.gt || filter.zScore?.gt === 0 ? filter.zScore.gt.toString() : ""
                                    }
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                        let value = parseFloat(e.currentTarget.value);
                                        if (isNaN(value)) return;
                                        if (value < -5) value = -5;
                                        else if (value > 5) value = 5;
                                        setFilter({
                                            ...filter,
                                            zScore: { ...filter.zScore, gt: value },
                                        });
                                    }}
                                />
                            </Col>
                        </Form.Row>
                    </Form.Group>
                    <Form.Group controlId="filterTitle">
                        <Form.Row>
                            <Col>
                                <Form.Label>Title (regex)</Form.Label>
                                <Form.Control
                                    type="text"
                                    disabled={loading}
                                    value={filter.title?.regex || ""}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                        let value = e.currentTarget.value;
                                        if (!value || !validRegExp(value)) {
                                            setSearch("");
                                            setFilter({ ...filter, title: undefined });
                                        } else {
                                            setSearch("");
                                            value = value.trim();
                                            setFilter({
                                                ...filter,
                                                title: { regex: value, not: false },
                                            });
                                        }
                                    }}
                                />
                            </Col>
                            <Col>
                                <Form.Label>URL (regex)</Form.Label>
                                <Form.Control
                                    type="text"
                                    disabled={loading}
                                    value={filter.url?.regex || ""}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                        let value = e.currentTarget.value;
                                        if (!value || !validRegExp(value)) {
                                            setSearch("");
                                            setFilter({ ...filter, url: undefined });
                                        } else {
                                            setSearch("");
                                            setFilter({
                                                ...filter,
                                                url: value.trim() ? { regex: value.trim(), not: false } : undefined,
                                            });
                                        }
                                    }}
                                />
                            </Col>
                        </Form.Row>
                    </Form.Group>
                    <Form.Group controlId="filterSort">
                        <Form.Row>
                            <Col>
                                <Form.Label>Order By</Form.Label>
                                <Form.Control
                                    as="select"
                                    custom
                                    disabled={loading}
                                    value={(filter.sort?.length || 0) > 0 ? filter.sort![0].sort : "timestamp"}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                                        const value = e.currentTarget.value;
                                        if (!value) {
                                            if (!filter.sort) return;
                                            setFilter({ ...filter, sort: undefined });
                                            return;
                                        }

                                        if (value === "timestamp" || value === "score" || value === "stars") {
                                            const firstSort = { sort: value, asc: false } as StoryRankingSort;
                                            if (!filter.sort) filter.sort = [firstSort];
                                            else filter.sort[0] = firstSort;
                                            setFilter({
                                                ...filter,
                                            });
                                        }
                                    }}
                                >
                                    <option value={"timestamp"}>Timestamp</option>
                                    <option value={"score"}>Score</option>
                                    <option value={"stars"}>Stars</option>
                                </Form.Control>
                            </Col>
                        </Form.Row>
                    </Form.Group>
                    <Form.Group controlId="filterPage">
                        <Form.Row>
                            <Col>
                                <Form.Label>Page Size</Form.Label>
                                <Form.Control
                                    type="number"
                                    disabled={loading}
                                    value={filter.pageSize}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                        const value = e.currentTarget.value;
                                        let pageSize = parseInt(value) || 100;
                                        if (pageSize <= 1) pageSize = 100;
                                        setFilter({ ...filter, pageSize: pageSize });
                                    }}
                                />
                            </Col>
                            <Col>
                                <Form.Label>Page Number</Form.Label>
                                <Form.Control
                                    type="number"
                                    disabled={loading}
                                    value={filter.pageNumber}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                        const value = e.currentTarget.value;
                                        let pageNumber = parseInt(value) || 0;
                                        if (pageNumber <= 0) pageNumber = 0;
                                        setFilter({ ...filter, pageNumber: pageNumber });
                                    }}
                                />
                            </Col>
                        </Form.Row>
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleHideFilter}>
                        Close
                    </Button>
                </Modal.Footer>
            </Modal>
            <Modal show={showSettings} onHide={handleHideSettings}>
                <Modal.Body>
                    <Form.Group controlId="displayDateAs">
                        <Form.Label>Display Date</Form.Label>
                        <br />
                        <ButtonGroup toggle>
                            <ToggleButton
                                type="radio"
                                variant="secondary"
                                name="radio"
                                value={"distance"}
                                checked={dateDisplay.of === "distance"}
                                onChange={() => setDateDisplay({ of: "distance" })}
                            >
                                Distance
                            </ToggleButton>
                            <ToggleButton
                                type="radio"
                                variant="secondary"
                                name="radio"
                                value={"datetime"}
                                checked={dateDisplay.of === "datetime"}
                                onChange={() => setDateDisplay({ of: "datetime" })}
                            >
                                Date and Time
                            </ToggleButton>
                            <ToggleButton
                                type="radio"
                                variant="secondary"
                                name="radio"
                                value={"date"}
                                checked={dateDisplay.of === "date"}
                                onChange={() => setDateDisplay({ of: "date" })}
                            >
                                Date
                            </ToggleButton>
                            <ToggleButton
                                type="radio"
                                variant="secondary"
                                name="radio"
                                value={"custom"}
                                checked={dateDisplay.of === "custom"}
                                onChange={() =>
                                    setDateDisplay({ of: "custom", value: lastCustomDateDisplay || "yyyy-MM-dd" })
                                }
                            >
                                Custom
                            </ToggleButton>
                        </ButtonGroup>
                        {dateDisplay.of === "custom" && (
                            <Form.Control
                                type="text"
                                placeholder="distance"
                                disabled={loading}
                                className={"mt-1"}
                                value={dateDisplay.value || "yyyy-MM-dd"}
                                onChange={(e: React.FormEvent<HTMLInputElement>) => {
                                    setLastCustomDateDisplay(e.currentTarget.value);
                                    setDateDisplay({ of: "custom", value: e.currentTarget.value });
                                }}
                            />
                        )}
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleHideSettings}>
                        Close
                    </Button>
                </Modal.Footer>
            </Modal>
        </>
    );
}

export default NavigationBar;
