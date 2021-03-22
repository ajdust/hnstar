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
    darkTheme: boolean;
    setDarkTheme: (darkTheme: boolean) => Promise<void>;
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

    applyDraftFilter = async (): Promise<void> => {
        await this.props.setFilter(this.state.draftFilter);
        await this.props.setDateRange(this.state.draftDateRange);
        await this.hideFilter();
    };

    resetDraftFilter = async (): Promise<void> => {
        await this.setDraftFilter(this.props.filter);
        await this.setDraftDateRange(this.props.dateRange);
    };

    zScoreHelpText = (zScore: number | undefined): string => {
        if (zScore === 0) return "Average or greater score";
        else if (!zScore) return "";

        const zSc = zScore.toFixed(1);
        if (zScore < -1) return `Very below average (${zSc})`;
        else if (zScore > 1) return `Very above average (+${zSc})`;
        else return zScore < 0 ? `Below average or greater (${zSc})` : `Above average or greater (+${zSc})`;
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
            search: props.filter?.title?.regex || "",
        };
    }

    getNavbar() {
        const [state, props] = [this.state, this.props];
        return (
            <Navbar expand="sm">
                <Navbar.Brand href="#">hnstar</Navbar.Brand>
                <Navbar.Toggle aria-controls="basic-navbar-nav" />
                <Navbar.Collapse id="basic-navbar-nav">
                    <Nav className="mr-auto">
                        {/*<Nav.Link style={{ minWidth: "4rem" }} onClick={handleShowSignIn}>*/}
                        {/*    sign in*/}
                        {/*</Nav.Link>*/}
                        <Nav.Link onClick={this.showFilter}>filter</Nav.Link>
                        <Nav.Link onClick={this.showSettings}>settings</Nav.Link>
                    </Nav>

                    <InputGroup className="mr-auto top-search-box" style={{ maxWidth: "25rem" }}>
                        <FormControl
                            type="text"
                            placeholder="Search"
                            disabled={props.loading}
                            value={state.search}
                            onKeyPress={async (e: KeyboardEvent) => {
                                if (e.key === "Enter") await this.applyDraftFilter();
                            }}
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
                            <Button type="button" variant="outline-success" onClick={this.applyDraftFilter}>
                                Search
                            </Button>
                            {state.search && (
                                <Button
                                    type="button"
                                    variant="outline-info"
                                    onClick={async () => {
                                        await this.setSearch("");
                                        await this.setDraftFilter({
                                            ...state.draftFilter,
                                            title: undefined,
                                            url: undefined,
                                        });
                                        await this.applyDraftFilter();
                                    }}
                                >
                                    Clear
                                </Button>
                            )}
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
                            {DateDisplay.enumerate().map((dd, idx) => (
                                <ToggleButton
                                    key={idx}
                                    type="radio"
                                    variant="secondary"
                                    name="dateDisplay"
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
                            ))}
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
                    <Form.Group controlId="darkTheme">
                        <Form.Label>Styling</Form.Label>
                        <br />
                        <ButtonGroup toggle>
                            {[
                                { name: "Dark", value: true },
                                { name: "Light", value: false },
                            ].map((radio, idx) => (
                                <ToggleButton
                                    key={idx}
                                    type="radio"
                                    variant="secondary"
                                    name="darkTheme"
                                    value={radio.value}
                                    checked={radio.value === props.darkTheme}
                                    onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                                        const v = e.currentTarget.value;
                                        await props.setDarkTheme(v === "true");
                                    }}
                                >
                                    {radio.name}
                                </ToggleButton>
                            ))}
                        </ButtonGroup>
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
                    <Form.Group controlId="draftFilterTimestamp">
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
                                    onClick={() => this.setAdjacentRange("previous")}
                                >
                                    &lt;
                                </Button>
                                <Button type="button" className="mr-1" onClick={() => this.setAdjacentRange("next")}>
                                    &gt;
                                </Button>
                                <ButtonGroup toggle>
                                    {DateRange.enumerate().map((range, idx) => (
                                        <ToggleButton
                                            key={idx}
                                            type="radio"
                                            variant="secondary"
                                            name="dateRange"
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
                    <Form.Group controlId="draftFilterScore">
                        <Form.Label>Minimum z-Score</Form.Label>
                        <Form.Row>
                            <Form.Control
                                type="range"
                                placeholder="-3"
                                disabled={props.loading}
                                value={
                                    state.draftFilter.zScore?.gt || state.draftFilter.zScore?.gt === 0
                                        ? Math.floor(((state.draftFilter.zScore.gt + 2.0) / 4.0) * 100)
                                        : 0.0
                                }
                                onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                                    let value = parseFloat(e.currentTarget.value);
                                    if (isNaN(value)) return;
                                    if (value === 0) {
                                        await this.setDraftFilter({ ...state.draftFilter, zScore: {} });
                                    } else {
                                        await this.setDraftFilter({
                                            ...state.draftFilter,
                                            zScore: { ...state.draftFilter.zScore, gt: (value / 100) * 4.0 - 2.0 },
                                        });
                                    }
                                }}
                            />
                            <i style={{ width: "100%", textAlign: "center" }}>
                                {this.zScoreHelpText(state.draftFilter.zScore?.gt)}
                            </i>
                        </Form.Row>
                    </Form.Group>
                    <Form.Group controlId="draftFilterSort">
                        <Form.Row>
                            <Col>
                                <Form.Label>Minimum Score</Form.Label>
                                <Form.Control
                                    type="number"
                                    placeholder="0"
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
                                <Form.Label>Order By</Form.Label>
                                <br />
                                <ButtonGroup toggle>
                                    {[
                                        { name: "Time", value: "timestamp" },
                                        { name: "Score", value: "score" },
                                    ].map((sort, idx) => (
                                        <ToggleButton
                                            key={idx}
                                            type="radio"
                                            variant="secondary"
                                            name="sorting"
                                            value={sort.value}
                                            checked={
                                                sort.value ===
                                                (state.draftFilter.sort?.length ? state.draftFilter.sort[0].sort : "")
                                            }
                                            onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                                                const value = e.currentTarget.value;
                                                if (value === "timestamp" || value === "score" || value === "stars") {
                                                    const firstSort = { sort: value, asc: false } as StoryRankingSort;
                                                    await this.setDraftFilter({
                                                        ...state.draftFilter,
                                                        sort: [firstSort],
                                                    });
                                                }
                                            }}
                                        >
                                            {sort.name}
                                        </ToggleButton>
                                    ))}
                                </ButtonGroup>
                            </Col>
                        </Form.Row>
                    </Form.Group>
                    <Form.Group controlId="draftFilterPage">
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
                    <Button variant="primary" onClick={this.applyDraftFilter}>
                        Apply
                    </Button>
                    <Button variant="secondary" onClick={this.resetDraftFilter}>
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
