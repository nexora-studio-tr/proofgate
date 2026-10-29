import { strykerPlugins as official } from '/opt/proofgate/node_modules/@stryker-mutator/vitest-runner/dist/src/index.js';
import { prepareWorkspace } from './workspace-bootstrap.mjs';

function factory(injector) {
  const plugin = official.find((p) => p.kind === 'TestRunner' && p.name === 'vitest');
  if (!plugin?.factory) throw Error('WORKSPACE_VITEST_FACTORY_UNSUPPORTED');
  const delegate = plugin.factory(injector);
  return {
    capabilities: () => delegate.capabilities(),
    async init() {
      if (!process.cwd().startsWith('/scratch/stryker/'))
        throw Error('WORKSPACE_MUTATION_ROOT_REQUIRED');
      await prepareWorkspace(process.cwd());
      await delegate.init?.();
    },
    dryRun: (o) => delegate.dryRun(o),
    mutantRun: (o) => delegate.mutantRun(o),
    dispose: () => delegate.dispose?.(),
  };
}
factory.inject = ['$injector'];
export const strykerPlugins = [{ kind: 'TestRunner', name: 'proofgate-workspace-vitest', factory }];
