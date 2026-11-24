import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Intro from "./Intro";
import Tour from "./Tour";
import "./styles.css";
import { installCompat } from "./compat";
installCompat();
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /><Intro /><Tour /></React.StrictMode>);