/**
 * Shared print rules and filenames for customer-facing quote / invoice documents.
 *
 * Two things went wrong with the quote download:
 *
 *  1. The public quote page (the link a customer actually receives) called
 *     `window.print()`, which prints the whole page and relies on `.no-print`
 *     to hide the app around it. Anything without that class — the page
 *     background, the card chrome, the browser's own URL/date headers — landed
 *     in the PDF, which is why it read as a screenshot of the app rather than a
 *     document. The internal quote page was already doing the right thing via
 *     `printDocument()`, so the two disagreed.
 *
 *  2. The print CSS was written inline in two places and had already drifted
 *     (A4/16mm in one, A4/14mm in the other). One constant now, so preview,
 *     print and PDF cannot diverge again.
 *
 * `printDocument()` clones only the printable root into an isolated iframe, so
 * these rules describe a bare document, not a page with an app around it.
 */

/**
 * Class marking the single element that IS the document.
 *
 * Everything outside it — navigation, tabs, action buttons, the accept/sign
 * panel, status controls — is simply not cloned, rather than being hidden by
 * an ever-growing list of `.no-print` selectors.
 */
export const PRINTABLE_DOCUMENT_CLASS = "quote-document";

/**
 * Print rules applied inside the isolated print frame.
 *
 * Deliberately conservative: it fixes page geometry and keeps blocks from
 * splitting badly, and does not restyle the document's own layout.
 */
export const DOCUMENT_PRINT_CSS = `
  @page {
    /* A4 is the default; Letter is narrower but taller, and a 14mm margin is
       inside the printable area of both, so one rule serves each without
       clipping. */
    size: A4;
    margin: 14mm;
  }

  html, body {
    background: #fff !important;
    margin: 0;
    padding: 0;
    /* The app may be in dark mode; a document is always light. */
    color-scheme: light;
  }

  /* Anything explicitly marked as app furniture, if it ever gets cloned. */
  .no-print { display: none !important; }

  .${PRINTABLE_DOCUMENT_CLASS} {
    box-shadow: none !important;
    border: 0 !important;
    border-radius: 0 !important;
    margin: 0 !important;
    /* No fixed height: a long quote must flow onto further pages, not clip. */
    max-width: none !important;
    width: 100% !important;
  }

  /* Keep a line item's wrapped description with its row. */
  tr { page-break-inside: avoid; break-inside: avoid; }

  /* Repeat the table header on every page of a long item list. */
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }

  /* The totals block and the signature must not be split across a page break. */
  .print-keep-together { page-break-inside: avoid; break-inside: avoid; }

  /* A logo should never push the header onto its own page. */
  img { max-width: 100%; }

  /* Underlines on links are noise in a printed document; the text stays. */
  a { text-decoration: none !important; color: inherit !important; }
`;

/**
 * Filename for a downloaded document.
 *
 * Browsers derive the "Save as PDF" suggestion from the print frame's
 * `document.title`, so this is set as the title rather than passed to a
 * download API.
 *
 * Unsafe and path-significant characters are replaced; a quote with no number
 * still gets a stable, non-empty name.
 */
export function documentFileName(prefix: string, reference: string | null | undefined): string {
  const cleaned = (reference ?? "")
    .normalize("NFKD")
    // Anything that is not a letter, digit, dot, dash or underscore — including
    // path separators, quotes and control characters — becomes a single dash.
    .replace(/[^\w.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return cleaned ? `${prefix}-${cleaned}` : prefix;
}

/** `quote-Q-1042`, which the browser saves as `quote-Q-1042.pdf`. */
export function quoteFileName(quoteNumber: string | null | undefined): string {
  return documentFileName("quote", quoteNumber);
}

/** `invoice-INV-0007`. */
export function invoiceFileName(invoiceNumber: string | null | undefined): string {
  return documentFileName("invoice", invoiceNumber);
}
