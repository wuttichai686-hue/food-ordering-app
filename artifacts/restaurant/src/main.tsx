import { createRoot } from "react-dom/client";
import { Switch, Route } from "wouter";
import App from "./App";
import AdminApp from "./AdminApp";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <Switch>
    <Route path="/admin" component={AdminApp} />
    <Route path="/admin/:rest*" component={AdminApp} />
    <Route component={App} />
  </Switch>
);
