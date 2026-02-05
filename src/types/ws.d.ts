// Type definitions for the ws package
declare module 'ws' {
    import { EventEmitter } from 'events';
    import { IncomingMessage, ClientRequest } from 'http';
    import { Duplex } from 'stream';

    class WebSocket extends EventEmitter {
        static readonly CONNECTING: 0;
        static readonly OPEN: 1;
        static readonly CLOSING: 2;
        static readonly CLOSED: 3;

        readonly readyState: 0 | 1 | 2 | 3;
        readonly protocol: string;
        readonly url: string;
        readonly bufferedAmount: number;
        readonly extensions: string;

        constructor(address: string | URL, options?: WebSocket.ClientOptions);
        constructor(address: string | URL, protocols?: string | string[], options?: WebSocket.ClientOptions);

        close(code?: number, data?: string | Buffer): void;
        ping(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
        pong(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
        send(data: any, cb?: (err?: Error) => void): void;
        send(data: any, options: { mask?: boolean; binary?: boolean; compress?: boolean; fin?: boolean }, cb?: (err?: Error) => void): void;
        terminate(): void;

        on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
        on(event: 'error', listener: (err: Error) => void): this;
        on(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => void): this;
        on(event: 'open', listener: () => void): this;
        on(event: 'ping' | 'pong', listener: (data: Buffer) => void): this;
        on(event: 'unexpected-response', listener: (request: ClientRequest, response: IncomingMessage) => void): this;
        on(event: 'upgrade', listener: (response: IncomingMessage) => void): this;
        on(event: string | symbol, listener: (...args: any[]) => void): this;

        once(event: 'close', listener: (code: number, reason: Buffer) => void): this;
        once(event: 'error', listener: (err: Error) => void): this;
        once(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => void): this;
        once(event: 'open', listener: () => void): this;
        once(event: string | symbol, listener: (...args: any[]) => void): this;

        off(event: 'close', listener: (code: number, reason: Buffer) => void): this;
        off(event: 'error', listener: (err: Error) => void): this;
        off(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => void): this;
        off(event: 'open', listener: () => void): this;
        off(event: string | symbol, listener: (...args: any[]) => void): this;
    }

    namespace WebSocket {
        interface ClientOptions {
            protocol?: string;
            followRedirects?: boolean;
            generateMask?: (mask: Buffer) => void;
            handshakeTimeout?: number;
            maxPayload?: number;
            maxRedirects?: number;
            origin?: string;
            perMessageDeflate?: boolean | PerMessageDeflateOptions;
            protocolVersion?: number;
            skipUTF8Validation?: boolean;
            headers?: { [key: string]: string };
            agent?: any;
            host?: string;
            localAddress?: string;
            family?: number;
            checkServerIdentity?: (servername: string, cert: any) => boolean;
            rejectUnauthorized?: boolean;
            passphrase?: string;
            ciphers?: string;
            cert?: string | string[] | Buffer | Buffer[];
            key?: string | string[] | Buffer | Buffer[];
            pfx?: string | string[] | Buffer | Buffer[];
            ca?: string | string[] | Buffer | Buffer[];
        }

        interface PerMessageDeflateOptions {
            serverNoContextTakeover?: boolean;
            clientNoContextTakeover?: boolean;
            serverMaxWindowBits?: number;
            clientMaxWindowBits?: number;
            zlibDeflateOptions?: {
                flush?: number;
                finishFlush?: number;
                chunkSize?: number;
                windowBits?: number;
                level?: number;
                memLevel?: number;
                strategy?: number;
                dictionary?: Buffer | Buffer[];
                info?: boolean;
            };
            zlibInflateOptions?: {
                chunkSize?: number;
                windowBits?: number;
                dictionary?: Buffer | Buffer[];
            };
            threshold?: number;
            concurrencyLimit?: number;
        }

        interface ServerOptions {
            host?: string;
            port?: number;
            backlog?: number;
            server?: any;
            verifyClient?: any;
            handleProtocols?: any;
            path?: string;
            noServer?: boolean;
            clientTracking?: boolean;
            perMessageDeflate?: boolean | PerMessageDeflateOptions;
            maxPayload?: number;
            skipUTF8Validation?: boolean;
        }

        interface AddressInfo {
            address: string;
            family: string;
            port: number;
        }

        class Server extends EventEmitter {
            clients: Set<WebSocket>;

            constructor(options?: ServerOptions, callback?: () => void);

            close(cb?: (err?: Error) => void): void;
            handleUpgrade(request: IncomingMessage, socket: Duplex, upgradeHead: Buffer, callback: (client: WebSocket, request: IncomingMessage) => void): void;
            shouldHandle(request: IncomingMessage): boolean | Promise<boolean>;
            address(): AddressInfo | string | null;

            on(event: 'connection', cb: (socket: WebSocket, request: IncomingMessage) => void): this;
            on(event: 'error', cb: (error: Error) => void): this;
            on(event: 'headers', cb: (headers: string[], request: IncomingMessage) => void): this;
            on(event: 'close' | 'listening', cb: () => void): this;
            on(event: string | symbol, listener: (...args: any[]) => void): this;

            once(event: 'connection', cb: (socket: WebSocket, request: IncomingMessage) => void): this;
            once(event: 'error', cb: (error: Error) => void): this;
            once(event: 'headers', cb: (headers: string[], request: IncomingMessage) => void): this;
            once(event: 'close' | 'listening', cb: () => void): this;
            once(event: string | symbol, listener: (...args: any[]) => void): this;
        }
    }

    export = WebSocket;
}
