/**
 * Auth utilities — Google + magic link sign-in, nav avatar, post-redirect action replay.
 *
 * Supabase setup (one-time, in your Supabase dashboard):
 *  1. Authentication → Providers → Google → Enable, paste Client ID & Secret
 *  2. Authentication → Providers → Email → enabled by default
 *  3. Authentication → URL Configuration → add your site URL to "Redirect URLs"
 */

import { supabase } from "./db";

export interface AuthUser {
  id: string;
  email: string | undefined;
  name: string | undefined;
  avatarUrl: string | undefined;
}

export interface PendingAction {
  type: "like" | "bookmark";
  placeId: string;
}

const PENDING_KEY = "sf_pending_auth_action";
const SYNC_KEY = "sf_synced_uid";

// ── Pending action (survives OAuth / magic-link redirect) ─────────────────────

export function savePendingAction(action: PendingAction): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(action));
}

export function consumePendingAction(): PendingAction | null {
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_KEY);
  try {
    return JSON.parse(raw) as PendingAction;
  } catch {
    return null;
  }
}

// ── Auth state ─────────────────────────────────────────────────────────────────

export async function getUser(): Promise<AuthUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name as string | undefined,
    avatarUrl: user.user_metadata?.avatar_url as string | undefined,
  };
}

export async function signInWithGoogle(): Promise<void> {
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href },
  });
}

export async function signInWithMagicLink(
  email: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** True if this device's guest data has already been synced for this user. */
export function isGuestSynced(userId: string): boolean {
  return localStorage.getItem(SYNC_KEY) === userId;
}

export function markGuestSynced(userId: string): void {
  localStorage.setItem(SYNC_KEY, userId);
}

// ── Shared modal builder ──────────────────────────────────────────────────────

const GOOGLE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
</svg>`;

function buildModal(
  pendingAction: PendingAction | null,
  resolve?: (val: "guest") => void,
  action?: "like" | "bookmark"
): void {
  const verb = action === "like" ? "like" : action === "bookmark" ? "save" : null;
  const icon = action === "like" ? "♡" : action === "bookmark" ? "🔖" : "✉️";
  const title = verb ? `Sign in to ${verb}` : "Sign in";

  const overlay = document.createElement("div");
  overlay.className = "auth-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  function close(): void {
    overlay.classList.remove("auth-overlay--visible");
    setTimeout(() => overlay.remove(), 300);
    resolve?.("guest");
  }

  function bindClose(): void {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector(".auth-modal-close")?.addEventListener("click", close);
  }

  function showSentState(email: string): void {
    overlay.querySelector(".auth-modal")!.innerHTML = `
      <button class="auth-modal-close" aria-label="Close">&times;</button>
      <div class="auth-modal-icon">📬</div>
      <h2 class="auth-modal-title">Check your email</h2>
      <p class="auth-modal-desc">
        We sent a magic link to <strong>${email}</strong>.<br>
        Click it to sign in — then come back here.
      </p>
      <p class="auth-modal-note">Didn't get it? Check your spam folder.</p>`;
    bindClose();
  }

  function showFormState(): void {
    overlay.innerHTML = `
      <div class="auth-modal">
        <button class="auth-modal-close" aria-label="Close">&times;</button>
        <div class="auth-modal-icon">${icon}</div>
        <h2 class="auth-modal-title">${title}</h2>
        <p class="auth-modal-desc">
          ${
            verb
              ? `Sign in to keep your ${verb === "like" ? "likes" : "saves"} across every device.
                 Or continue as a guest — your picks are stored locally.`
              : "Sign in to sync your likes and saves across devices."
          }
        </p>
        <div class="auth-modal-actions">
          <button class="auth-btn auth-btn-google" id="auth-google-btn">
            ${GOOGLE_ICON}
            Continue with Google
          </button>
          <div class="auth-divider"><span>or</span></div>
          <div class="auth-email-group">
            <input
              class="auth-email-input"
              id="auth-email-input"
              type="email"
              placeholder="your@email.com"
              autocomplete="email"
              inputmode="email"
            />
            <button class="auth-btn auth-btn-primary" id="auth-send-btn">
              Send magic link
            </button>
          </div>
          ${verb ? `<button class="auth-btn auth-btn-guest" id="auth-guest-btn">Continue as guest</button>` : ""}
        </div>
        <p class="auth-modal-note">
          No password needed.${verb ? " Guest activity syncs when you sign in later." : ""}
        </p>
      </div>`;

    requestAnimationFrame(() => overlay.classList.add("auth-overlay--visible"));
    bindClose();

    overlay.querySelector("#auth-guest-btn")?.addEventListener("click", close);

    overlay.querySelector("#auth-google-btn")!.addEventListener("click", () => {
      if (pendingAction) savePendingAction(pendingAction);
      void signInWithGoogle();
    });

    const sendBtn = overlay.querySelector<HTMLButtonElement>("#auth-send-btn")!;
    const emailInput =
      overlay.querySelector<HTMLInputElement>("#auth-email-input")!;

    async function handleSend(): Promise<void> {
      const email = emailInput.value.trim();
      if (!email || !email.includes("@")) {
        emailInput.classList.add("auth-email-input--error");
        emailInput.focus();
        return;
      }
      emailInput.classList.remove("auth-email-input--error");
      sendBtn.textContent = "Sending…";
      sendBtn.disabled = true;

      if (pendingAction) savePendingAction(pendingAction);

      const { error } = await signInWithMagicLink(email);
      if (error) {
        sendBtn.textContent = "Send magic link";
        sendBtn.disabled = false;
        emailInput.classList.add("auth-email-input--error");
        let errEl = overlay.querySelector<HTMLElement>(".auth-send-error");
        if (!errEl) {
          errEl = document.createElement("p");
          errEl.className = "auth-send-error";
          sendBtn.after(errEl);
        }
        errEl.textContent = error;
        return;
      }

      showSentState(email);
    }

    sendBtn.addEventListener("click", () => void handleSend());
    emailInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void handleSend();
    });
  }

  document.body.appendChild(overlay);
  showFormState();
}

// ── Login modal (triggered by like/bookmark when logged out) ──────────────────

/**
 * Show the login bottom-sheet.
 * Returns 'guest' when the user dismisses or chooses "Continue as guest".
 */
export function showLoginModal(
  action: "like" | "bookmark",
  pendingAction: PendingAction
): Promise<"guest"> {
  return new Promise((resolve) => {
    buildModal(pendingAction, resolve, action);
  });
}

// ── Standalone sign-in modal (nav "Sign in" click) ────────────────────────────

export function showSignInModal(): void {
  buildModal(null);
}

// ── Nav user pill ─────────────────────────────────────────────────────────────

/**
 * Inject a user avatar (logged in) or "Sign in" pill (logged out) into the nav.
 * Safe to call multiple times — replaces any previous element.
 */
export function renderNavUser(user: AuthUser | null): void {
  document.getElementById("nav-user-btn")?.remove();

  const nav = document.querySelector<HTMLElement>(".nav");
  if (!nav) return;

  if (user) {
    const btn = document.createElement("button");
    btn.id = "nav-user-btn";
    btn.className = "nav-user-btn";
    btn.title = `${user.name ?? user.email ?? "Account"} — click to sign out`;
    btn.innerHTML = user.avatarUrl
      ? `<img src="${user.avatarUrl}" class="nav-avatar" alt="${user.name ?? "Profile"}" referrerpolicy="no-referrer">`
      : `<span class="nav-avatar nav-avatar--initials">${(user.name ?? user.email ?? "?")[0].toUpperCase()}</span>`;

    btn.addEventListener("click", async () => {
      if (confirm("Sign out of Street Food India?")) {
        await signOut();
        location.reload();
      }
    });
    nav.appendChild(btn);
  } else {
    const a = document.createElement("a");
    a.id = "nav-user-btn";
    a.className = "nav-user-btn";
    a.href = "#";
    a.title = "Sign in";
    a.innerHTML = `<span class="nav-signin-label">Sign in</span>`;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      showSignInModal();
    });
    nav.appendChild(a);
  }
}
