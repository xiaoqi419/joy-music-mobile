import { applyJoyRuntimeConfig, joyMusicSource } from '../../../src/core/music/sources/joy'
import type { ImportedMusicSource } from '../../../src/core/config/musicSource'

// Matches the Linglan v8.7 LX contract without including a real subscription key.
const linglanScript = `
const API_URL = "https://source.example/api";
const API_KEY = "test-key";
const { EVENT_NAMES, request, on, send } = globalThis.lx;
const handleGetMusicUrl = async (source, musicInfo, quality) => {
  if (!source) throw new Error(\`不支持的音源: \${source}\`);
  const songId = musicInfo.hash ?? musicInfo.songmid ?? musicInfo.id;
  const requestUrl = \`\${API_URL}/music/url?source=\${encodeURIComponent(source)}&songId=\${encodeURIComponent(songId)}&quality=\${encodeURIComponent(quality)}\`;
  const headers = { "Content-Type": "application/json", "X-API-Key": API_KEY };
  // The real script declares headers and emits several log records here,
  // putting the request options outside the adapter's 420-character window.
  const diagnosticContext = "${'x'.repeat(450)}";
  return new Promise((resolve, reject) => {
    request(requestUrl, { method: "GET", headers }, (error, response) => {
      if (error) return reject(error);
      resolve(response.body.url);
    });
  });
};
on(EVENT_NAMES.request, ({ action, source, info }) => {
  if (action === "musicUrl") return handleGetMusicUrl(source, info.musicInfo, info.type);
});
send(EVENT_NAMES.inited, { status: true });
`

const makeSource = (overrides: Partial<ImportedMusicSource> = {}): ImportedMusicSource => ({
  id: 'test-source',
  name: 'Linglan compatibility fixture',
  apiUrl: 'https://source.example/api',
  apiKey: 'test-key',
  rawScript: linglanScript,
  enabled: true,
  createdAt: 0,
  updatedAt: 0,
  platforms: {
    tx: { id: 'tx', name: 'QQ', type: 'music', actions: ['musicUrl'], qualitys: ['320k', '128k'] },
  },
  ...overrides,
})

function configure(source = makeSource()) {
  applyJoyRuntimeConfig({ selectedSourceId: source.id, autoSwitch: false, importedSources: [source] })
}

const response = (body: unknown) => ({
  status: 200,
  headers: { get: () => 'application/json' },
  text: async () => JSON.stringify(body),
})

describe('Joy LX source compatibility', () => {
  const originalFetch = globalThis.fetch
  let fetchMock: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(response({ code: 200, url: 'https://cdn.example/song.mp3' }))
    globalThis.fetch = fetchMock
    configure()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    applyJoyRuntimeConfig({ selectedSourceId: '', autoSwitch: false, importedSources: [] })
    jest.restoreAllMocks()
  })

  test('Linglan v8.7 uses GET, authenticates, and encodes song IDs exactly once', async () => {
    const url = await joyMusicSource.getMusicUrl({ source: 'tx', songmid: 'song /?&' }, '320k')

    expect(url).toBe('https://cdn.example/song.mp3')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://source.example/api/music/url?source=tx&songId=song%20%2F%3F%26&quality=320k',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ 'X-API-Key': 'test-key' }) }),
    )
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined()
  })

  test('reuses the parsed template while honoring the requested quality', async () => {
    await joyMusicSource.getMusicUrl({ source: 'tx', songmid: '001Bbywq2gicae' }, '320k')
    await joyMusicSource.getMusicUrl({ source: 'tx', songmid: '001Bbywq2gicae' }, '128k')

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://source.example/api/music/url?source=tx&songId=001Bbywq2gicae&quality=320k',
      'https://source.example/api/music/url?source=tx&songId=001Bbywq2gicae&quality=128k',
    ])
  })

  test('does not turn an unrelated API failure into a nonexistent PHP playback URL', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    fetchMock.mockResolvedValue(response({ code: 404, message: 'Route not found' }))

    await expect(joyMusicSource.getMusicUrl({ source: 'tx', songmid: 'song' }, '320k')).rejects.toThrow('Route not found')
    expect(fetchMock.mock.calls.every(([url]) => !/\$\{|kgqq\/tx\.php/.test(url))).toBe(true)
  })

  test('preserves explicit POST scripts and their JSON body', async () => {
    configure(makeSource({ rawScript: `
      const API_URL = "https://source.example/api";
      const requestUrl = \`\${API_URL}/music/url\`;
      const options = { method: 'POST', body: { source: source, musicId: songId, quality: quality } };
    ` }))

    await joyMusicSource.getMusicUrl({ source: 'tx', songmid: 'song' }, '320k')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://source.example/api/music/url',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ source: 'tx', musicId: 'song', quality: '320k' }) }),
    )
  })

  test('retains PHP redirect fallback for the API family that owns those endpoints', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    configure(makeSource({ apiUrl: 'https://music.nxinxz.com', rawScript: '' }))
    fetchMock.mockResolvedValue(response({ code: 404, message: 'Route not found' }))

    await expect(joyMusicSource.getMusicUrl({ source: 'tx', songmid: 'song' }, '320k')).resolves.toBe(
      'https://music.nxinxz.com/kgqq/tx.php?id=song&level=higher&type=mp3',
    )
  })
})
