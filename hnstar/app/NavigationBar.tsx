import * as React from "react";
import { Navbar, Nav, Modal, Button, Form, FormControl, Col, InputGroup } from "react-bootstrap";
import { ChangeEvent, useState } from "react";
import { StoryRankingFilter, StoryRankingSort } from "./ApiStories";
import { format as dateformat, addMinutes } from "date-fns";

interface NavigationProps {
    filter: StoryRankingFilter;
    setFilter: (filter: StoryRankingFilter) => void;
    dateDisplay: string;
    setDateDisplay: (dateDisplay: string) => void;
    dateRange: string;
    setDateRange: (dateRange: "custom" | "24-hours" | "3-days" | "week" | "month") => void;
}

function NavigationBar(props: NavigationProps) {
    const { filter, setFilter, dateDisplay, setDateDisplay, dateRange, setDateRange } = props;
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

    const validRegExp = (regex: string) => {
        try {
            return new RegExp(regex) ? true : false;
        } catch {
            return false;
        }
    };
    const getInputNumber = (n: number | undefined): string => (n ? n.toString() : "");
    const getDt = (epoch: number | undefined) => (!epoch ? "" : dateformat(new Date(epoch * 1000), "yyyy-MM-dd"));
    const getEpoch = (date: string) => {
        if (!date || date.trim() === "") return undefined;
        let dt = new Date(date);
        // undo timezone adaption
        dt = addMinutes(dt, dt.getTimezoneOffset());

        return date.trim() === "" ? undefined : dt.getTime() / 1000;
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
                                    value={getDt(filter.timestamp?.gt)}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                        // TODO: set "custom" dateRange on user input
                                        const value = getEpoch(e.currentTarget.value);
                                        setFilter({
                                            ...filter,
                                            timestamp: { ...filter.timestamp, gt: value },
                                        });
                                    }}
                                />
                            </Col>
                            <Col>
                                <Form.Label>Until</Form.Label>
                                <Form.Control
                                    type="date"
                                    value={getDt(filter.timestamp?.lt)}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                        // TODO: set "custom" dateRange on user input
                                        const value = getEpoch(e.currentTarget.value);
                                        setFilter({
                                            ...filter,
                                            timestamp: { ...filter.timestamp, lt: value },
                                        });
                                    }}
                                />
                            </Col>
                        </Form.Row>
                        <Form.Row className="pt-2">
                            <Col>
                                <Button type="button" className="mr-1" variant="light">
                                    &lt;
                                </Button>
                                <Button type="button" className="mr-1" variant="light">
                                    &gt;
                                </Button>
                                <Form.Control
                                    as="select"
                                    custom
                                    value={dateRange}
                                    style={{ width: "65%" }}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                                        const v = e.currentTarget.value;
                                        if (
                                            v === "custom" ||
                                            v === "24-hours" ||
                                            v === "3-days" ||
                                            v === "week" ||
                                            v === "month"
                                        ) {
                                            setDateRange(v);
                                        }
                                    }}
                                >
                                    <option value={"24-hours"}>Last 24 Hours</option>
                                    <option value={"3-days"}>Last 3-Days</option>
                                    <option value={"week"}>Week</option>
                                    <option value={"month"}>Month</option>
                                    <option value={"custom"}>Custom</option>
                                </Form.Control>
                            </Col>
                        </Form.Row>
                    </Form.Group>
                    <Form.Group controlId="filterScore">
                        <Form.Label>Score</Form.Label>
                        <Form.Row>
                            <Col>
                                <Form.Control
                                    type="number"
                                    placeholder="Minimum Score"
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
                                    type="number"
                                    placeholder="Minimum z-Score"
                                    value={getInputNumber(filter.zScore?.gt)}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                        let value = parseInt(e.currentTarget.value);
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
                                    value={filter.title?.regex || ""}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                        let value = e.currentTarget.value;
                                        if (!value || !validRegExp(value)) setFilter({ ...filter, title: undefined });
                                        else {
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
                                    value={filter.url?.regex || ""}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                        let value = e.currentTarget.value;
                                        if (!value || !validRegExp(value)) setFilter({ ...filter, url: undefined });
                                        else {
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
                        <Form.Label>Display Date As: distance, date, datetime, custom</Form.Label>
                        <Form.Control
                            type="text"
                            placeholder="distance"
                            value={dateDisplay}
                            onChange={(e: React.FormEvent<HTMLInputElement>) => setDateDisplay(e.currentTarget.value)}
                        />
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
