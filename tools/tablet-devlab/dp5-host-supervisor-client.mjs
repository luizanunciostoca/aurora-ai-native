import { createConnection } from 'node:net';

import { DEFAULT_SOCKET } from './dp5-host-supervisor.mjs';

export function supervisorRequest(request, socketPath = DEFAULT_SOCKET) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ path: socketPath });
    let data = '';
    socket.setEncoding('utf8');
    socket.setTimeout(15_000);

    socket.once('connect', () => {
      socket.end(`${JSON.stringify(request)}\n`);
    });
    socket.on('data', (chunk) => {
      data += chunk;
    });
    socket.once('timeout', () => {
      socket.destroy(new Error('DP5 host supervisor request timed out'));
    });
    socket.once('error', reject);
    socket.once('close', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('DP5 host supervisor returned malformed JSON'));
      }
    });
  });
}

const [op] = process.argv.slice(2);
if (op) {
  const request =
    op === 'status'
      ? { op: 'STATUS' }
      : op === 'refresh'
        ? { op: 'REFRESH' }
        : op === 'reauthorize'
          ? { op: 'REAUTHORIZE' }
          : op === 'stop'
            ? { op: 'STOP' }
            : null;
  if (request === null) {
    console.error('usage: dp5-host-supervisor-client.mjs status|refresh|reauthorize|stop');
    process.exitCode = 2;
  } else {
    supervisorRequest(request)
      .then((value) => console.log(JSON.stringify(value, null, 2)))
      .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 2;
      });
  }
}
