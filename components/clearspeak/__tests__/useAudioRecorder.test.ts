import { act, renderHook } from '@testing-library/react';
import { useAudioRecorder } from '../useAudioRecorder';

const track = () => ({ stop: jest.fn(), onended: null as (() => void) | null });
const stream = (mediaTrack = track()) => ({ getTracks: () => [mediaTrack], getAudioTracks: () => [mediaTrack] } as unknown as MediaStream);

class RecorderMock {
  static isTypeSupported = () => true;
  state: RecordingState = 'inactive';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  constructor(public stream: MediaStream) {}
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; }
}

describe('useAudioRecorder capture ownership', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    (global as any).MediaRecorder = RecorderMock;
  });

  it('stops a stream whose permission resolves after teardown', async () => {
    const microphoneTrack = track();
    let resolve!: (value: MediaStream) => void;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => new Promise<MediaStream>(r => { resolve = r; }) } });
    const { result, unmount } = renderHook(() => useAudioRecorder());
    let pending!: Promise<void>;
    act(() => { pending = result.current.startRecording(); });
    unmount();
    await act(async () => { resolve(stream(microphoneTrack)); await expect(pending).rejects.toThrow('canceled'); });
    expect(microphoneTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('releases acquired tracks when recorder construction fails', async () => {
    const microphoneTrack = track();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn().mockResolvedValue(stream(microphoneTrack)) } });
    (global as any).MediaRecorder = class { static isTypeSupported = () => true; constructor() { throw new Error('setup failed'); } };
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => { await expect(result.current.startRecording()).rejects.toThrow(); });
    expect(microphoneTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('detaches callbacks and prevents raw chunks from returning after abort', async () => {
    const microphoneTrack = track();
    let recorder!: RecorderMock;
    class CapturedRecorder extends RecorderMock { constructor(value: MediaStream) { super(value); recorder = this; } }
    (global as any).MediaRecorder = CapturedRecorder;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn().mockResolvedValue(stream(microphoneTrack)) } });
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => { await result.current.startRecording(); });
    act(() => result.current.abortRecording());
    expect(recorder.ondataavailable).toBeNull();
    expect(recorder.onstop).toBeNull();
    expect(recorder.onerror).toBeNull();
    expect(microphoneTrack.stop).toHaveBeenCalledTimes(1);
    expect(result.current.audioBlob).toBeNull();
  });

  it('automatically stops at the authoritative prompt duration', async () => {
    jest.useFakeTimers();
    const microphoneTrack = track();
    let recorder!: RecorderMock;
    class CapturedRecorder extends RecorderMock { constructor(value: MediaStream) { super(value); recorder = this; } }
    (global as any).MediaRecorder = CapturedRecorder;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn().mockResolvedValue(stream(microphoneTrack)) } });
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => { await result.current.startRecording({ maxDurationMs: 1_000 }); });
    const stop = jest.spyOn(recorder, 'stop');
    act(() => jest.advanceTimersByTime(999));
    expect(stop).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(stop).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('allows a manual stop before the prompt limit', async () => {
    const microphoneTrack = track();
    let recorder!: RecorderMock;
    class CapturedRecorder extends RecorderMock { constructor(value: MediaStream) { super(value); recorder = this; } }
    (global as any).MediaRecorder = CapturedRecorder;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn().mockResolvedValue(stream(microphoneTrack)) } });
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => { await result.current.startRecording({ maxDurationMs: 45_000 }); });
    const stop = jest.spyOn(recorder, 'stop');
    act(() => result.current.stopRecording());
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
