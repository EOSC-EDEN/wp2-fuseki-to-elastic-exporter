type JsonLdNode = Record<string, unknown>;

/**
 * Temporary compatibility data derived from
 * fidelis-import/out/fidelis-registry.trig (2026-06-11).
 *
 * The harmonized graph will eventually provide these memberships. Until then,
 * the exporter adds them only when a repository has no graph-provided
 * trsp:hasApplicableProfile value. Delete this module when the harmonizer owns
 * that predicate.
 */
const MEMBERSHIPS: Readonly<Record<string, readonly string[]>> = {
  'https://arche.acdh.oeaw.ac.at/browser': ['trsp:profile.3C2D6C1C37'],
  'https://infraart.inoe.ro': ['trsp:profile.3C2D6C1C37'],
  'https://dais.sanu.ac.rs': [
    'trsp:profile.39A738E4E3',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://rdr.kuleuven.be': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.3E1A5A4B73',
  ],
  'https://dataverse.csuc.cat': ['trsp:profile.3C2D6C1C37'],
  'https://phaidra.cab.unipd.it': ['trsp:profile.3C2D6C1C37'],
  'https://www.clarin.eu/content/national-consortia': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.5C32EF8367',
  ],
  'https://registry.dome-ml.org/intro': ['trsp:profile.3C2D6C1C37'],
  'https://qdr.syr.edu': ['trsp:profile.3C2D6C1C37', 'trsp:profile.7254507349'],
  'https://dans.knaw.nl/nl/life-sciences': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.4B12A4A8E3',
  ],
  'https://radar.brookes.ac.uk': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.54A6CD95F4',
  ],
  'https://gude.uni-frankfurt.de/home': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.5F8F8C0526',
  ],
  'https://cds.unistra.fr': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.7B721A758B',
  ],
  'https://radar.ibiss.bg.ac.rs': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.610A896E75',
  ],
  'https://www.crossda.hr': [
    'trsp:profile.31C7106603',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://data.crossda.hr': [
    'trsp:profile.31C7106603',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://lida.dataverse.lt': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.5E53C20361',
  ],
  'https://repo.researchdata.hu': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.67700E6E2B',
  ],
  'https://www.fsd.tuni.fi/en': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.66B58B3D2D',
  ],
  'https://fiver.ifvcns.rs': ['trsp:profile.3C2D6C1C37'],
  'https://morpheus.gitlab.io/model': ['trsp:profile.3C2D6C1C37'],
  'https://about.coscine.de': [
    'trsp:profile.046B279494',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://cris.uns.ac.rs/en': ['trsp:profile.3C2D6C1C37'],
  'https://zenodo.org/communities/homeros/records?q=&l=list&p=1&s=10&sort=newest':
    ['trsp:profile.3C2D6C1C37'],
  'https://edatos.consorciomadrono.es': ['trsp:profile.3C2D6C1C37'],
  'https://riunet.upv.es/home': ['trsp:profile.3C2D6C1C37'],
  'https://sikt.no/en/archiving-research-data': [
    'trsp:profile.29A444BA70',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://www.granthub.cz': ['trsp:profile.3C2D6C1C37'],
  'https://dataverse.no/dataverse/trolling': ['trsp:profile.3C2D6C1C37'],
  'https://dass.credi.ba': [
    'trsp:profile.0180636A61',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://site.uit.no/dataverseno': [
    'trsp:profile.1798E19839',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://www.storedb.org/store_v3': [
    'trsp:profile.18D00D3332',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://data.sciencespo.fr/dataverse/cdsp': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.4E16B3E617',
  ],
  'https://recherche.data.gouv.fr/en/page/about-recherche-data-gouv': [
    'trsp:profile.27DEC264D7',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://anc.plus.ac.at/index.html': [
    'trsp:profile.39DF75675C',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://glittr.org': ['trsp:profile.226704C31B', 'trsp:profile.3C2D6C1C37'],
  'https://data.dtu.dk': ['trsp:profile.29A21B39F5', 'trsp:profile.3C2D6C1C37'],
  'https://pangaea.de': ['trsp:profile.0589F80CF6', 'trsp:profile.3C2D6C1C37'],
  'https://lindat.mff.cuni.cz': [
    'trsp:profile.3725515E46',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://sasd.sav.sk/en': [
    'trsp:profile.298D90251D',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://www.kielipankki.fi/language-bank': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.4BAE18BFED',
  ],
  'https://www.wdc-climate.de/ui': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.79BBDA6F70',
  ],
  'https://data.ru.nl': ['trsp:profile.3C2D6C1C37'],
  'https://www.fairdata.fi': [
    'trsp:profile.1DF058A6F6',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://borealisdata.ca': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.4B0F63A94A',
  ],
  'https://cer.ihtm.bg.ac.rs': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.67FF569AA0',
  ],
  'https://agroportal.eu': [
    'trsp:profile.245EF9D7AE',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://opendata.nas.gov.ua': [
    'trsp:profile.235D1D5D91',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://datashare.ed.ac.uk': ['trsp:profile.3C2D6C1C37'],
  'https://www.gesis.org/en/data-services/share-data': [
    'trsp:profile.3C2D6C1C37',
  ],
  'http://www.pist.tn': ['trsp:profile.3C2D6C1C37'],
  'https://string-db.org': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.7A31FBDEE1',
  ],
  'https://asap.epfl.ch': ['trsp:profile.3C2D6C1C37'],
  'https://www.ortolang.fr/en/home': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.7996C467D4',
  ],
  'https://ukdataservice.ac.uk/about': [
    'trsp:profile.1B6B7677B4',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://www.rohub.org': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.408BAAA2BA',
  ],
  'https://data.esrf.fr': ['trsp:profile.3C2D6C1C37'],
  'https://www.socib.es/en/what-we-do/metocean-data/socib-data-repository': [
    'trsp:profile.3C2D6C1C37',
  ],
  'https://dv.dataverse.lv/dataverse/root': [
    'trsp:profile.0CBE4E6DFC',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://data.4tu.nl': ['trsp:profile.1AA258A562', 'trsp:profile.3C2D6C1C37'],
  'https://library.camtree.org/home': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.644820F945',
  ],
  'https://www.mylaminin.net': ['trsp:profile.3C2D6C1C37'],
  'https://www.adp.fdv.uni-lj.si': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.6668C83282',
  ],
  'https://data.utm.csic.es': ['trsp:profile.3C2D6C1C37'],
  'https://disprot.org': ['trsp:profile.3C2D6C1C37'],
  'https://dans.knaw.nl/nl/social-sciences-and-humanities': [
    'trsp:profile.3C2D6C1C37',
    'trsp:profile.552C7DD5F0',
  ],
  'https://rivec.institut-palanka.rs': [
    'trsp:profile.007276AA14',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://www.swissubase.ch': ['trsp:profile.3C2D6C1C37'],
  'https://www.swissubase.ch/en': ['trsp:profile.3C2D6C1C37'],
  'https://datarepositorium.uminho.pt': [
    'trsp:profile.346AA2D576',
    'trsp:profile.3C2D6C1C37',
  ],
  'https://www.cessda.eu/Strategy-Expertise/Trust-and-Standards': [
    'trsp:profile.3C2D6C1C37',
  ],
};

const normalizeRepositoryIri = (iri: string): string => {
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

export const addProfileMembershipFallback = (
  nodes: JsonLdNode[],
): JsonLdNode[] =>
  nodes.map((node) => {
    if (node['trsp:hasApplicableProfile'] != null) return node;

    const categories = node['_category'];
    if (!Array.isArray(categories) || !categories.includes('repository')) {
      return node;
    }

    const id = node['@id'];
    if (typeof id !== 'string') return node;

    const memberships = MEMBERSHIPS[normalizeRepositoryIri(id)];
    if (!memberships) return node;

    return { ...node, 'trsp:hasApplicableProfile': [...memberships] };
  });
