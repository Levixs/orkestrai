import type { ScrcpyMediaStreamPacket, ScrcpyVideoCodecId } from '@yume-chan/scrcpy';
import { ReadableStream as TangoReadableStream } from '@yume-chan/stream-extra';

const HEADER_SIZE = 20;
const PACKET_HEADER_SIZE = 14;
const MAX_PACKET_SIZE = 16 * 1024 * 1024;

type SourceReader = {
  read(): Promise<ReadableStreamReadResult<Uint8Array>>;
  cancel(reason?: unknown): Promise<void>;
};

export type AndroidStreamHeader = {
  codec: ScrcpyVideoCodecId;
  width: number;
  height: number;
};

class BufferedReader {
  private chunks: Uint8Array[] = [];
  private length = 0;

  constructor(private readonly reader: SourceReader) {}

  async readExactly(size: number): Promise<Uint8Array | null> {
    while (this.length < size) {
      const { value, done } = await this.reader.read();
      if (done) {
        if (this.length === 0) return null;
        throw new Error('Android stream ended inside a packet.');
      }
      if (!value?.length) continue;
      this.chunks.push(value);
      this.length += value.length;
    }

    const output = new Uint8Array(size);
    let written = 0;
    while (written < size) {
      const chunk = this.chunks[0]!;
      const take = Math.min(chunk.length, size - written);
      output.set(chunk.subarray(0, take), written);
      written += take;
      this.length -= take;
      if (take === chunk.length) this.chunks.shift();
      else this.chunks[0] = chunk.subarray(take);
    }
    return output;
  }

  cancel(reason?: unknown): Promise<void> {
    return this.reader.cancel(reason);
  }
}

export async function readAndroidDeviceStream(
  body: globalThis.ReadableStream<Uint8Array>,
): Promise<{ header: AndroidStreamHeader; stream: TangoReadableStream<ScrcpyMediaStreamPacket> }> {
  const buffered = new BufferedReader(body.getReader());
  const rawHeader = await buffered.readExactly(HEADER_SIZE);
  if (!rawHeader) throw new Error('Android stream did not send a header.');
  const magic = new TextDecoder().decode(rawHeader.subarray(0, 4));
  if (magic !== 'OKDV' || rawHeader[4] !== 1) throw new Error('Unsupported Android stream protocol.');
  const headerView = new DataView(rawHeader.buffer, rawHeader.byteOffset, rawHeader.byteLength);
  const header: AndroidStreamHeader = {
    codec: headerView.getUint32(8) as ScrcpyVideoCodecId,
    width: headerView.getUint32(12),
    height: headerView.getUint32(16),
  };

  const stream = new TangoReadableStream<ScrcpyMediaStreamPacket>({
    async pull(controller) {
      const rawPacketHeader = await buffered.readExactly(PACKET_HEADER_SIZE);
      if (!rawPacketHeader) {
        controller.close();
        return;
      }
      const view = new DataView(rawPacketHeader.buffer, rawPacketHeader.byteOffset, rawPacketHeader.byteLength);
      const packetType = view.getUint8(0);
      const flags = view.getUint8(1);
      const payloadLength = view.getUint32(2);
      if (packetType > 1 || payloadLength > MAX_PACKET_SIZE) {
        throw new Error('Android stream sent an invalid packet.');
      }
      const payload = await buffered.readExactly(payloadLength);
      if (!payload) throw new Error('Android stream ended before the packet payload.');
      if (packetType === 0) {
        controller.enqueue({ type: 'configuration', data: payload });
        return;
      }
      const pts = view.getBigInt64(6);
      controller.enqueue({
        type: 'data',
        keyframe: Boolean(flags & 1),
        ...(pts >= 0 ? { pts } : {}),
        data: payload,
      });
    },
    cancel(reason) {
      return buffered.cancel(reason);
    },
  });
  return { header, stream };
}
