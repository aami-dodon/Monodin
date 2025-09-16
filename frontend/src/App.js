import { useEffect, useState } from "react";

function App() {
  const [time, setTime] = useState("");

  useEffect(() => {
    fetch("http://localhost:5000/api")
      .then((res) => res.json())
      .then((data) => setTime(data.time))
      .catch((err) => console.error("Error fetching API:", err));
  }, []);

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>PERN Minimal Frontend</h1>
      <p>{time ? `Server time: ${time}` : "Loading..."}</p>
    </div>
  );
}

export default App;
