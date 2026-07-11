// PROTOTYPE — throwaway entry. Mounts the footer prototype with the REAL design
// tokens, fonts, and MathQuill input so the feel is faithful, not a mock.
import { createRoot } from "react-dom/client";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/martian-mono/index.css";
import "../../../design/foundation.css";
import "../../theme.css";
import "./footer-proto.css";
import { FooterProto } from "./FooterProto";

createRoot(document.getElementById("proto-root")!).render(<FooterProto />);
