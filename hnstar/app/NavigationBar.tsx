import * as React from "react";
import { Navbar, Nav, Modal, Button, Form, FormControl, Col } from "react-bootstrap";
import { useState } from "react";
import { StoryRankingFilter } from "./ApiStories";

function NavigationBar(props: { filters: StoryRankingFilter; setFilters: (filters: StoryRankingFilter) => void }) {
    const { filters, setFilters } = props;
    const [showSignIn, setShowSignIn] = useState(false);
    const handleHideSignIn = () => setShowSignIn(false);
    const handleShowSignIn = () => setShowSignIn(true);

    const [showFilter, setShowFilter] = useState(false);
    const handleHideFilter = () => setShowFilter(false);
    const handleShowFilter = () => setShowFilter(true);

    return (
        <>
            <Navbar bg="light" expand="lg">
                <Navbar.Brand href="#">hnstar</Navbar.Brand>
                <Navbar.Toggle aria-controls="basic-navbar-nav" />
                <Navbar.Collapse id="basic-navbar-nav">
                    <Nav className="mr-auto">
                        <Nav.Link onClick={handleShowSignIn}>sign in</Nav.Link>
                        <Nav.Link onClick={handleShowFilter}>filter</Nav.Link>
                    </Nav>
                    <Form inline>
                        <FormControl type="text" placeholder="Search" className="mr-sm-2" />
                        <Button variant="outline-success">Search</Button>
                    </Form>
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
                        <Form.Label>Timestamp</Form.Label>
                        {/* TODO: dynamic placeholder */}
                        <Form.Control type="date" />
                    </Form.Group>
                    <Form.Group controlId="filterPageSize">
                        <Form.Label>Page Size</Form.Label>
                        <Form.Control type="number" placeholder={100} />
                    </Form.Group>
                    {/* TODO: dynamic page number */}
                    <Form.Group controlId="filterPageNumber">
                        <Form.Label>Page Number</Form.Label>
                        <Form.Control type="number" placeholder={1} />
                    </Form.Group>
                    <Form.Group controlId="filterTitle">
                        <Form.Label>Title (regex)</Form.Label>
                        <Form.Control type="text" />
                    </Form.Group>
                    <Form.Group controlId="filterUrl">
                        <Form.Label>URL (regex)</Form.Label>
                        <Form.Control type="text" />
                    </Form.Group>
                    <Form.Group controlId="filterScore">
                        <Form.Label>Score</Form.Label>
                        <Form.Row>
                            <Col>
                                <Form.Control type="number" placeholder="Minimum" />
                            </Col>
                            <Col>
                                <Form.Control type="number" placeholder="Maximum" />
                            </Col>
                        </Form.Row>
                    </Form.Group>
                    <Form.Group controlId="filterZScore">
                        <Form.Label>Z-Score</Form.Label>
                        <Form.Row>
                            <Col>
                                <Form.Control type="number" placeholder="Minimum" />
                            </Col>
                            <Col>
                                <Form.Control type="number" placeholder="Maximum" />
                            </Col>
                        </Form.Row>
                    </Form.Group>
                    {/* TODO: add sorting ability */}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleHideFilter}>
                        Close
                    </Button>
                    <Button variant="primary" onClick={handleHideFilter}>
                        Apply
                    </Button>
                </Modal.Footer>
            </Modal>
        </>
    );
}

export default NavigationBar;
