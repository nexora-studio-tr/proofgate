# Third-party components

ProofGate's own code is MIT-licensed. Dependency code retains its own upstream license and attribution; the lockfiles identify exact versions. Dependencies are not relicensed by this repository.

- StrykerJS and its Vitest runner provide the mutation engine (Apache-2.0).
- Model Context Protocol TypeScript server/client libraries provide protocol integration (Apache-2.0).
- React, Radix UI, Fastify and Vitest retain their upstream licenses and notices.
- Node.js and Debian components in Docker images retain their respective licenses.

The source archive does not vendor these libraries; npm/Docker installation retains their package license files. ProofGate does not claim authorship of Stryker's mutation engine or certification/endorsement by OpenAI or Anthropic.
