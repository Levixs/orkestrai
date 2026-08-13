import { describe, expect, it } from 'vitest';
import { ScrcpyVideoCodecId } from '@yume-chan/scrcpy';
import { readAndroidDeviceStream } from '../../src/lib/components/agent-room/android-device-stream.js';

function header(): Buffer {
  const value = Buffer.alloc(20);
  value.write('OKDV', 0, 'ascii');
  value.writeUInt8(1, 4);
  value.writeUInt32BE(ScrcpyVideoCodecId.H264, 8);
  value.writeUInt32BE(1080, 12);
  value.writeUInt32BE(2400, 16);
  return value;
}

function packet(type: 0 | 1, data: number[], keyframe = false, pts = -1n): Buffer {
  const prefix = Buffer.alloc(14);
  prefix.writeUInt8(type, 0);
  prefix.writeUInt8(keyframe ? 1 : 0, 1);
  prefix.writeUInt32BE(data.length, 2);
  prefix.writeBigInt64BE(pts, 6);
  return Buffer.concat([prefix, Buffer.from(data)]);
}

describe('Android Device stream protocol', () => {
  it('reassembles split headers and preserves Scrcpy packet metadata', async () => {
    const bytes = Buffer.concat([
      header(),
      packet(0, [0, 0, 0, 1, 103]),
      packet(1, [0, 0, 0, 1, 101], true, 42n),
    ]);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 7));
        controller.enqueue(bytes.subarray(7, 31));
        controller.enqueue(bytes.subarray(31));
        controller.close();
      },
    });

    const parsed = await readAndroidDeviceStream(body);
    expect(parsed.header).toEqual({ codec: ScrcpyVideoCodecId.H264, width: 1080, height: 2400 });
    const reader = parsed.stream.getReader();
    const configuration = await reader.read();
    const frame = await reader.read();
    expect(configuration.value).toMatchObject({ type: 'configuration' });
    expect([...configuration.value!.data]).toEqual([0, 0, 0, 1, 103]);
    expect(frame.value).toMatchObject({ type: 'data', keyframe: true, pts: 42n });
    expect([...frame.value!.data]).toEqual([0, 0, 0, 1, 101]);
    expect((await reader.read()).done).toBe(true);
  });

  it('rejects unsupported protocol headers', async () => {
    const invalid = header();
    invalid.writeUInt8(9, 4);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(invalid);
        controller.close();
      },
    });
    await expect(readAndroidDeviceStream(body)).rejects.toThrow('Unsupported Android stream protocol');
  });
});
