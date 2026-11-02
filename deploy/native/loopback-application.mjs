export function loopbackApplication(app, onListening) {
    const listen = app.listen.bind(app);
    const listenOnLoopback = async port => {
        const server = await listen(port, '127.0.0.1');
        if (server.address()?.address !== '127.0.0.1') throw Error('Fixture API must bind loopback');
        onListening(server);
        return server;
    };
    // Nest's own proxy implements a non-mutating setter; assigning app.listen
    // silently leaves the original method intact. Intercept the get instead.
    return new Proxy(app, { get(target, property, receiver) {
        return property === 'listen' ? listenOnLoopback : Reflect.get(target, property, receiver);
    } });
}
