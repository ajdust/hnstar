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
import { ChangeEvent } from "react";
import { StoryRankingFilter, StoryRankingSort } from "./ApiStories";
import { format as dateformat, addMinutes, addMonths, addDays } from "date-fns";
import { DateDisplay, DateRange } from "./AppState";

const validRegExp = (regex: string) => {
    try {
        return new RegExp(regex) ? true : false;
    } catch {
        return false;
    }
};

const getInputNumber = (n: number | undefined): string => (n ? n.toString() : "");

const getDt = (epoch: number | undefined): string => (!epoch ? "" : dateformat(new Date(epoch * 1000), "yyyy-MM-dd"));

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

interface NavigationProps {
    filter: StoryRankingFilter;
    setFilter: (filter: StoryRankingFilter) => Promise<void>;
    dateDisplay: DateDisplay;
    setDateDisplay: (dateDisplay: DateDisplay) => Promise<void>;
    dateRange: DateRange;
    setDateRange: (dateRange: DateRange) => Promise<void>;
    loading: boolean;
}

interface NavigationState {
    showFilter: boolean;
    showSettings: boolean;
    search: string;
    lastCustomDateDisplay: string;
    lastCustomDateRange: { gt: number | undefined; lt: number | undefined };
    copyDateRange: DateRange;
    copyFilter: StoryRankingFilter;
}

class NavigationBar extends React.Component<NavigationProps, NavigationState> {
    handleHideFilter = () => this.setState({ ...this.state, showFilter: false });
    handleShowFilter = () => this.setState({ ...this.state, showFilter: true });
    handleHideSettings = () => this.setState({ ...this.state, showSettings: false });
    handleShowSettings = () => this.setState({ ...this.state, showSettings: true });

    setCopyDateRange = (range: DateRange) => {
        this.setState({ ...this.state, copyDateRange: range });
        let thenMs = undefined;

        if (range.of === "custom") {
            this.setCopyFilter({ ...this.state.copyFilter, timestamp: range.value });
        } else if (range.of === "24-hours") {
            thenMs = Math.floor(addDays(new Date(), -1).getTime() / 1000);
        } else if (range.of === "3-days") {
            thenMs = Math.floor(addDays(new Date(), -3).getTime() / 1000);
        } else if (range.of === "week") {
            thenMs = Math.floor(addDays(new Date(), -7).getTime() / 1000);
        } else if (range.of === "month") {
            thenMs = Math.floor(addMonths(new Date(), -1).getTime() / 1000);
        }

        if (!thenMs) return;
        this.setCopyFilter({ ...this.state.copyFilter, timestamp: { gt: thenMs } });
    };

    setAdjacentRange = (previous: "previous" | "next") => {
        const copyFilter = this.state.copyFilter;
        const copyDateRange = this.state.copyDateRange;
        if (!copyFilter.timestamp || !copyFilter.timestamp.gt) return;
        if (!copyFilter.timestamp.lt) copyFilter.timestamp.lt = getEpoch(addDays(new Date(), 1).toISOString())!;
        const { gt, lt } = copyFilter.timestamp;
        if (copyDateRange.of !== "month") {
            const distance = (previous === "next" ? 1 : -1) * Math.abs(lt - gt);
            const ts = { gt: gt + distance, lt: lt + distance };
            if (ts.gt > new Date().getTime()) return;
            this.setLastCustomDateRange({ gt: ts.gt, lt: ts.lt });
            this.setCopyDateRange({ of: "custom", value: { gt: ts.gt, lt: ts.lt } });
            this.setCopyFilter({ ...copyFilter, timestamp: ts });
        } else {
            const [gtDt, ltDt] = [new Date(getDt(gt)), new Date(getDt(lt))];
            const add = previous === "next" ? 1 : -1;
            const [gtDtM, ltDtM] = [addMonths(gtDt, add), addMonths(ltDt, add)];
            if (gtDtM.getTime() > new Date().getTime()) return;
            this.setLastCustomDateRange({ gt: gtDtM.getTime(), lt: ltDtM.getTime() });
            this.setCopyDateRange({ of: "custom", value: { gt: gtDtM.getTime(), lt: ltDtM.getTime() } });
            this.setCopyFilter({
                ...copyFilter,
                timestamp: {
                    gt: getEpoch(gtDtM.toISOString())!,
                    lt: getEpoch(ltDtM.toISOString())!,
                },
            });
        }
    };

    setSearch = (search: string) => {
        this.setState({ ...this.state, search });
    };

    setCopyFilter = (copyFilter: StoryRankingFilter) => {
        this.setState({ ...this.state, copyFilter });
    };

    setLastCustomDateRange = (range: { gt: number | undefined; lt: number | undefined }) => {
        this.setState({ ...this.state, lastCustomDateRange: range });
    };

    setLastCustomDateDisplay = (display: string) => {
        this.setState({ ...this.state, lastCustomDateDisplay: display });
    };

    setNewFilter = async () => {
        await this.props.setFilter(this.state.copyFilter);
        await this.props.setDateRange(this.state.copyDateRange);
        this.handleHideFilter();
    };

    resetFilter = () => {
        this.setCopyFilter(this.props.filter);
        this.setCopyDateRange(this.props.dateRange);
    };

    constructor(props: NavigationProps) {
        super(props);
        const state: NavigationState = {
            copyDateRange: props.dateRange,
            copyFilter: props.filter,
            lastCustomDateDisplay: props.dateDisplay.of === "custom" ? props.dateDisplay.value : "",
            lastCustomDateRange:
                props.dateRange.of === "custom" ? props.dateRange.value : { gt: undefined, lt: undefined },
            showSettings: false,
            showFilter: false,
            search: "",
        };

        this.state = state;
    }

    render() {
        const state = this.state;
        const props = this.props;
        return (
            <>
                <Navbar bg="light" expand="sm">
                    <Navbar.Brand href="#">har</Navbar.Brand>
                    <Navbar.Toggle aria-controls="basic-navbar-nav" />
                    <Navbar.Collapse id="basic-navbar-nav">
                        <Nav className="mr-auto">
                            {/*<Nav.Link style={{ minWidth: "4rem" }} onClick={handleShowSignIn}>*/}
                            {/*    sign in*/}
                            {/*</Nav.Link>*/}
                            <Nav.Link onClick={this.handleShowFilter}>filter</Nav.Link>
                            <Nav.Link onClick={this.handleShowSettings}>settings</Nav.Link>
                        </Nav>

                        <InputGroup className="mr-auto" style={{ maxWidth: "25rem" }}>
                            <FormControl
                                type="text"
                                placeholder="Search"
                                disabled={props.loading}
                                value={state.search}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                    const value = e.currentTarget.value;
                                    this.setSearch(value);
                                    if (value && validRegExp(value)) {
                                        this.setCopyFilter({
                                            ...state.copyFilter,
                                            title: { regex: value, not: false },
                                            url: { regex: value, not: false },
                                        });
                                    } else {
                                        this.setCopyFilter({
                                            ...state.copyFilter,
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
                <Modal show={state.showFilter} onHide={this.handleHideFilter}>
                    <Modal.Body>
                        <Form.Group controlId="filterCopyTimestamp">
                            <Form.Row>
                                <Col>
                                    <Form.Label>Since</Form.Label>
                                    <Form.Control
                                        type="date"
                                        disabled={props.loading || state.copyDateRange.of !== "custom"}
                                        value={getDt(state.copyFilter.timestamp?.gt)}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                            const value = getEpoch(e.currentTarget.value);
                                            if (value) {
                                                this.setLastCustomDateRange({
                                                    ...state.lastCustomDateRange,
                                                    gt: value,
                                                });
                                                this.setCopyFilter({
                                                    ...state.copyFilter,
                                                    timestamp: { ...state.copyFilter.timestamp, gt: value },
                                                });
                                            } else {
                                                this.setLastCustomDateRange({
                                                    ...state.lastCustomDateRange,
                                                    gt: undefined,
                                                });
                                                this.setCopyFilter({ ...state.copyFilter, timestamp: undefined });
                                            }
                                        }}
                                    />
                                </Col>
                                <Col>
                                    <Form.Label>Until</Form.Label>
                                    {state.copyFilter.timestamp?.lt || state.copyDateRange.of === "custom" ? (
                                        <Form.Control
                                            type="date"
                                            disabled={props.loading || state.copyDateRange.of !== "custom"}
                                            value={getDt(state.copyFilter.timestamp?.lt)}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                                const value = getEpoch(e.currentTarget.value);
                                                if (value) {
                                                    this.setLastCustomDateRange({
                                                        ...state.lastCustomDateRange,
                                                        lt: value,
                                                    });
                                                    this.setCopyFilter({
                                                        ...state.copyFilter,
                                                        timestamp: { ...state.copyFilter.timestamp, lt: value },
                                                    });
                                                } else {
                                                    this.setLastCustomDateRange({
                                                        ...state.lastCustomDateRange,
                                                        lt: undefined,
                                                    });
                                                    this.setCopyFilter({ ...state.copyFilter, timestamp: undefined });
                                                }
                                            }}
                                        />
                                    ) : (
                                        <Form.Control type="text" disabled={true} value="Now" />
                                    )}
                                </Col>
                            </Form.Row>
                            <Form.Row className="pt-2">
                                <Col>
                                    <Button
                                        type="button"
                                        className="mr-1"
                                        variant="light"
                                        onClick={() => this.setAdjacentRange("previous")}
                                    >
                                        &lt;
                                    </Button>
                                    <Button
                                        type="button"
                                        className="mr-1"
                                        variant="light"
                                        onClick={() => this.setAdjacentRange("next")}
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
                                                checked={state.copyDateRange.of === range}
                                                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                                    const v = e.currentTarget.value;
                                                    if (
                                                        v === "24-hours" ||
                                                        v === "3-days" ||
                                                        v === "week" ||
                                                        v === "month"
                                                    ) {
                                                        this.setCopyDateRange({ of: v });
                                                    } else if (v === "custom") {
                                                        this.setCopyDateRange({
                                                            of: v,
                                                            value: state.lastCustomDateRange,
                                                        });
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
                        <Form.Group controlId="filterCopyScore">
                            <Form.Label>Score and z-Score</Form.Label>
                            <Form.Row>
                                <Col>
                                    <Form.Control
                                        type="number"
                                        placeholder="Minimum Score"
                                        disabled={props.loading}
                                        value={getInputNumber(state.copyFilter.score?.gt)}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                            let value = parseInt(e.currentTarget.value);
                                            if (value < 0) value = 0;
                                            this.setCopyFilter({
                                                ...state.copyFilter,
                                                score: { ...state.copyFilter.score, gt: value },
                                            });
                                        }}
                                    />
                                </Col>
                                <Col>
                                    <Form.Control
                                        type="text"
                                        placeholder="Min z-Score (-5.0 to 5.0)"
                                        disabled={props.loading}
                                        value={
                                            state.copyFilter.zScore?.gt || state.copyFilter.zScore?.gt === 0
                                                ? state.copyFilter.zScore.gt.toString()
                                                : ""
                                        }
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                            let value = parseFloat(e.currentTarget.value);
                                            if (isNaN(value)) return;
                                            if (value < -5) value = -5;
                                            else if (value > 5) value = 5;
                                            this.setCopyFilter({
                                                ...state.copyFilter,
                                                zScore: { ...state.copyFilter.zScore, gt: value },
                                            });
                                        }}
                                    />
                                </Col>
                            </Form.Row>
                        </Form.Group>
                        <Form.Group controlId="filterCopyTitle">
                            <Form.Row>
                                <Col>
                                    <Form.Label>Title (regex)</Form.Label>
                                    <Form.Control
                                        type="text"
                                        disabled={props.loading}
                                        value={state.copyFilter.title?.regex || ""}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                            let value = e.currentTarget.value;
                                            if (!value || !validRegExp(value)) {
                                                this.setSearch("");
                                                this.setCopyFilter({ ...state.copyFilter, title: undefined });
                                            } else {
                                                this.setSearch("");
                                                value = value.trim();
                                                this.setCopyFilter({
                                                    ...state.copyFilter,
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
                                        disabled={props.loading}
                                        value={state.copyFilter.url?.regex || ""}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                            let value = e.currentTarget.value;
                                            if (!value || !validRegExp(value)) {
                                                this.setSearch("");
                                                this.setCopyFilter({ ...state.copyFilter, url: undefined });
                                            } else {
                                                this.setSearch("");
                                                this.setCopyFilter({
                                                    ...state.copyFilter,
                                                    url: value.trim() ? { regex: value.trim(), not: false } : undefined,
                                                });
                                            }
                                        }}
                                    />
                                </Col>
                            </Form.Row>
                        </Form.Group>
                        <Form.Group controlId="filterCopySort">
                            <Form.Row>
                                <Col>
                                    <Form.Label>Order By</Form.Label>
                                    <Form.Control
                                        as="select"
                                        custom
                                        disabled={props.loading}
                                        value={
                                            (state.copyFilter.sort?.length || 0) > 0
                                                ? state.copyFilter.sort![0].sort
                                                : "timestamp"
                                        }
                                        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                                            const value = e.currentTarget.value;
                                            if (!value) {
                                                if (!state.copyFilter.sort) return;
                                                this.setCopyFilter({ ...state.copyFilter, sort: undefined });
                                                return;
                                            }

                                            if (value === "timestamp" || value === "score" || value === "stars") {
                                                const firstSort = { sort: value, asc: false } as StoryRankingSort;
                                                if (!state.copyFilter.sort) state.copyFilter.sort = [firstSort];
                                                else state.copyFilter.sort[0] = firstSort;
                                                this.setCopyFilter({
                                                    ...state.copyFilter,
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
                        <Form.Group controlId="filterCopyPage">
                            <Form.Row>
                                <Col>
                                    <Form.Label>Page Size</Form.Label>
                                    <Form.Control
                                        type="number"
                                        disabled={props.loading}
                                        value={state.copyFilter.pageSize}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                            const value = e.currentTarget.value;
                                            let pageSize = parseInt(value) || 100;
                                            if (pageSize <= 1) pageSize = 100;
                                            this.setCopyFilter({ ...state.copyFilter, pageSize: pageSize });
                                        }}
                                    />
                                </Col>
                                <Col>
                                    <Form.Label>Page Number</Form.Label>
                                    <Form.Control
                                        type="number"
                                        disabled={props.loading}
                                        value={state.copyFilter.pageNumber}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                            const value = e.currentTarget.value;
                                            let pageNumber = parseInt(value) || 0;
                                            if (pageNumber <= 0) pageNumber = 0;
                                            this.setCopyFilter({ ...state.copyFilter, pageNumber: pageNumber });
                                        }}
                                    />
                                </Col>
                            </Form.Row>
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="primary" onClick={this.setNewFilter}>
                            Apply
                        </Button>
                        <Button variant="secondary" onClick={this.resetFilter}>
                            Reset
                        </Button>
                        <Button variant="secondary" onClick={this.handleHideFilter}>
                            Cancel
                        </Button>
                    </Modal.Footer>
                </Modal>
                <Modal show={state.showSettings} onHide={this.handleHideSettings}>
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
                                    checked={props.dateDisplay.of === "distance"}
                                    onChange={() => props.setDateDisplay({ of: "distance" })}
                                >
                                    Distance
                                </ToggleButton>
                                <ToggleButton
                                    type="radio"
                                    variant="secondary"
                                    name="radio"
                                    value={"datetime"}
                                    checked={props.dateDisplay.of === "datetime"}
                                    onChange={() => props.setDateDisplay({ of: "datetime" })}
                                >
                                    Date and Time
                                </ToggleButton>
                                <ToggleButton
                                    type="radio"
                                    variant="secondary"
                                    name="radio"
                                    value={"date"}
                                    checked={props.dateDisplay.of === "date"}
                                    onChange={() => props.setDateDisplay({ of: "date" })}
                                >
                                    Date
                                </ToggleButton>
                                <ToggleButton
                                    type="radio"
                                    variant="secondary"
                                    name="radio"
                                    value={"custom"}
                                    checked={props.dateDisplay.of === "custom"}
                                    onChange={() =>
                                        props.setDateDisplay({
                                            of: "custom",
                                            value: state.lastCustomDateDisplay || "yyyy-MM-dd",
                                        })
                                    }
                                >
                                    Custom
                                </ToggleButton>
                            </ButtonGroup>
                            {props.dateDisplay.of === "custom" && (
                                <Form.Control
                                    type="text"
                                    placeholder="distance"
                                    disabled={props.loading}
                                    className={"mt-1"}
                                    value={props.dateDisplay.value || "yyyy-MM-dd"}
                                    onChange={(e: React.FormEvent<HTMLInputElement>) => {
                                        this.setLastCustomDateDisplay(e.currentTarget.value);
                                        props.setDateDisplay({ of: "custom", value: e.currentTarget.value });
                                    }}
                                />
                            )}
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={this.handleHideSettings}>
                            Close
                        </Button>
                    </Modal.Footer>
                </Modal>
            </>
        );
    }
}

export default NavigationBar;
