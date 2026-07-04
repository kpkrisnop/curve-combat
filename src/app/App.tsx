import { useHashRoute } from "./routes";
import { LandingScreen } from "./screens/LandingScreen";
import { LocalFlow } from "./screens/LocalFlow";
import { OnlineParity } from "./screens/OnlineParity";
import { OnlineChoice } from "./screens/OnlineChoice";
import { JoinRoom } from "./screens/JoinRoom";
import { PhoneGate } from "./PhoneGate";
import { parseConfigFromHash } from "../game/configRouter";

export function App() {
  const route = useHashRoute();
  return (
    <div className="gw-app">
      {route.screen === "landing" && <LandingScreen />}
      {route.screen === "local" && <LocalFlow initial={parseConfigFromHash("#game")} />}
      {route.screen === "game" && <LocalFlow key={location.hash} initial={route.config} autostart />}
      {route.screen === "room" && <OnlineParity code={route.code} />}
      {route.screen === "online" && <OnlineChoice />}
      {route.screen === "join" && <JoinRoom />}
      <PhoneGate />
    </div>
  );
}
