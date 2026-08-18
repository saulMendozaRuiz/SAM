import { initializeAuthentication } from "./auth.ts";
import { initializeNavigation } from "./navigation.ts";
document.addEventListener("DOMContentLoaded", () => { initializeAuthentication(); initializeNavigation(); });
