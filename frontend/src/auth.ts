import { resetNavigation } from "./navigation.ts";
import { byId } from "./ui/dom.ts";

const VALID_USERNAME = "user123";
const VALID_PASSWORD = "admin123";

function clearCredentials(): void {
  byId<HTMLInputElement>("login-user").value = "";
  const password = byId<HTMLInputElement>("login-password");
  password.value = "";
  password.type = "password";
  const toggle = byId("toggle-password");
  toggle.setAttribute("aria-label", "Mostrar contraseña");
  toggle.setAttribute("title", "Mostrar contraseña");
}

function showLogin(): void {
  byId("main-application").hidden = true;
  byId("login-screen").hidden = false;
  byId("login-error").textContent = "";
  clearCredentials();
  requestAnimationFrame(() => byId<HTMLInputElement>("login-user").focus());
}

function showApplication(username: string): void {
  byId("login-screen").hidden = true;
  byId("main-application").hidden = false;
  byId("active-user").textContent = username;
  clearCredentials();
  void resetNavigation();
}

export function initializeAuthentication(): void {
  clearCredentials();
  byId<HTMLFormElement>("login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const username = byId<HTMLInputElement>("login-user").value.trim();
    const password = byId<HTMLInputElement>("login-password");
    if (username !== VALID_USERNAME || password.value !== VALID_PASSWORD) {
      byId("login-error").textContent = "Invalid username or password.";
      password.value = "";
      return password.focus();
    }
    showApplication(username);
  });

  byId("toggle-password").addEventListener("click", () => {
    const password = byId<HTMLInputElement>("login-password");
    const visible = password.type === "password";
    password.type = visible ? "text" : "password";
    const label = visible ? "Ocultar contraseña" : "Mostrar contraseña";
    byId("toggle-password").setAttribute("aria-label", label);
    byId("toggle-password").setAttribute("title", label);
    password.focus();
  });

  byId("logout-button").addEventListener("click", showLogin);
  window.addEventListener("pagehide", clearCredentials);
  requestAnimationFrame(() => byId<HTMLInputElement>("login-user").focus());
}
