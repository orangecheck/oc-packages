import { logoScript } from './logo';

/**
 * The logo switch, for the document's head (a site's _document). It sets
 * data-oc-logo on <html> before the body paints. `FontPreloads` renders it, so
 * a site that renders that has this.
 */
export function LogoScript() {
    return <script dangerouslySetInnerHTML={{ __html: logoScript() }} />;
}
