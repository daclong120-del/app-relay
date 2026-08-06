// Safe Bounded Process Executor using child_process.spawn

import { spawn, SpawnOptions } from 'child_process';

export interface SafeExecOptions {
  cwd?: string;
  timeoutMs?: number;
  maxBufferBytes?: number;
  env?: Record<string, string>;
}

export interface SafeExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export async function safeExec(
  executable: string,
  args: string[],
  options?: SafeExecOptions
): Promise<SafeExecResult> {
  const timeoutMs = options?.timeoutMs || 30000;
  const maxBufferBytes = options?.maxBufferBytes || 1024 * 1024; // 1MB buffer cap

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const spawnOpts: SpawnOptions = {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env },
      shell: false, // Disallow shell evaluation
    };

    const child = spawn(executable, args, spawnOpts);

    let stdout = '';
    let stderr = '';
    let stdoutOverflow = false;
    let stderrOverflow = false;

    let timer: NodeJS.Timeout | null = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 2000);
        reject(new Error(`Process execution timed out after ${timeoutMs}ms: ${executable} ${args.join(' ')}`));
      }, timeoutMs);
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < maxBufferBytes) {
        stdout += chunk.toString('utf-8');
      } else {
        stdoutOverflow = true;
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < maxBufferBytes) {
        stderr += chunk.toString('utf-8');
      } else {
        stderrOverflow = true;
      }
    });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(new Error(`Failed to start process ${executable}: ${err.message}`));
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      resolve({
        stdout: stdoutOverflow ? stdout + '\n[STDOUT_TRUNCATED]' : stdout,
        stderr: stderrOverflow ? stderr + '\n[STDERR_TRUNCATED]' : stderr,
        exitCode: code ?? -1,
        durationMs,
      });
    });
  });
}
