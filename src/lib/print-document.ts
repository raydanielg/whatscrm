import { DOCUMENT_PRINT_CSS } from "@/lib/billing/document-print";

export interface PrintDocumentOptions {
  /**
   * Title for the print frame. Browsers use it as the suggested "Save as PDF"
   * filename, so this is how a download becomes `quote-Q-1042.pdf` instead of
   * the app's page title.
   */
  title?: string;
}

/**
 * Print only the requested document, including its styles, without the app shell.
 *
 * The element matched by `selector` is cloned into an isolated iframe whose body
 * contains nothing else, so navigation, tabs, action buttons and the page
 * background cannot reach the PDF — they are never copied, rather than being
 * hidden by `.no-print` selectors that have to be remembered for every new
 * control.
 */
export async function printDocument(
  selector: string,
  options: PrintDocumentOptions = {},
): Promise<void> {
  const source = document.querySelector<HTMLElement>(selector);
  if (!source) throw new Error("Open the document preview before printing.");
  const frame = document.createElement("iframe");
  frame.title = "Document print preview";
  frame.style.cssText = "position:fixed;width:1px;height:1px;right:0;bottom:0;border:0";
  document.body.appendChild(frame);
  const target = frame.contentDocument!;
  target.open();
  target.write("<!doctype html><html><head></head><body></body></html>");
  target.close();
  target.title = options.title ?? document.title;
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'));
  const ready = styles.map((style) => {
    const copy = style.cloneNode(true) as HTMLElement;
    const loaded =
      copy.tagName === "LINK"
        ? new Promise<void>((resolve) => {
            copy.onload = () => resolve();
            copy.onerror = () => resolve();
          })
        : Promise.resolve();
    target.head.appendChild(copy);
    return loaded;
  });

  // Appended after the app's stylesheets so the document rules win: the app may
  // be in dark mode, and a printed document is always a light page.
  const printRules = target.createElement("style");
  printRules.setAttribute("data-document-print", "true");
  printRules.textContent = DOCUMENT_PRINT_CSS;
  target.head.appendChild(printRules);

  target.documentElement.style.cssText = document.documentElement.style.cssText;
  target.body.appendChild(source.cloneNode(true));
  await Promise.all(ready);
  await target.fonts?.ready;
  await Promise.all(Array.from(target.images).map((img) => img.decode().catch(() => {})));
  frame.contentWindow!.addEventListener("afterprint", () => frame.remove(), { once: true });
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
}
