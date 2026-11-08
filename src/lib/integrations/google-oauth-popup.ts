/** Opens this application's OAuth callback and waits for its same-origin result in the browser. */
export async function connectGoogleWorkspacePopup(
  start: (origin: string) => Promise<{ authorizationUrl: string }>,
): Promise<void> {
  const popup = window.open("", "wacrm-google-workspace", "width=600,height=720");
  if (!popup) throw new Error("Popup blocked. Allow popups and try again.");
  try {
    const { authorizationUrl } = await start(window.location.origin);
    const url = new URL(authorizationUrl);
    if (url.origin !== "https://accounts.google.com") throw new Error("Unexpected Google authorization URL");
    popup.location.href = url.href;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { window.removeEventListener("message", onMessage); clearInterval(timer); };
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin || event.source !== popup) return;
        if (event.data?.type !== "wacrm:google-workspace-oauth") return;
        cleanup(); popup.close();
        if (event.data.success === true) resolve();
        else reject(new Error("Google connection failed. Check the redirect URI and try again."));
      };
      window.addEventListener("message", onMessage);
      const timer = setInterval(() => {
        if (popup.closed) { cleanup(); reject(new Error("Google sign-in was cancelled")); }
      }, 500);
    });
  } catch (cause) {
    popup.close();
    throw cause;
  }
}
