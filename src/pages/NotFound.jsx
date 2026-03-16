import { Link } from "react-router-dom";
import Card from "../components/Card";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sand p-6">
      <Card className="max-w-sm text-center">
        <h2 className="text-xl font-semibold text-ink">Page not found</h2>
        <p className="mt-2 text-sm text-ink/80">
          The page you are looking for does not exist.
        </p>
        <Link
          to="/home"
          className="mt-4 inline-flex rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-ink"
        >
          Go to dashboard
        </Link>
      </Card>
    </div>
  );
}

