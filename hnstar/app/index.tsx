import * as React from "react";
import * as ReactDOM from "react-dom";
import App from "./App";

document.addEventListener("DOMContentLoaded", () => {
    const appEl = document.getElementById("app")!;
    ReactDOM.render(<App version={1} />, appEl);
});
