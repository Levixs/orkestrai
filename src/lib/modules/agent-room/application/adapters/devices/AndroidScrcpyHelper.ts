import { readFile } from 'node:fs/promises';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { Adb } from '@yume-chan/adb';
import { AdbServerClient } from '@yume-chan/adb';
import { AdbScrcpyClient, AdbScrcpyOptions3_1 } from '@yume-chan/adb-scrcpy';
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp';
import {
  AndroidKeyCode,
  AndroidKeyEventAction,
  AndroidKeyEventMeta,
  AndroidMotionEventAction,
  AndroidMotionEventButton,
  ScrcpyVideoCodecId,
  type ScrcpyMediaStreamPacket,
} from '@yume-chan/scrcpy';
import {
  ReadableStream,
  WritableStream,
  type ReadableStreamDefaultReader,
} from '@yume-chan/stream-extra';

const SERVER_VERSION = '3.1';
const SERVER_DEVICE_PATH = '/data/local/tmp/orkestrai-scrcpy-server-v3.1';
const STREAM_MAGIC = 'OKDV';
const STREAM_VERSION = 1;

type StreamClient = {
  response: ServerResponse;
  ready: boolean;
};

function streamHeader(codec: number, width: number, height: number): Buffer {
  const header = Buffer.alloc(20);
  header.write(STREAM_MAGIC, 0, 'ascii');
  header.writeUInt8(STREAM_VERSION, 4);
  header.writeUInt32BE(codec >>> 0, 8);
  header.writeUInt32BE(Math.max(0, width) >>> 0, 12);
  header.writeUInt32BE(Math.max(0, height) >>> 0, 16);
  return header;
}

function serializePacket(packet: ScrcpyMediaStreamPacket): Buffer {
  const payload = Buffer.from(packet.data.buffer, packet.data.byteOffset, packet.data.byteLength);
  const header = Buffer.alloc(14);
  header.writeUInt8(packet.type === 'configuration' ? 0 : 1, 0);
  header.writeUInt8(packet.type === 'data' && packet.keyframe ? 1 : 0, 1);
  header.writeUInt32BE(payload.length, 2);
  header.writeBigInt64BE(packet.type === 'data' && packet.pts !== undefined ? packet.pts : -1n, 6);
  return Buffer.concat([header, payload]);
}

export class AndroidScrcpyHelper {
  readonly serial: string;
  readonly baseUrl: string;
  readonly streamUrl: string;

  private readonly adb: Adb;
  private readonly client: AdbScrcpyClient<AdbScrcpyOptions3_1<true>>;
  private readonly server: Server;
  private readonly clients = new Set<StreamClient>();
  private readonly removeSizeListener: () => void;
  private reader: ReadableStreamDefaultReader<ScrcpyMediaStreamPacket> | null = null;
  private configurationPacket: Buffer | null = null;
  private keyframePacket: Buffer | null = null;
  private closed = false;
  private failed = false;
  private width: number;
  private height: number;

  static async start(serial: string): Promise<AndroidScrcpyHelper> {
    const adb = await new AdbServerClient(new AdbServerNodeTcpConnector({
      host: process.env.ANDROID_ADB_SERVER_ADDRESS ?? '127.0.0.1',
      port: Number(process.env.ANDROID_ADB_SERVER_PORT ?? 5037),
    })).createAdb({ serial });
    let client: AdbScrcpyClient<AdbScrcpyOptions3_1<true>> | null = null;
    try {
      const serverFile = await readFile(resolve(process.cwd(), 'electron', 'resources', `scrcpy-server-v${SERVER_VERSION}`));
      await AdbScrcpyClient.pushServer(adb, new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(serverFile.buffer, serverFile.byteOffset, serverFile.byteLength));
          controller.close();
        },
      }), SERVER_DEVICE_PATH);
      const options = new AdbScrcpyOptions3_1({
        video: true,
        audio: false,
        control: true,
        clipboardAutosync: false,
        videoCodec: 'h264',
        videoBitRate: 6_000_000,
        maxSize: 1_920,
        maxFps: 30,
        sendCodecMeta: true,
        sendDeviceMeta: true,
        sendFrameMeta: true,
        stayAwake: false,
        powerOffOnClose: false,
        logLevel: 'warn',
      });
      client = await AdbScrcpyClient.start(adb, SERVER_DEVICE_PATH, options);
      const video = await client.videoStream;
      if (video.metadata.codec !== ScrcpyVideoCodecId.H264) {
        throw new Error('Android stream did not negotiate H.264.');
      }
      return await AndroidScrcpyHelper.create(serial, adb, client, video);
    } catch (error) {
      await client?.close().catch(() => undefined);
      await adb.close().catch(() => undefined);
      throw error;
    }
  }

  private static async create(
    serial: string,
    adb: Adb,
    client: AdbScrcpyClient<AdbScrcpyOptions3_1<true>>,
    video: Awaited<AdbScrcpyClient<AdbScrcpyOptions3_1<true>>['videoStream']>,
  ): Promise<AndroidScrcpyHelper> {
    return new Promise((resolveStart, rejectStart) => {
      let helper: AndroidScrcpyHelper | null = null;
      const server = createServer((request, response) => helper?.handleRequest(request.url ?? '/', response));
      server.unref();
      const startupError = (error: Error) => rejectStart(error);
      server.once('error', startupError);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', startupError);
        const address = server.address();
        if (!address || typeof address === 'string') {
          server.close();
          rejectStart(new Error('Could not allocate the Android stream loopback port.'));
          return;
        }
        helper = new AndroidScrcpyHelper(serial, adb, client, video, server, address.port);
        server.on('error', () => helper?.fail());
        resolveStart(helper);
      });
    });
  }

  private constructor(
    serial: string,
    adb: Adb,
    client: AdbScrcpyClient<AdbScrcpyOptions3_1<true>>,
    video: Awaited<AdbScrcpyClient<AdbScrcpyOptions3_1<true>>['videoStream']>,
    server: Server,
    port: number,
  ) {
    this.serial = serial;
    this.adb = adb;
    this.client = client;
    this.server = server;
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.streamUrl = `${this.baseUrl}/stream`;
    this.width = video.metadata.width ?? video.width;
    this.height = video.metadata.height ?? video.height;
    this.removeSizeListener = video.sizeChanged(({ width, height }) => {
      this.width = width;
      this.height = height;
    });
    this.reader = video.stream.getReader();
    void this.consumeVideo();
    void client.output.pipeTo(new WritableStream({ write() {} })).catch(() => undefined);
    void client.exited.then(() => this.fail()).catch(() => this.fail());
  }

  health(): boolean {
    return !this.closed && !this.failed && this.server.listening;
  }

  async tap(x: number, y: number): Promise<void> {
    await this.touch(AndroidMotionEventAction.Down, 0n, x, y, 1);
    await this.touch(AndroidMotionEventAction.Up, 0n, x, y, 0);
  }

  async swipe(fromX: number, fromY: number, toX: number, toY: number, durationMs: number): Promise<void> {
    const steps = Math.max(2, Math.min(30, Math.round(durationMs / 24)));
    await this.touch(AndroidMotionEventAction.Down, 0n, fromX, fromY, 1);
    for (let step = 1; step < steps; step += 1) {
      const progress = step / steps;
      await this.touch(
        AndroidMotionEventAction.Move,
        0n,
        fromX + (toX - fromX) * progress,
        fromY + (toY - fromY) * progress,
        1,
      );
      await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.max(8, durationMs / steps)));
    }
    await this.touch(AndroidMotionEventAction.Up, 0n, toX, toY, 0);
  }

  async pinch(
    centerX: number,
    centerY: number,
    startDistance: number,
    endDistance: number,
    durationMs: number,
  ): Promise<void> {
    const point = (distance: number, side: -1 | 1) => ({
      x: Math.max(0, Math.min(1, centerX + side * distance / 2)),
      y: centerY,
    });
    const steps = Math.max(2, Math.min(30, Math.round(durationMs / 24)));
    const left = point(startDistance, -1);
    const right = point(startDistance, 1);
    await this.touch(AndroidMotionEventAction.Down, 10n, left.x, left.y, 1);
    await this.touch(AndroidMotionEventAction.Down, 11n, right.x, right.y, 1);
    for (let step = 1; step < steps; step += 1) {
      const progress = step / steps;
      const distance = startDistance + (endDistance - startDistance) * progress;
      const nextLeft = point(distance, -1);
      const nextRight = point(distance, 1);
      await this.touch(AndroidMotionEventAction.Move, 10n, nextLeft.x, nextLeft.y, 1);
      await this.touch(AndroidMotionEventAction.Move, 11n, nextRight.x, nextRight.y, 1);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.max(8, durationMs / steps)));
    }
    const finalLeft = point(endDistance, -1);
    const finalRight = point(endDistance, 1);
    await this.touch(AndroidMotionEventAction.Up, 11n, finalRight.x, finalRight.y, 0);
    await this.touch(AndroidMotionEventAction.Up, 10n, finalLeft.x, finalLeft.y, 0);
  }

  async type(text: string): Promise<void> {
    const controller = this.requireController();
    await controller.injectText(text);
  }

  async rotate(): Promise<void> {
    await this.requireController().rotateDevice();
  }

  async button(button: 'back' | 'home' | 'lock' | 'app-switcher'): Promise<void> {
    const keyCode = {
      back: AndroidKeyCode.AndroidBack,
      home: AndroidKeyCode.AndroidHome,
      lock: AndroidKeyCode.Power,
      'app-switcher': AndroidKeyCode.AndroidAppSwitch,
    }[button];
    const controller = this.requireController();
    await controller.injectKeyCode({
      action: AndroidKeyEventAction.Down,
      keyCode,
      repeat: 0,
      metaState: AndroidKeyEventMeta.None,
    });
    await controller.injectKeyCode({
      action: AndroidKeyEventAction.Up,
      keyCode,
      repeat: 0,
      metaState: AndroidKeyEventMeta.None,
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.removeSizeListener();
    for (const client of this.clients) client.response.end();
    this.clients.clear();
    await this.reader?.cancel().catch(() => undefined);
    this.reader = null;
    await new Promise<void>((resolveClose) => this.server.close(() => resolveClose()));
    await this.client.close().catch(() => undefined);
    await this.adb.close().catch(() => undefined);
  }

  private requireController() {
    const controller = this.client.controller;
    if (!controller) throw new Error('The Android control channel is unavailable.');
    return controller;
  }

  private async touch(
    action: (typeof AndroidMotionEventAction)[keyof typeof AndroidMotionEventAction],
    pointerId: bigint,
    x: number,
    y: number,
    pressure: number,
  ): Promise<void> {
    if (!this.width || !this.height) throw new Error('Android video dimensions are not ready.');
    await this.requireController().injectTouch({
      action,
      pointerId,
      pointerX: Math.round(Math.max(0, Math.min(1, x)) * this.width),
      pointerY: Math.round(Math.max(0, Math.min(1, y)) * this.height),
      videoWidth: this.width,
      videoHeight: this.height,
      pressure,
      actionButton: pressure ? AndroidMotionEventButton.Primary : AndroidMotionEventButton.None,
      buttons: pressure ? AndroidMotionEventButton.Primary : AndroidMotionEventButton.None,
    });
  }

  private handleRequest(path: string, response: ServerResponse): void {
    if (path === '/health') {
      response.writeHead(this.health() ? 200 : 503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: this.health() }));
      return;
    }
    if (path !== '/stream') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': 'application/x-orkestrai-scrcpy',
      'cache-control': 'no-store, no-cache, must-revalidate',
      connection: 'keep-alive',
    });
    response.write(streamHeader(ScrcpyVideoCodecId.H264, this.width, this.height));
    const streamClient: StreamClient = { response, ready: true };
    this.clients.add(streamClient);
    this.sendRecoveryPackets(streamClient);
    response.once('close', () => this.clients.delete(streamClient));
    response.once('error', () => this.clients.delete(streamClient));
  }

  private async consumeVideo(): Promise<void> {
    const reader = this.reader;
    if (!reader) return;
    try {
      while (!this.closed) {
        const { value, done } = await reader.read();
        if (done) break;
        const serialized = serializePacket(value);
        if (value.type === 'configuration') {
          this.configurationPacket = serialized;
          this.keyframePacket = null;
        } else if (value.keyframe) {
          this.keyframePacket = serialized;
        }
        for (const client of this.clients) this.send(client, serialized);
      }
      if (!this.closed) this.fail();
    } catch {
      if (!this.closed) this.fail();
    }
  }

  private send(client: StreamClient, packet: Buffer): void {
    if (!client.ready || client.response.destroyed) return;
    client.ready = client.response.write(packet);
    if (!client.ready) {
      client.response.once('drain', () => {
        client.ready = true;
        this.sendRecoveryPackets(client);
      });
    }
  }

  private sendRecoveryPackets(client: StreamClient): void {
    if (this.configurationPacket) this.send(client, this.configurationPacket);
    if (client.ready && this.keyframePacket) this.send(client, this.keyframePacket);
  }

  private fail(): void {
    if (this.closed || this.failed) return;
    this.failed = true;
    for (const client of this.clients) client.response.end();
    this.clients.clear();
    void this.close();
  }
}
