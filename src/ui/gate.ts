import { versionInfo } from "../lib/version";
import { checkPassword, isAuthEnabled, isRemembered, remember, type AuthConfig } from "../lib/auth";

export interface GateOptions {
  /** Heading (default "Image Viewer"). */
  title?: string;
  /** localStorage key for "remember on this device" (default: the family.html key). */
  storageKey?: string;
  /** When set, a button with this text resolves the gate with false. */
  cancelLabel?: string;
}

/**
 * Resolves true once the viewer has entered the right password (or none is set, or
 * it's remembered on this device); false if they press the cancel button.
 */
export function passwordGate(root: HTMLElement, cfg: AuthConfig, opts: GateOptions = {}): Promise<boolean> {
  if (!isAuthEnabled(cfg) || isRemembered(cfg, undefined, opts.storageKey)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const form = document.createElement("form");
    form.className = "gate";
    form.innerHTML = `
      <h1></h1>
      <label for="gate-pw">Password</label>
      <input id="gate-pw" type="password" autocomplete="current-password" required autofocus>
      <label class="remember"><input type="checkbox" checked> Remember on this device</label>
      <button type="submit">Open</button>
      <p class="gate-msg" role="alert"></p>`;
    const input = form.querySelector<HTMLInputElement>("#gate-pw")!;
    const keep = form.querySelector<HTMLInputElement>(".remember input")!;
    const button = form.querySelector("button")!;
    const msg = form.querySelector<HTMLElement>(".gate-msg")!;
    form.querySelector("h1")!.textContent = opts.title ?? "Image Viewer";
    if (opts.cancelLabel) {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "gate-cancel";
      cancel.textContent = opts.cancelLabel;
      cancel.addEventListener("click", () => resolve(false));
      button.after(cancel);
    }
    form.append(versionInfo());
    root.replaceChildren(form);
    input.focus();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      button.disabled = true;
      msg.textContent = "Checking…";
      try {
        if (await checkPassword(input.value, cfg)) {
          if (keep.checked) remember(cfg, undefined, opts.storageKey);
          resolve(true);
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
