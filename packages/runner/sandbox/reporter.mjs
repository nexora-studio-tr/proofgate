import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
export default class Reporter {
  onTestRunEnd(modules, errors) {
    const tests = [];
    const configFile = path.join(process.cwd(), 'proofgate.workspace.json');
    const workspace = existsSync(configFile)
      ? JSON.parse(readFileSync(configFile, 'utf8'))
      : undefined;
    const visit = (node, file) => {
      for (const child of node.children ?? []) {
        if (child.type === 'test') {
          const result = child.result();
          const errs = result.errors ?? [];
          const packagePath = workspace?.selected.find((m) => file.startsWith(m.path + '/'))?.path;
          if (workspace && !packagePath) throw Error('WORKSPACE_TEST_OUTSIDE_SELECTION');
          tests.push({
            name: workspace ? `${packagePath}::${file}::${child.fullName}` : child.fullName,
            ...(workspace ? { packagePath, file, fullName: child.fullName } : {}),
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
        } else visit(child, file);
      }
    };
    for (const m of modules)
      visit(m, path.relative(process.cwd(), m.moduleId).split(path.sep).join('/'));
    writeFileSync(
      '/scratch/result.json',
      JSON.stringify({ tests, errors: errors.map((e) => e.message ?? 'Unknown runner error') }),
    );
  }
}
