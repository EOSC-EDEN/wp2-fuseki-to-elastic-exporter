// Repository IRIs match without fragment, host case or trailing slashes.
export const normalizeRepositoryIri = (iri: string): string => {
  try {
    const url = new URL(iri);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return iri.replace(/\/+$/, '');
  }
};
