# Harvester image

The registry is populated by the EOSC-EDEN repository harvester, which is built
here rather than consumed as a published image.

## Building

The harvester's own Dockerfile does not build from its default branch: its
requirements install `eden-service-validator` directly from git, and the
`python:3.12-slim` base image has no `git` binary.
`docker/harvester/Dockerfile.build-fix` adds that one build dependency and
changes nothing else, so the harvester checkout stays unmodified.

Build with the harvester checkout as the build context, tagging the release
version and `latest` together:

    docker build -f docker/harvester/Dockerfile.build-fix \
      -t dansknaw/eden-harvester:0.0.3 \
      -t dansknaw/eden-harvester:latest \
      ../wp2-repo-harvester

Bump the version tag on each rebuild and keep `latest` pointing at the same
image, which is what `docker-compose.yml` and the labs deployment expect.
Remove the override once the dependency is added upstream.

## Running a harvest

    docker compose up -d fuseki-backend redis fuseki
    docker compose run --rm harvester python harvest_all.py --limit 3

Omit `--limit` for a full harvest of every repository in the harvester's CSV.
Set `FAIRSHARING_USERNAME` and `FAIRSHARING_PASSWORD` to avoid records being
harvested without FAIRsharing metadata.

## What a harvest produces

Each repository yields one graph named
`eden://harvester/harmonized/<repository-url>`, alongside per-source graphs that
the exporter ignores. A harmonized graph holds the repository as a
`dcat:Catalog`, its services as `dcat:DataService`, and one
`dqv:QualityMeasurement` per validated endpoint recording endpoint availability
and a validation score. Confirm a harvest landed with:

    curl -s -u admin:admin -G http://localhost:3030/eden/sparql \
      --data-urlencode 'query=SELECT (COUNT(*) AS ?n) WHERE { GRAPH ?g { ?s a <http://www.w3.org/ns/dqv#QualityMeasurement> } }' \
      -H 'Accept: application/sparql-results+json'
