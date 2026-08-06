export function createMutex() {
  let tail = Promise.resolve();

  return async function withLock(operation) {
    const run = tail.catch(() => undefined).then(operation);
    tail = run.then(() => undefined, () => undefined);
    return await run;
  };
}
