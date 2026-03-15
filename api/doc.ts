export const config = { runtime: 'edge' };

const DOCS: Record<string, string> = {
  terms:
    'https://docs.google.com/document/u/1/d/e/2PACX-1vR3WT8LdUgwYcrOYHqz-LSxc1jOXJI3igzbTtmzcVEhPrFVluFyidroOQrfkkeRa88A2OXNiMd5CAj3/pub',
  privacy:
    'https://docs.google.com/document/u/1/d/e/2PACX-1vSYhg-Z6OyDEaEn-iVDNsEkahSLb8nId3-DLLa5wcn-ZRYHVaUB-Gm-eNwnjiHNctXCYyFU5wLovfdN/pub',
};

/**
 * CSS injected into every document page.
 * Targets both the ?embedded=true minimal layout and the full published layout.
 */
const STYLE = `
<style id="neoke-overrides">
  *, *::before, *::after { box-sizing: border-box; }

  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #ffffff !important;
    overflow-x: hidden !important;
    -webkit-text-size-adjust: 100%;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
      'Helvetica Neue', Arial, sans-serif !important;
    font-size: 15px !important;
    line-height: 1.7 !important;
    color: #1c1c1e !important;
  }

  /* ── Hide all Google chrome ── */
  #header, .docs-header-container,
  .kix-appview-toolbar, .docs-toolbar-wrapper,
  #docs-toolbar, .gb_Ie, .gb_Na, .gb_d,
  .docs-material-tab-bar, .goog-toolbar,
  .gb_1d, .gb_2d, .gb_3d,
  [role="banner"] { display: none !important; }

  /* ── Remove page/paper shadow ── */
  .kix-page, .kix-page-paginated,
  .kix-rotatingtilemanager-content,
  .tyW0pd, [class*="tyW0pd"],
  .doc-content > div > div {
    box-shadow: none !important;
    border: none !important;
    margin: 0 auto !important;
    max-width: 100% !important;
    width: 100% !important;
    padding: 0 !important;
  }

  /* ── Main content wrapper ── */
  #contents, .doc-content {
    padding: 20px 18px 48px !important;
    max-width: 100% !important;
  }

  /* ── Typography ── */
  h1 {
    font-size: 21px !important;
    font-weight: 700 !important;
    color: #1c1c1e !important;
    margin: 28px 0 10px !important;
    line-height: 1.3 !important;
  }
  h2 {
    font-size: 17px !important;
    font-weight: 600 !important;
    color: #1c1c1e !important;
    margin: 22px 0 6px !important;
    line-height: 1.4 !important;
  }
  h3 {
    font-size: 15px !important;
    font-weight: 600 !important;
    color: #3a3a3c !important;
    margin: 16px 0 4px !important;
  }
  p {
    margin: 6px 0 !important;
    color: #3a3a3c !important;
  }
  li {
    margin: 4px 0 !important;
    color: #3a3a3c !important;
  }
  ul, ol {
    padding-left: 20px !important;
  }
  a {
    color: #5B4FE9 !important;
    text-decoration: underline !important;
  }

  /* Google's span-level styles — let our body font-size win */
  span {
    font-size: inherit !important;
  }
</style>
`;

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? '';
  const docUrl = DOCS[type];

  if (!docUrl) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const upstream = await fetch(`${docUrl}?embedded=true`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Neoke/1.0)' },
    });

    if (!upstream.ok) {
      return new Response('Failed to load document', { status: 502 });
    }

    let html = await upstream.text();

    // Inject our styles right before </head>
    html = html.includes('</head>')
      ? html.replace('</head>', `${STYLE}</head>`)
      : STYLE + html;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Cache 10 min at edge — documents don't change that often
        'Cache-Control': 'public, max-age=600, s-maxage=600',
      },
    });
  } catch {
    return new Response('Failed to load document', { status: 502 });
  }
}
