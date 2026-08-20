import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FUSEKI_CONFIG_KEY, type FusekiConfig } from '../config';

@Injectable()
export class FusekiService {
  private readonly endpoint: string;
  private readonly authHeaders: Record<string, string>;

  constructor(private readonly configService: ConfigService) {
    const fusekiConfig =
      this.configService.get<FusekiConfig>(FUSEKI_CONFIG_KEY);
    this.endpoint = fusekiConfig!.FUSEKI_ENDPOINT;

    if (fusekiConfig!.FUSEKI_USERNAME) {
      const credentials = Buffer.from(
        `${fusekiConfig!.FUSEKI_USERNAME}:${fusekiConfig!.FUSEKI_PASSWORD ?? ''}`,
      ).toString('base64');
      this.authHeaders = { Authorization: `Basic ${credentials}` };
    } else {
      this.authHeaders = {};
    }
  }

  async listNamedGraphs(): Promise<string[]> {
    const query = 'SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s ?p ?o } }';
    const url = `${this.endpoint}/sparql?query=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/sparql-results+json',
        ...this.authHeaders,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to list named graphs: ${response.status} ${response.statusText}`,
      );
    }

    const json = (await response.json()) as {
      results: { bindings: Array<{ g: { value: string } }> };
    };

    return json.results.bindings.map((binding) => binding.g.value);
  }

  // A cheap per-graph change signal. One grouped count replaces fetching every
  // graph in full just to hash it. A triple count does not detect an edit that
  // replaces a value while leaving the count unchanged; the Redis event stream
  // covers that case in real time, so reconciliation only has to catch what was
  // missed while the service was down.
  async graphFingerprints(): Promise<Map<string, string>> {
    const query =
      'SELECT ?g (COUNT(*) AS ?triples) WHERE { GRAPH ?g { ?s ?p ?o } } GROUP BY ?g';
    const url = `${this.endpoint}/sparql?query=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/sparql-results+json',
        ...this.authHeaders,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch graph fingerprints: ${response.status} ${response.statusText}`,
      );
    }

    const json = (await response.json()) as {
      results: {
        bindings: Array<{ g: { value: string }; triples: { value: string } }>;
      };
    };

    return new Map(
      json.results.bindings.map((binding) => [
        binding.g.value,
        binding.triples.value,
      ]),
    );
  }

  // Uses the Graph Store Protocol (not SPARQL) to retrieve an entire named
  // graph as a single JSON-LD document it is more efficient than a CONSTRUCT query.
  async fetchGraph(graphUri: string): Promise<object> {
    const url = `${this.endpoint}/data?graph=${encodeURIComponent(graphUri)}`;

    const response = await fetch(url, {
      headers: { Accept: 'application/ld+json', ...this.authHeaders },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch graph ${graphUri}: ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as object;
  }

  // Fetches specific resources from a graph using a CONSTRUCT query.
  // Includes one level of blank node properties so the flatten pipeline can embed them.
  async fetchResources(
    graphUri: string,
    subjectUris: string[],
  ): Promise<object> {
    const valuesClause = subjectUris.map((uri) => `<${uri}>`).join(' ');
    const query = `
      CONSTRUCT { ?s ?p ?o . ?bnode ?bp ?bo }
      WHERE {
        GRAPH <${graphUri}> {
          VALUES ?s { ${valuesClause} }
          ?s ?p ?o .
          OPTIONAL {
            FILTER(isBlank(?o))
            BIND(?o AS ?bnode)
            ?bnode ?bp ?bo .
          }
        }
      }
    `;

    const url = `${this.endpoint}/sparql?query=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/ld+json', ...this.authHeaders },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch resources from graph ${graphUri}: ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as object;
  }
}
