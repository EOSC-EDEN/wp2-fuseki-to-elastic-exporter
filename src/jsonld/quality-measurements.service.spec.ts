import { TestBed } from '@suites/unit';
import { QualityMeasurementsService } from './quality-measurements.service';

describe('QualityMeasurementsService', () => {
  let service: QualityMeasurementsService;

  beforeEach(async () => {
    const { unit } = await TestBed.solitary(
      QualityMeasurementsService,
    ).compile();
    service = unit;
  });

  const nodes = () => [
    {
      '@id': 'https://api.example.org/oai',
      '@type': ['dcat:DataService'],
      'dqv:hasQualityMeasurement': [
        'eden://validator/measurement/abc-valid',
        'eden://validator/measurement/abc-score',
      ],
    },
    {
      '@id': 'eden://validator/measurement/abc-valid',
      '@type': ['dqv:QualityMeasurement'],
      'dqv:isMeasurementOf': 'eden://validator/metric/endpointAvailability',
      'dqv:value': { '@value': 'true', '@type': 'xsd:boolean' },
      'prov:generatedAtTime': {
        '@value': '2026-08-20T07:40:07.893565+00:00',
        '@type': 'xsd:dateTime',
      },
    },
    {
      '@id': 'eden://validator/measurement/abc-score',
      '@type': ['dqv:QualityMeasurement'],
      'dqv:isMeasurementOf': 'eden://validator/metric/validationScore',
      'dqv:value': { '@value': '8.0', '@type': 'xsd:decimal' },
      'prov:generatedAtTime': {
        '@value': '2026-08-20T07:40:07.893565+00:00',
        '@type': 'xsd:dateTime',
      },
    },
    {
      '@id': 'eden://validator/metric/validationScore',
      '@type': ['dqv:Metric'],
    },
    {
      '@id': 'eden://validator/run/20260820T073953Z',
      '@type': ['prov:Activity'],
    },
  ];

  it('should fold measurement values onto the referencing document', () => {
    const [dataService] = service.fold(nodes());

    expect(dataService['_endpointAvailability']).toBe(true);
    expect(dataService['_validationScore']).toBe(8.0);
    expect(dataService['_validatedAt']).toBe('2026-08-20T07:40:07.893Z');
  });

  it('should drop measurement, metric and validation-run nodes', () => {
    const ids = service.fold(nodes()).map((n) => n['@id']);

    expect(ids).toEqual(['https://api.example.org/oai']);
  });

  it('should remove the raw measurement references', () => {
    const [dataService] = service.fold(nodes());

    expect(dataService['dqv:hasQualityMeasurement']).toBeUndefined();
  });

  it('should convert a false availability rather than dropping it', () => {
    const input = nodes();
    (input[1] as Record<string, unknown>)['dqv:value'] = {
      '@value': 'false',
      '@type': 'xsd:boolean',
    };

    const [dataService] = service.fold(input);

    expect(dataService['_endpointAvailability']).toBe(false);
  });

  it('should leave documents without measurements untouched', () => {
    const input = [
      { '@id': 'https://example.org/repo', '@type': ['dcat:Catalog'] },
    ];

    expect(service.fold(input)).toEqual(input);
  });

  it('should tolerate a reference to a missing measurement', () => {
    const input = [
      {
        '@id': 'https://api.example.org/oai',
        '@type': ['dcat:DataService'],
        'dqv:hasQualityMeasurement': ['eden://validator/measurement/gone'],
      },
    ];

    const [dataService] = service.fold(input);

    expect(dataService['_endpointAvailability']).toBeUndefined();
    expect(dataService['dqv:hasQualityMeasurement']).toBeUndefined();
  });
});
