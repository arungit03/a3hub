import { Routes } from "react-router-dom";
import { renderAdminRoutes } from "./routes/adminRoutes";
import { renderAppShellRoutes } from "./routes/appShellRoutes";
import { renderPublicRoutes } from "./routes/publicRoutes";
import { RouteLoader } from "./routes/routeLoader";

const withRouteLoader = (element) => <RouteLoader>{element}</RouteLoader>;

function App() {
  return (
    <Routes>
      {renderPublicRoutes(withRouteLoader)}
      {renderAppShellRoutes(withRouteLoader)}
      {renderAdminRoutes(withRouteLoader)}
    </Routes>
  );
}

export default App;
