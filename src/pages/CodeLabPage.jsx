import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/auth";

export default function CodeLabPage() {
  const { role } = useAuth();
  const base = role === "staff" ? "/staff" : "/student";
  const navigate = useNavigate();

  return (
    <div className="code-lab-shell">
      <div className="code-lab-header">
        <div className="code-lab-title">
          <span className="code-lab-icon" aria-hidden="true">
            {"</>"}
          </span>
          <div>
            <p className="code-lab-kicker">Code Studio</p>
            <h1 className="code-lab-heading">Code</h1>
            <p className="code-lab-subtitle">
              Practice and learn Python, C, and C++ programming fundamentals.
            </p>
            <div className="code-lab-meta">
              <span className="code-lab-pill">Browser Based</span>
              <span className="code-lab-pill">No Setup</span>
              <span className="code-lab-pill">Beginner Friendly</span>
            </div>
          </div>
        </div>
      </div>

      <div className="code-lab-grid">
        <button
          type="button"
          className="code-lab-tile"
          onClick={() => navigate(`${base}/code/python`)}
          aria-label="Open Python Interpreter"
        >
          <div>
            <h2 className="code-lab-tile-title">Python Interpreter</h2>
            <p className="code-lab-tile-subtitle">
              Live syntax highlight with smart auto-complete.
            </p>
          </div>
          <span className="code-lab-tile-arrow" aria-hidden="true">
            {"\u25B6"}
          </span>
        </button>

        <button
          type="button"
          className="code-lab-tile"
          onClick={() => navigate(`${base}/code/c`)}
          aria-label="Open C Compiler"
        >
          <div>
            <h2 className="code-lab-tile-title">C Compiler</h2>
            <p className="code-lab-tile-subtitle">
              Native GCC sandbox with challenge tests and progress tracking.
            </p>
          </div>
          <span className="code-lab-tile-arrow" aria-hidden="true">
            {"\u25B6"}
          </span>
        </button>

        <button
          type="button"
          className="code-lab-tile"
          onClick={() => navigate(`${base}/code/cpp`)}
          aria-label="Open C++ Compiler"
        >
          <div>
            <h2 className="code-lab-tile-title">C++ Compiler</h2>
            <p className="code-lab-tile-subtitle">
              Native G++ sandbox with challenge tests and progress tracking.
            </p>
          </div>
          <span className="code-lab-tile-arrow" aria-hidden="true">
            {"\u25B6"}
          </span>
        </button>
      </div>
    </div>
  );
}
