import * as React from "react";
import { Component } from "react";
import "./App.css";
import NavigationBar from "./NavigationBar";
import PageContent from "./PageContent";

class App extends Component {
    render() {
        return (
            <div className="App">
                <NavigationBar />
                <PageContent />
            </div>
        );
    }
}

export default App;
