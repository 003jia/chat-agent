export function createMutex() {
  let tail = Promise.resolve();

  return async function withLock(operation) {
    const run = tail.catch(() => undefined).then(operation);
    tail = run.finally(() => undefined);
    return await run;
  };
}
