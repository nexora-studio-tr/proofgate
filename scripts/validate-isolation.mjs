import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { docker } from '../dist/packages/runner/src/process.js';
import { imageId } from '../dist/packages/runner/src/index.js';
const name = 'proofgate-isolation-' + randomUUID(),
  image = await imageId();
const probe = `const fs=require('fs'),net=require('net');(async()=>{const out={uid:process.getuid(),rootWrite:false,inputWrite:false,dockerSocket:fs.existsSync('/var/run/docker.sock'),secret:!!process.env.OPENAI_API_KEY,capabilities:fs.readFileSync('/proc/self/status','utf8').match(/CapEff:\\s*(\\w+)/)[1],memory:fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(),pids:fs.readFileSync('/sys/fs/cgroup/pids.max','utf8').trim()};try{fs.writeFileSync('/opt/proofgate/probe','x');out.rootWrite=true}catch{}try{fs.writeFileSync('/input/probe','x');out.inputWrite=true}catch{}out.network=await new Promise(r=>{const s=net.connect(80,'203.0.113.1');s.setTimeout(700);s.on('connect',()=>{s.destroy();r(true)});s.on('error',()=>r(false));s.on('timeout',()=>{s.destroy();r(false)});});console.log(JSON.stringify(out));})()`;
try {
  const created = await docker([
    'create',
    '--name',
    name,
    '--label',
    'app.proofgate.isolation=true',
    '--network',
    'none',
    '--read-only',
    '--user',
    '1000:1000',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--cpus',
    '2',
    '--memory',
    '2g',
    '--memory-swap',
    '2g',
    '--pids-limit',
    '256',
    '--tmpfs',
    '/scratch:rw,exec,nosuid,size=268435456,uid=1000,gid=1000',
    '--entrypoint',
    'node',
    image,
    '-e',
    probe,
  ]);
  assert.equal(created.code, 0, created.stderr);
  const result = await docker(['start', '-a', name]);
  assert.equal(result.code, 0, result.stderr);
  const observed = JSON.parse(result.stdout.trim());
  assert.equal(observed.uid, 1000);
  assert.equal(observed.rootWrite, false);
  assert.equal(observed.inputWrite, false);
  assert.equal(observed.dockerSocket, false);
  assert.equal(observed.secret, false);
  assert.equal(observed.network, false);
  assert.equal(BigInt('0x' + observed.capabilities), 0n);
  assert.equal(Number(observed.memory), 2147483648);
  assert.equal(Number(observed.pids), 256);
  await mkdir('artifacts/isolation-validation', { recursive: true });
  await writeFile(
    'artifacts/isolation-validation/report.json',
    JSON.stringify({ status: 'passed', checks: 9, image, observed }, null, 2),
  );
  console.log(JSON.stringify({ status: 'passed', checks: 9 }));
} finally {
  const inspect = await docker([
    'inspect',
    '--format',
    '{{index .Config.Labels "app.proofgate.isolation"}}',
    name,
  ]);
  if (inspect.stdout.trim() === 'true') await docker(['rm', '-f', name]);
}
