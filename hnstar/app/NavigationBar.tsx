import * as React from "react";
import { Navbar, Nav, Modal, Button, Form, FormControl, Col, InputGroup } from "react-bootstrap";
import { ChangeEvent, useState } from "react";
import { StoryRankingFilter } from "./ApiStories";
import { format as dateformat, addMinutes } from "date-fns";

interface NavigationProps {
    filter: StoryRankingFilter;
    setFilter: (filter: StoryRankingFilter) => void;
    dateDisplay: string;
    setDateDisplay: (dateDisplay: string) => void;
}

function NavigationBar(props: NavigationProps) {
    const { filter, setFilter, dateDisplay, setDateDisplay } = props;
    const [showSignIn, setShowSignIn] = useState(false);
    const handleHideSignIn = () => setShowSignIn(false);
    const handleShowSignIn = () => setShowSignIn(true);

    const [showFilter, setShowFilter] = useState(false);
    const handleHideFilter = () => setShowFilter(false);
    const handleShowFilter = () => setShowFilter(true);

    const [showSettings, setShowSettings] = useState(false);
    const handleHideSettings = () => setShowSettings(false);
    const handleShowSettings = () => setShowSettings(true);

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
                        <Nav.Link style={{ minWidth: "4rem" }} onClick={handleShowSignIn}>
                            sign in
                        </Nav.Link>
                        <Nav.Link onClick={handleShowFilter}>filter</Nav.Link>
                        <Nav.Link onClick={handleShowSettings}>settings</Nav.Link>
                    </Nav>

                    <InputGroup className="mr-auto" style={{ maxWidth: "25rem" }}>
                        <FormControl type="text" placeholder="Search" />
                        <InputGroup.Append>
                            <Button type="button" variant="outline-success">
                                Search
                            </Button>
                        </InputGroup.Append>
                    </InputGroup>
                </Navbar.Collapse>
            </Navbar>
            <Modal show={showSignIn} onHide={handleHideSignIn}>
                <Modal.Body>
                    <Form.Group controlId="formBasicEmail">
                        <Form.Label>Username</Form.Label>
                        <Form.Control type="email" placeholder="Enter email" />
                    </Form.Group>

                    <Form.Group controlId="formBasicPassword">
                        <Form.Label>Password</Form.Label>
                        <Form.Control type="password" placeholder="Password" />
                    </Form.Group>
                    <Form.Group controlId="formBasicCheckbox">
                        <Form.Check type="checkbox" label="Remember me" checked />
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleHideSignIn}>
                        Close
                    </Button>
                    <Button variant="primary" onClick={handleHideSignIn}>
                        Sign In
                    </Button>
                </Modal.Footer>
            </Modal>
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
                                        const value = e.currentTarget.value;
                                        setFilter({
                                            ...filter,
                                            timestamp: { ...filter.timestamp, gt: getEpoch(value) },
                                        });
                                    }}
                                />
                            </Col>
                            <Col>
                                <Form.Label>Until</Form.Label>
                                <Form.Control type="date" value={getDt(filter.timestamp?.lt)} />
                            </Col>
                        </Form.Row>
                    </Form.Group>
                    <Form.Group controlId="filterZScore">
                        <Form.Label>Z-Score</Form.Label>
                        <Form.Row>
                            <Col>
                                <Form.Control type="number" placeholder="Minimum" value={filter.zScore?.gt} />
                            </Col>
                            <Col>
                                <Form.Control type="number" placeholder="Maximum" value={filter.zScore?.lt} />
                            </Col>
                        </Form.Row>
                    </Form.Group>
                    <Form.Group controlId="filterScore">
                        <Form.Label>Score</Form.Label>
                        <Form.Row>
                            <Col>
                                <Form.Control type="number" placeholder="Minimum" value={filter.score?.gt} />
                            </Col>
                            <Col>
                                <Form.Control type="number" placeholder="Maximum" value={filter.score?.lt} />
                            </Col>
                        </Form.Row>
                    </Form.Group>
                    <Form.Group controlId="filterTitle">
                        <Form.Row>
                            <Col>
                                <Form.Label>Title (regex)</Form.Label>
                                <Form.Control type="text" value={filter.title?.regex} />
                            </Col>
                            <Col>
                                <Form.Label>URL (regex)</Form.Label>
                                <Form.Control type="text" value={filter.url?.regex} />
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
                                    value={(filter.sort?.length || 0) > 0 ? filter.sort![0].sort : ""}
                                >
                                    <option>timestamp</option>
                                    <option>score</option>
                                    <option>stars</option>
                                </Form.Control>
                            </Col>
                            <Col>
                                <Form.Label>Then By</Form.Label>
                                <Form.Control
                                    as="select"
                                    custom
                                    value={(filter.sort?.length || 0) > 1 ? filter.sort![1].sort : ""}
                                >
                                    <option>timestamp</option>
                                    <option>score</option>
                                    <option>stars</option>
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
                        <Form.Label>Display Date As</Form.Label>
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
