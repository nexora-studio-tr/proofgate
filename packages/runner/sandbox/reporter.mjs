import { writeFileSync } from 'node:fs';
export default class Reporter {
  onTestRunEnd(modules, errors) {
    const tests = [];
    const visit = (node) => {
      for (const child of node.children ?? []) {
        if (child.type === 'test') {
          const result = child.result();
          const errs = result.errors ?? [];
          tests.push({
            name: child.fullName,
            status:
              result.state === 'passed'
                ? 'passed'
                : result.state === 'failed'
                  ? 'failed'
                  : 'skipped',
            message: errs.map((e) => e.message ?? '').join('\n'),
            assertion: errs.some(
              (e) =>
                e.name === 'AssertionError' ||
                e.name === 'AssertionError [ERR_ASSERTION]' ||
                e.name === 'ChaiError',
            ),
          });
        } else visit(child);
      }
    };
    for (const m of modules) visit(m);
    writeFileSync(
      '/scratch/result.json',
      JSON.stringify({ tests, errors: errors.map((e) => e.message ?? 'Unknown runner error') }),
    );
  }
}
