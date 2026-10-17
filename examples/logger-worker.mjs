import {parentPort} from 'node:worker_threads';

parentPort.on('message', message => {
  if (message.type === 'log') process.stdout.write(message.data + '\n');
});
