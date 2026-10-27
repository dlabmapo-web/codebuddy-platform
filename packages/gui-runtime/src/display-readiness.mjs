// Trusted infrastructure only, before learner source is delivered. Keep the
// wait inside one exec instead of starting Docker/Python after every miss.
// Inline code also supports approved retained guest images without new files.
export function displayReadinessProbe({ port = 5900, timeoutMs = 10000 } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535 ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000)
    throw new Error('Invalid display readiness bounds');
  return `import socket,time
deadline=time.monotonic()+${timeoutMs / 1000}
while True:
    remaining=deadline-time.monotonic()
    if remaining<=0:
        raise TimeoutError('Display readiness deadline exceeded')
    try:
        with socket.create_connection(('127.0.0.1',${port}),min(.05,remaining)):
            break
    except OSError:
        remaining=deadline-time.monotonic()
        if remaining>0:
            time.sleep(min(.02,remaining))
`;
}
