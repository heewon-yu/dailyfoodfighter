// Render the public HTML routes into real static files for the /benefits/
// Cloudflare Pages/Jekyll subpath. The dynamic public /api/programs route is
// provided separately by Pages Functions and is not prerendered.
export const prerender = true;

// Stable directory output: build/index.html and build/privacy/index.html.
export const trailingSlash = 'always';
