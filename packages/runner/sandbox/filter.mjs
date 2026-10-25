import { writeFileSync } from 'node:fs';
export const strykerPlugins = [
  {
    name: 'proofgate-budget',
    kind: 'Reporter',
    factory: () => ({
      onMutationTestingPlanReady(event) {
        const cap = Number(process.env.PROOFGATE_MUTANT_CAP);
        const count = event.mutantPlans.length;
        if (!Number.isInteger(cap) || cap < 1 || cap > 25 || count > cap) {
          console.error(
            'MUTATION_CAP_EXCEEDED: no mutants will execute; narrow the production-file scope',
          );
          process.exit(42);
        }
        writeFileSync('/scratch/scope.json', JSON.stringify({ selected: count, omitted: 0 }));
      },
    }),
  },
];
