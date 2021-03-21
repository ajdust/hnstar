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
import { DateDisplay, DateRange } from "./AppState";
import { dateInputValueToEpoch, createRegExp, optionalNumberToString, epochToDateInputValue } from "./Utilities";

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
    lastCustomDateRange: { gt?: number; lt?: number };
    draftDateRange: DateRange;
    draftFilter: StoryRankingFilter;
}

class NavigationBar extends React.Component<NavigationProps, NavigationState> {
    hideFilter = async () =>
        new Promise<void>((resolve, _) => this.setState({ ...this.state, showFilter: false }, resolve));
    showFilter = async () =>
        new Promise<void>((resolve, _) => this.setState({ ...this.state, showFilter: true }, resolve));
    hideSettings = async () =>
        new Promise<void>((resolve, _) => this.setState({ ...this.state, showSettings: false }, resolve));
    showSettings = async () =>
        new Promise<void>((resolve, _) => this.setState({ ...this.state, showSettings: true }, resolve));

    setDraftDateRange = async (range: DateRange): Promise<void> => {
        await new Promise<void>((resolve, _) => this.setState({ ...this.state, draftDateRange: range }, resolve));
        if (range.of === "custom") {
            await this.setDraftFilter({ ...this.state.draftFilter, timestamp: range.value });
            return;
        } else {
            const ms = DateRange.getGreaterThan(range);
            if (!ms) return;
            await this.setDraftFilter({ ...this.state.draftFilter, timestamp: { gt: ms } });
        }
    };

    setAdjacentRange = async (previous: "previous" | "next"): Promise<void> => {
        const step = previous === "previous" ? -1 : 1;
        const adjacent = DateRange.getAdjacentRange(step, this.state.draftDateRange);
        if (adjacent.of !== "custom") return;

        await this.setLastCustomDateRange(adjacent.value);
        await this.setDraftDateRange(adjacent);
        await this.setDraftFilter({ ...this.state.draftFilter, timestamp: adjacent.value });
    };

    setSearch = async (search: string): Promise<void> => {
        return new Promise((resolve, _) => this.setState({ ...this.state, search }, resolve));
    };

    setDraftFilter = async (copyFilter: StoryRankingFilter): Promise<void> => {
        return new Promise((resolve, _) => this.setState({ ...this.state, draftFilter: copyFilter }, resolve));
    };

    setLastCustomDateRange = async (range: { gt?: number; lt?: number }): Promise<void> => {
        return new Promise((resolve, _) => this.setState({ ...this.state, lastCustomDateRange: range }, resolve));
    };

    setLastCustomDateDisplay = async (display: string): Promise<void> => {
        return new Promise((resolve, _) => this.setState({ ...this.state, lastCustomDateDisplay: display }, resolve));
    };

    setNewFilter = async (): Promise<void> => {
        await this.props.setFilter(this.state.draftFilter);
        await this.props.setDateRange(this.state.draftDateRange);
        await this.hideFilter();
    };

    resetFilter = async (): Promise<void> => {
        await this.setDraftFilter(this.props.filter);
        await this.setDraftDateRange(this.props.dateRange);
    };

    constructor(props: NavigationProps) {
        super(props);
        this.state = {
            draftDateRange: props.dateRange,
            draftFilter: props.filter,
            lastCustomDateDisplay: props.dateDisplay.of === "custom" ? props.dateDisplay.value : "",
            lastCustomDateRange:
                props.dateRange.of === "custom" ? props.dateRange.value : { gt: undefined, lt: undefined },
            showSettings: false,
            showFilter: false,
            search: "",
        };
    }

    getNavbar() {
        const [state, props] = [this.state, this.props];
        return (
            <Navbar bg="light" expand="sm">
                <Navbar.Brand href="#">har</Navbar.Brand>
                <Navbar.Toggle aria-controls="basic-navbar-nav" />
                <Navbar.Collapse id="basic-navbar-nav">
                    <Nav className="mr-auto">
                        {/*<Nav.Link style={{ minWidth: "4rem" }} onClick={handleShowSignIn}>*/}
                        {/*    sign in*/}
                        {/*</Nav.Link>*/}
                        <Nav.Link onClick={this.showFilter}>filter</Nav.Link>
                        <Nav.Link onClick={this.showSettings}>settings</Nav.Link>
                    </Nav>

                    <InputGroup className="mr-auto" style={{ maxWidth: "25rem" }}>
                        <FormControl
                            type="text"
                            placeholder="Search"
                            disabled={props.loading}
                            value={state.search}
                            onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                                const value = e.currentTarget.value;
                                await this.setSearch(value);
                                if (value && createRegExp(value)) {
                                    await this.setDraftFilter({
                                        ...state.draftFilter,
                                        title: { regex: value, not: false },
                                        url: { regex: value, not: false },
                                    });
                                } else {
                                    await this.setDraftFilter({
                                        ...state.draftFilter,
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
        );
    }

    getSettingsModal() {
        const [state, props] = [this.state, this.props];
        return (
            <Modal show={state.showSettings} onHide={this.hideSettings}>
                <Modal.Body>
                    <Form.Group controlId="displayDateAs">
                        <Form.Label>Display Date</Form.Label>
                        <br />
                        <ButtonGroup toggle>
                            {DateDisplay.enumerate().map((dd, idx) => {
                                return (
                                    <ToggleButton
                                        key={idx}
                                        type="radio"
                                        variant="secondary"
                                        name="radio"
                                        value={dd.of}
                                        checked={props.dateDisplay.of === dd.of}
                                        onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                                            const v = e.currentTarget.value;
                                            if (v === "distance" || v === "datetime" || v === "date")
                                                await props.setDateDisplay({ of: v });
                                            else
                                                await props.setDateDisplay({
                                                    of: "custom",
                                                    value: state.lastCustomDateDisplay || "hbbb E w/52",
                                                });
                                        }}
                                    >
                                        {DateDisplay.getDateDisplayLabel(dd)}
                                    </ToggleButton>
                                );
                            })}
                        </ButtonGroup>
                        {props.dateDisplay.of === "custom" && (
                            <>
                                <Form.Control
                                    type="text"
                                    placeholder="distance"
                                    disabled={props.loading}
                                    className={"mt-1"}
                                    style={{ width: "80%", display: "inline" }}
                                    value={props.dateDisplay.value || "yyyy-MM-dd"}
                                    onChange={async (e: React.FormEvent<HTMLInputElement>) => {
                                        await this.setLastCustomDateDisplay(e.currentTarget.value);
                                        await props.setDateDisplay({ of: "custom", value: e.currentTarget.value });
                                    }}
                                />
                                <a className={"ml-1"} target="_blank" href="https://date-fns.org/v2.19.0/docs/format">
                                    ?
                                </a>
                            </>
                        )}
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={this.hideSettings}>
                        Close
                    </Button>
                </Modal.Footer>
            </Modal>
        );
    }

    getFilterModal() {
        const [state, props] = [this.state, this.props];
        return (
            <Modal show={state.showFilter} onHide={this.hideFilter}>
                <Modal.Body>
                    <Form.Group controlId="filterCopyTimestamp">
                        <Form.Row>
                            <Col>
                                <Form.Label>Since</Form.Label>
                                <Form.Control
                                    type="date"
                                    disabled={props.loading || state.draftDateRange.of !== "custom"}
                                    value={epochToDateInputValue(state.draftFilter.timestamp?.gt)}
                                    onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                                        const value = dateInputValueToEpoch(e.currentTarget.value);
                                        if (value) {
                                            await this.setLastCustomDateRange({
                                                ...state.lastCustomDateRange,
                                                gt: value,
                                            });
                                            await this.setDraftFilter({
                                                ...state.draftFilter,
                                                timestamp: { ...state.draftFilter.timestamp, gt: value },
                                            });
                                        } else {
                                            await this.setLastCustomDateRange({
                                                ...state.lastCustomDateRange,
                                                gt: undefined,
                                            });
                                            await this.setDraftFilter({ ...state.draftFilter, timestamp: undefined });
                                        }
                                    }}
                                />
                            </Col>
                            <Col>
                                <Form.Label>Until</Form.Label>
                                {state.draftFilter.timestamp?.lt || state.draftDateRange.of === "custom" ? (
                                    <Form.Control
                                        type="date"
                                        disabled={props.loading || state.draftDateRange.of !== "custom"}
                                        value={epochToDateInputValue(state.draftFilter.timestamp?.lt)}
                                        onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                                            const value = dateInputValueToEpoch(e.currentTarget.value);
                                            if (value) {
                                                await this.setLastCustomDateRange({
                                                    ...state.lastCustomDateRange,
                                                    lt: value,
                                                });
                                                await this.setDraftFilter({
                                                    ...state.draftFilter,
                                                    timestamp: { ...state.draftFilter.timestamp, lt: value },
                                                });
                                            } else {
                                                await this.setLastCustomDateRange({
                                                    ...state.lastCustomDateRange,
                                                    lt: undefined,
                                                });
                                                await this.setDraftFilter({
                                                    ...state.draftFilter,
                                                    timestamp: undefined,
                                                });
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
                                    {DateRange.enumerate().map((range, idx) => (
                                        <ToggleButton
                                            key={idx}
                                            type="radio"
                                            variant="secondary"
                                            name="radio"
                                            value={range.of}
                                            checked={state.draftDateRange.of === range.of}
                                            onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                                                const v = e.currentTarget.value;
                                                if (
                                                    v === "24-hours" ||
                                                    v === "3-days" ||
                                                    v === "week" ||
                                                    v === "month"
                                                ) {
                                                    await this.setDraftDateRange({ of: v });
                                                } else if (v === "custom") {
                                                    await this.setDraftDateRange({
                                                        of: v,
                                                        value: state.lastCustomDateRange,
                                                    });
                                                }
                                            }}
                                        >
                                            {DateRange.getDateRangeLabel(range)}
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
                                    value={optionalNumberToString(state.draftFilter.score?.gt)}
                                    onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                                        let value = parseInt(e.currentTarget.value);
                                        if (value < 0) value = 0;
                                        await this.setDraftFilter({
                                            ...state.draftFilter,
                                            score: { ...state.draftFilter.score, gt: value },
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
                                        state.draftFilter.zScore?.gt || state.draftFilter.zScore?.gt === 0
                                            ? state.draftFilter.zScore.gt.toString()
                                            : ""
                                    }
                                    onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                                        let value = parseFloat(e.currentTarget.value);
                                        if (isNaN(value)) return;
                                        if (value < -5) value = -5;
                                        else if (value > 5) value = 5;
                                        await this.setDraftFilter({
                                            ...state.draftFilter,
                                            zScore: { ...state.draftFilter.zScore, gt: value },
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
                                    value={state.draftFilter.title?.regex || ""}
                                    onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                                        let value = e.currentTarget.value;
                                        if (!value || !createRegExp(value)) {
                                            await this.setSearch("");
                                            await this.setDraftFilter({ ...state.draftFilter, title: undefined });
                                        } else {
                                            await this.setSearch("");
                                            value = value.trim();
                                            await this.setDraftFilter({
                                                ...state.draftFilter,
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
                                    value={state.draftFilter.url?.regex || ""}
                                    onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                                        let value = e.currentTarget.value;
                                        if (!value || !createRegExp(value)) {
                                            await this.setSearch("");
                                            await this.setDraftFilter({ ...state.draftFilter, url: undefined });
                                        } else {
                                            await this.setSearch("");
                                            await this.setDraftFilter({
                                                ...state.draftFilter,
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
                                        (state.draftFilter.sort?.length || 0) > 0
                                            ? state.draftFilter.sort![0].sort
                                            : "timestamp"
                                    }
                                    onChange={async (e: ChangeEvent<HTMLSelectElement>) => {
                                        const value = e.currentTarget.value;
                                        if (!value) {
                                            if (!state.draftFilter.sort) return;
                                            await this.setDraftFilter({ ...state.draftFilter, sort: undefined });
                                            return;
                                        }

                                        if (value === "timestamp" || value === "score" || value === "stars") {
                                            const firstSort = { sort: value, asc: false } as StoryRankingSort;
                                            if (!state.draftFilter.sort) state.draftFilter.sort = [firstSort];
                                            else state.draftFilter.sort[0] = firstSort;
                                            await this.setDraftFilter({
                                                ...state.draftFilter,
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
                                    value={state.draftFilter.pageSize}
                                    onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                                        const value = e.currentTarget.value;
                                        let pageSize = parseInt(value) || 100;
                                        if (pageSize <= 1) pageSize = 100;
                                        await this.setDraftFilter({ ...state.draftFilter, pageSize: pageSize });
                                    }}
                                />
                            </Col>
                            <Col>
                                <Form.Label>Page Number</Form.Label>
                                <Form.Control
                                    type="number"
                                    disabled={props.loading}
                                    value={state.draftFilter.pageNumber}
                                    onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                                        const value = e.currentTarget.value;
                                        let pageNumber = parseInt(value) || 0;
                                        if (pageNumber <= 0) pageNumber = 0;
                                        await this.setDraftFilter({ ...state.draftFilter, pageNumber: pageNumber });
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
                    <Button variant="secondary" onClick={this.hideFilter}>
                        Cancel
                    </Button>
                </Modal.Footer>
            </Modal>
        );
    }

    render() {
        return (
            <>
                {this.getNavbar()}
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
                {this.getSettingsModal()}
                {this.getFilterModal()}
            </>
        );
    }
}

export default NavigationBar;
