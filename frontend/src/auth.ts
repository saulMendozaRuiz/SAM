import {
  resetNavigation,
} from "./navigation.ts";

const VALID_USERNAME = "user123";
const VALID_PASSWORD = "admin123";

function clearCredentialFields() {
  const usernameInput =
    document.getElementById("login-user");

  const passwordInput =
    document.getElementById(
      "login-password",
    );

  if (usernameInput) {
    usernameInput.value = "";
  }

  if (passwordInput) {
    passwordInput.value = "";
    passwordInput.type = "password";
  }

  const togglePassword =
    document.getElementById(
      "toggle-password",
    );

  if (togglePassword) {
    togglePassword.setAttribute(
      "aria-label",
      "Mostrar contraseña",
    );
    togglePassword.setAttribute(
      "title",
      "Mostrar contraseña",
    );
  }
}

function focusUsername() {
  window.requestAnimationFrame(() => {
    document
      .getElementById("login-user")
      ?.focus();
  });
}

function showMainApplication(username) {
  const loginScreen =
    document.getElementById(
      "login-screen",
    );

  const mainApplication =
    document.getElementById(
      "main-application",
    );

  const activeUser =
    document.getElementById(
      "active-user",
    );

  loginScreen.hidden = true;
  mainApplication.hidden = false;

  activeUser.textContent = username;

  resetNavigation();
  clearCredentialFields();
}

function showLogin() {
  const loginScreen =
    document.getElementById(
      "login-screen",
    );

  const mainApplication =
    document.getElementById(
      "main-application",
    );

  const loginError =
    document.getElementById(
      "login-error",
    );

  mainApplication.hidden = true;
  loginScreen.hidden = false;
  loginError.textContent = "";

  clearCredentialFields();
  focusUsername();
}

function initializeLoginForm() {
  const loginForm =
    document.getElementById(
      "login-form",
    );

  const usernameInput =
    document.getElementById(
      "login-user",
    );

  const passwordInput =
    document.getElementById(
      "login-password",
    );

  const loginError =
    document.getElementById(
      "login-error",
    );

  loginForm.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();

      const username =
        usernameInput.value.trim();

      const password =
        passwordInput.value;

      if (
        username !== VALID_USERNAME ||
        password !== VALID_PASSWORD
      ) {
        loginError.textContent =
          "Invalid username or password.";

        passwordInput.value = "";
        passwordInput.focus();

        return;
      }
      
      loginError.textContent = "";
      showMainApplication(username);

    },
  );
}


function initializePasswordToggle() {
  const passwordInput =
    document.getElementById(
      "login-password",
    );

  const togglePassword =
    document.getElementById(
      "toggle-password",
    );

  if (!passwordInput || !togglePassword) {
    return;
  }

  togglePassword.addEventListener(
    "click",
    () => {
      const shouldShow =
        passwordInput.type === "password";

      passwordInput.type =
        shouldShow
          ? "text"
          : "password";

      const label = shouldShow
        ? "Ocultar contraseña"
        : "Mostrar contraseña";

      togglePassword.setAttribute(
        "aria-label",
        label,
      );
      togglePassword.setAttribute(
        "title",
        label,
      );

      passwordInput.focus();
    },
  );
}

function initializeLogout() {
  const logoutButton =
    document.getElementById(
      "logout-button",
    );

  logoutButton.addEventListener(
    "click",
    () => {
      showLogin();
    },
  );
}

function initializeCredentialCleanup() {
  window.addEventListener(
    "pageshow",
    (event) => {
      const mainApplication =
        document.getElementById(
          "main-application",
        );

      if (
        event.persisted ||
        !mainApplication.hidden
      ) {
        return;
      }

      clearCredentialFields();
    },
  );

  window.addEventListener(
    "pagehide",
    clearCredentialFields,
  );
}

export function initializeAuthentication() {
  clearCredentialFields();
  initializeLoginForm();
  initializePasswordToggle();
  initializeLogout();
  initializeCredentialCleanup();
  focusUsername();
}