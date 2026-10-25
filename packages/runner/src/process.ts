import { spawn } from 'node:child_process';
export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}
export async function command(
  file: string,
  args: string[],
  options: { cwd?: string; timeout?: number; signal?: AbortSignal; env?: NodeJS.ProcessEnv } = {},
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      ...(options.cwd ? { cwd: options.cwd } : {}),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env, DOCKER_CLI_HINTS: 'false' },
    });
    let stdout = '',
      stderr = '',
      bytes = 0,
      timedOut = false,
      overflow = false;
    const stop = () => {
      child.kill('SIGKILL');
    };
    const abort = () => stop();
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, options.timeout ?? 120000);
    const collect = (chunk: Buffer, which: 'out' | 'err') => {
      bytes += chunk.length;
      if (bytes > 4 * 1024 * 1024) {
        overflow = true;
        stop();
        return;
      }
      if (which === 'out') stdout += chunk.toString();
      else stderr += chunk.toString();
    };
    child.stdout.on('data', (c) => collect(c, 'out'));
    child.stderr.on('data', (c) => collect(c, 'err'));
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) stop();
    child.once('error', (e) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      reject(e);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      resolve({
        code: overflow ? 2 : (code ?? 2),
        stdout,
        stderr: overflow ? 'Output limit exceeded' : stderr,
        timedOut,
      });
    });
  });
}
export const docker = (args: string[], options: Parameters<typeof command>[2] = {}) =>
  command(process.env.PROOFGATE_DOCKER_BINARY ?? 'docker', args, options);
