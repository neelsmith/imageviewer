import { checkPassword, isAuthEnabled, isRemembered, remember, type AuthConfig } from "../lib/auth";

/** Resolves once the viewer has entered the right password (or none is set). */
export function passwordGate(root: HTMLElement, cfg: AuthConfig): Promise<void> {
  if (!isAuthEnabled(cfg) || isRemembered(cfg)) return Promise.resolve();
  return new Promise((resolve) => {
    const form = document.createElement("form");
    form.className = "gate";
    form.innerHTML = `
      <h1>Image Viewer</h1>
      <label for="gate-pw">Password</label>
      <input id="gate-pw" type="password" autocomplete="current-password" required autofocus>
      <label class="remember"><input type="checkbox" checked> Remember on this device</label>
      <button type="submit">Open</button>
      <p class="gate-msg" role="alert"></p>`;
    const input = form.querySelector<HTMLInputElement>("#gate-pw")!;
    const keep = form.querySelector<HTMLInputElement>(".remember input")!;
    const button = form.querySelector("button")!;
    const msg = form.querySelector<HTMLElement>(".gate-msg")!;
    root.replaceChildren(form);
    input.focus();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      button.disabled = true;
      msg.textContent = "Checking…";
      try {
        if (await checkPassword(input.value, cfg)) {
          if (keep.checked) remember(cfg);
          resolve();
          return;
        }
        msg.textContent = "Wrong password.";
        input.select();
      } catch (err) {
        msg.textContent = (err as Error).message;
      } finally {
        button.disabled = false;
      }
    });
  });
}
