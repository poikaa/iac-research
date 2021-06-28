import { useEffect, useState } from "react";
import { BrowserRouter as Router, Switch, Route, Link } from "react-router-dom";

const PAGES = [
  { name: "Home", path: "/" },
  { name: "About", path: "/about" },
  { name: "Contact", path: "/contact" },
];

function Message() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/hello")
      .then((res) => res.json())
      .then(({ message }) => {
        setMessage(message);
      });
  }, []);

  return <div>Message from API: {message}</div>;
}

function App() {
  return (
    <Router>
      <div>
        <nav>
          <ul>
            {PAGES.map(({ name, path }) => (
              <li key={path}>
                <Link to={path}>{name}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <Switch>
          {PAGES.map(({ name, path }) => (
            <Route key={path} path={path} exact>
              <>
                <h1>{name}</h1>
                <Message />
              </>
            </Route>
          ))}
        </Switch>
      </div>
    </Router>
  );
}

export default App;
