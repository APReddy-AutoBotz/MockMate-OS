import { appendRecordingAudio, createRecordingSession } from '../../mobile/src/services/recordingSession';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  const recorder = {
    prepareToRecordAsync: jest.fn(async (): Promise<void> => undefined),
    record: jest.fn(),
    stop: jest.fn(async (): Promise<void> => undefined),
    getStatus: jest.fn(() => ({ durationMillis: 1750 })),
    uri: 'file:///practice.m4a' as string | null,
  };
  const options = {
    recorder,
    requestPermission: jest.fn(async () => ({ granted: true })),
    setRecordingMode: jest.fn(async (_enabled: boolean) => undefined),
    onPhaseChange: jest.fn(),
    onPreview: jest.fn(),
    onError: jest.fn(),
  };
  return { recorder, options, session: createRecordingSession(options) };
}

async function letPreparationBegin() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('native recording operation lifetime', () => {
  test('a rapid second start cannot create another recorder operation', async () => {
    const { recorder, options, session } = fixture();
    const preparation = deferred();
    recorder.prepareToRecordAsync.mockReturnValue(preparation.promise);
    const first = session.start(30_000);
    const second = session.start(30_000);
    await letPreparationBegin();
    expect(options.requestPermission).toHaveBeenCalledTimes(1);
    expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    preparation.resolve();
    await Promise.all([first, second]);
    expect(recorder.record).toHaveBeenCalledTimes(1);
  });

  test('unmount during preparation never uses the native object after its hook releases it', async () => {
    const { recorder, options, session } = fixture();
    const preparation = deferred();
    recorder.prepareToRecordAsync.mockReturnValue(preparation.promise);
    const start = session.start(30_000);
    await letPreparationBegin();
    session.dispose();
    recorder.record.mockImplementation(() => { throw new Error('released object'); });
    recorder.stop.mockRejectedValue(new Error('released object'));
    preparation.resolve();
    await start;
    expect(recorder.record).not.toHaveBeenCalled();
    expect(recorder.stop).not.toHaveBeenCalled();
    expect(options.onPreview).not.toHaveBeenCalled();
    expect(options.setRecordingMode).toHaveBeenLastCalledWith(false);
  });

  test('blur during preparation cancels capture and releases a still-mounted prepared microphone', async () => {
    const { recorder, options, session } = fixture();
    const preparation = deferred();
    recorder.prepareToRecordAsync.mockReturnValue(preparation.promise);
    const start = session.start(30_000);
    await letPreparationBegin();
    await session.suspend();
    session.resume();
    preparation.resolve();
    await start;
    expect(recorder.record).not.toHaveBeenCalled();
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(options.onPreview).not.toHaveBeenCalled();
    expect(options.setRecordingMode).toHaveBeenLastCalledWith(false);
    await session.start(30_000);
    expect(recorder.record).toHaveBeenCalledTimes(1);
  });

  test('double stop finalizes only once and uses captured duration rather than elapsed wall time', async () => {
    const { recorder, options, session } = fixture();
    await session.start(30_000);
    const stopping = deferred();
    recorder.stop.mockReturnValue(stopping.promise);
    const first = session.stop();
    const second = session.stop();
    recorder.getStatus.mockReturnValue({ durationMillis: 0 });
    stopping.resolve();
    await Promise.all([first, second]);
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(options.onPreview).toHaveBeenCalledWith({ uri: 'file:///practice.m4a', durationMs: 1750 });
    expect(options.setRecordingMode).toHaveBeenLastCalledWith(false);
  });

  test('unmount during stop never reads the released recorder URI or updates the screen', async () => {
    const { recorder, options, session } = fixture();
    await session.start(30_000);
    const stopping = deferred();
    recorder.stop.mockReturnValue(stopping.promise);
    const stop = session.stop();
    session.dispose();
    const releasedUri = jest.fn(() => { throw new Error('released object'); });
    Object.defineProperty(recorder, 'uri', { get: releasedUri });
    const callsBeforeResolve = options.onPhaseChange.mock.calls.length;
    stopping.resolve();
    await stop;
    expect(releasedUri).not.toHaveBeenCalled();
    expect(options.onPreview).not.toHaveBeenCalled();
    expect(options.onPhaseChange).toHaveBeenCalledTimes(callsBeforeResolve);
  });

  test('backgrounding stops capture and keeps the existing audio available for listen-back', async () => {
    const { recorder, options, session } = fixture();
    await session.start(30_000);
    await session.suspend();
    await session.start(30_000);
    expect(recorder.record).toHaveBeenCalledTimes(1);
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(options.onPreview).toHaveBeenCalledTimes(1);
    expect(options.setRecordingMode).toHaveBeenLastCalledWith(false);
  });

  test('permission denial does not prepare audio and restores playback mode', async () => {
    const { recorder, options, session } = fixture();
    options.requestPermission.mockResolvedValue({ granted: false });
    await session.start(30_000);
    expect(recorder.prepareToRecordAsync).not.toHaveBeenCalled();
    expect(options.onError).toHaveBeenCalledWith(expect.stringContaining('device settings'));
    expect(options.setRecordingMode).toHaveBeenLastCalledWith(false);
  });

  test('a failed recorder preparation restores playback mode and permits a retry', async () => {
    const { recorder, options, session } = fixture();
    recorder.prepareToRecordAsync.mockRejectedValueOnce(new Error('Microphone unavailable'));
    await session.start(30_000);
    expect(options.setRecordingMode).toHaveBeenLastCalledWith(false);
    expect(options.onError).toHaveBeenCalledWith('Microphone unavailable');
    await session.start(30_000);
    expect(recorder.record).toHaveBeenCalledTimes(1);
  });

  test('effect cleanup and setup can reattach a session without leaving it permanently disposed', async () => {
    const { recorder, session } = fixture();
    session.dispose();
    session.attach();
    await session.start(30_000);
    expect(recorder.record).toHaveBeenCalledTimes(1);
  });

  test('a continuation from an earlier attachment cannot stop a new recording', async () => {
    const { recorder, session } = fixture();
    const preparation = deferred();
    recorder.prepareToRecordAsync.mockReturnValueOnce(preparation.promise);
    const staleStart = session.start(30_000);
    await letPreparationBegin();
    session.dispose();
    session.attach();
    await session.start(30_000);
    preparation.resolve();
    await staleStart;
    expect(recorder.record).toHaveBeenCalledTimes(1);
    expect(recorder.stop).not.toHaveBeenCalled();
    expect(session.durationMs()).toBe(1750);
  });
});

describe('recording upload encoding', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  test('web sends actual audio bytes and the recorder MIME type as a multipart file', async () => {
    const audio = new Blob(['captured audio'], { type: 'audio/mp4' });
    globalThis.fetch = jest.fn(async () => ({ ok: true, blob: async () => audio })) as unknown as typeof fetch;
    const append = jest.fn();
    await appendRecordingAudio({ append } as unknown as FormData, 'blob:recording', true);
    expect(globalThis.fetch).toHaveBeenCalledWith('blob:recording');
    expect(append).toHaveBeenCalledWith('audio', audio, 'recording.m4a');
  });

  test('native preserves the React Native URI multipart representation without fetching it', async () => {
    globalThis.fetch = jest.fn();
    const append = jest.fn();
    await appendRecordingAudio({ append } as unknown as FormData, 'file:///practice.m4a', false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith('audio', {
      uri: 'file:///practice.m4a', name: 'recording.m4a', type: 'audio/mp4',
    });
  });
});
