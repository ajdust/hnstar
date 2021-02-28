import * as React from "react";
import { Navbar, Nav, NavItem } from "react-bootstrap";

class NavigationBar extends React.Component {
    render() {
        return (
            <Navbar inverse collapseOnSelect>
                <Navbar.Brand>
                    <a href="#">React-Bootstrap</a>
                </Navbar.Brand>
                <Navbar.Toggle />
                <Navbar.Collapse>
                    <Nav pullRight>
                        <NavItem eventKey={1} href="#">
                            Home
                        </NavItem>
                        <NavItem eventKey={2} href="#">
                            About
                        </NavItem>
                        <NavItem eventKey={3} href="#">
                            Contact
                        </NavItem>
                    </Nav>
                </Navbar.Collapse>
            </Navbar>
        );
    }
}

export default NavigationBar;
