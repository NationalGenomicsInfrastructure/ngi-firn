import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loginWithToken } from '../bombadil/fixtures/auth'
import { cleanupJournal, createJournal } from '../bombadil/fixtures/journal'
import { filterActions, safeClick } from '../bombadil/specs/actions'
import type { ActionTemplate } from '@antithesishq/bombadil/browser'

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true })
  }
})

async function journalPath() {
  const directory = await mkdtemp(join(tmpdir(), 'firn-bombadil-'))
  temporaryDirectories.push(directory)
  return pathToFileURL(join(directory, 'created-ids.json'))
}

describe('Bombadil fixture authentication', () => {
  const user = { firnId: 'test', email: 'bctest@scilifelab.se' }
  const loginResponse = () => new Response(null, {
    status: 201,
    headers: { 'location': '/scan', 'set-cookie': 'nuxt-session=test-session; HttpOnly; Path=/' }
  })

  it('rejects an error-session cookie before starting exploration', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, {
      status: 403,
      headers: { 'set-cookie': 'nuxt-session=error-session; Path=/' }
    }))
    vi.stubGlobal('fetch', request)
    await expect(loginWithToken('http://127.0.0.1:3107', 'test-token', user)).rejects.toThrow('HTTP 403')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('verifies the cookie through the authenticated self query', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(Response.json({ result: { data: { firnId: user.firnId, googleEmail: user.email } } }))
    vi.stubGlobal('fetch', request)
    await expect(loginWithToken('http://127.0.0.1:3107', 'test-token', user)).resolves.toEqual(['nuxt-session=test-session'])
    expect(String(request.mock.calls[1]?.[0])).toContain('/api/trpc/users.getUserInfoSelf')
    expect(new Headers(request.mock.calls[1]?.[1].headers).get('cookie')).toBe('nuxt-session=test-session')
  })

  it('rejects an authenticated but different user', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(Response.json({ result: { data: { firnId: 'other', googleEmail: user.email } } })))
    await expect(loginWithToken('http://127.0.0.1:3107', 'test-token', user)).rejects.toThrow('fixture user')
  })
})

describe('Bombadil cleanup journal', () => {
  it('records partial provisioning before a later seed failure', async () => {
    const path = await journalPath()
    const track = await createJournal(path, 'firn_bombadil')
    await track('user')
    await track('room')
    const remove = vi.fn().mockResolvedValue(undefined)
    await cleanupJournal(path, 'firn_bombadil', remove)
    expect(remove.mock.calls.map(call => call[0])).toEqual(['room', 'user'])
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('retains failed deletions for retry without keeping deleted IDs', async () => {
    const path = await journalPath()
    const track = await createJournal(path, 'firn_bombadil')
    await track('user')
    await track('room')
    const remove = vi.fn().mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValue(undefined)
    await expect(cleanupJournal(path, 'firn_bombadil', remove)).rejects.toThrow('journal retained')
    expect(JSON.parse(await readFile(path, 'utf8')).createdIds).toEqual(['room'])
    await cleanupJournal(path, 'firn_bombadil', remove)
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not erase or use a corrupt or wrong-database journal', async () => {
    const path = await journalPath()
    const track = await createJournal(path, 'other_database')
    await track('user')
    const remove = vi.fn()
    await expect(cleanupJournal(path, 'firn_bombadil', remove)).rejects.toThrow('other_database')
    await writeFile(path, '{broken')
    await expect(cleanupJournal(path, 'firn_bombadil', remove)).rejects.toThrow()
    expect(await readFile(path, 'utf8')).toBe('{broken')
    expect(remove).not.toHaveBeenCalled()
  })
})

it('refuses an occupied pilot port before seeding or making HTTP requests', async () => {
  const server = createServer()
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing test listener')
    await expect(promisify(execFile)('bash', ['tests/bombadil/run.sh'], {
      env: { ...process.env, BOMBADIL_PORT: String(address.port) }
    })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Cannot reserve pilot port') })
  }
  finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

it('excludes forbidden clicks while retaining other actions and weights', () => {
  const click: ActionTemplate = {
    Click: {
      point: { x: 1, y: 1 },
      fingerprint: {
        testId: null, id: null, role: 'button', accessibleName: 'Logout', tag: 'button',
        href: null, nameAttr: null, placeholder: null, inputType: null,
        textContent: 'Logout', structuralPath: null
      }
    }
  }
  const tree = filterActions({ branches: [[4, { value: click }], [1, { value: 'Wait' }]] },
    action => safeClick(action, [JSON.stringify(click.Click.fingerprint)]))
  expect(tree).toEqual({ branches: [[4, { branches: [] }], [1, { value: 'Wait' }]] })
})

it.skipIf(!process.env.CHROME)('checks nested panels, reader/camera mode and excluded controls in a real DOM', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'firn-bombadil-dom-'))
  temporaryDirectories.push(directory)
  const bundle = await build({
    entryPoints: ['tests/bombadil/specs/scanner.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'scanner'
  })
  const script = bundle.outputFiles[0]?.text
  if (!script) throw new Error('DOM test bundle is empty')
  const page = join(directory, 'scanner.html')
  await writeFile(page, `<!doctype html><html><body>
    <h4>Barcode-Scanner</h4>
    <div id="outer">
      <div role="tablist"><button role="tab" data-state="active">Info</button></div>
      <div role="tabpanel" id="info" data-state="active">
        <div>
          <div role="tablist">
            <button id="reader-tab" role="tab" data-state="active">Scanner or keyboard</button>
            <button id="camera-tab" role="tab" data-state="inactive"><span class="i-lucide-camera"></span>Device camera</button>
          </div>
          <div role="tabpanel" id="reader" data-state="active"><input placeholder="Scan one barcode"></div>
          <div role="tabpanel" id="camera" data-state="inactive" hidden><button id="enable-camera"><span class="i-lucide-camera"></span></button></div>
        </div>
      </div>
      <div role="tabpanel" id="actions" hidden></div>
      <div role="tabpanel" hidden></div>
    </div>
    <button id="logout"><span>F</span>Logout</button>
    <a id="inventory" href="/inventory">Return</a>
    <pre id="result"></pre>
    <script>${script}
      const results = {};
      results.initial = scanner.scannerState(document);
      document.querySelector('[role="tab"]').setAttribute('aria-controls', 'info');
      results.interactive = scanner.scannerState(document).interactive;
      document.querySelector('input').readOnly = true;
      results.readOnly = scanner.scannerState(document).readerReady;
      document.querySelector('input').remove();
      results.missing = scanner.scannerState(document).readerReady;
      document.getElementById('reader-tab').dataset.state = 'inactive';
      document.getElementById('camera-tab').dataset.state = 'active';
      document.getElementById('reader').hidden = true;
      document.getElementById('reader').dataset.state = 'inactive';
      document.getElementById('camera').hidden = false;
      document.getElementById('camera').dataset.state = 'active';
      results.camera = scanner.scannerState(document).readerReady;
      document.getElementById('camera-tab').remove();
      results.missingReader = scanner.scannerState(document).readerReady;
      document.getElementById('info').insertAdjacentHTML('beforeend',
        '<button id="camera-tab" role="tab"><span class="i-lucide-camera"></span>Device camera</button>');
      document.getElementById('actions').hidden = false;
      results.twoPanels = scanner.scannerState(document).panels;
      document.getElementById('actions').hidden = true;
      document.getElementById('info').hidden = true;
      results.noPanels = scanner.scannerState(document).panels;
      results.excluded = ['logout', 'inventory', 'enable-camera', 'camera-tab'].map(id =>
        scanner.excludedControl(document.getElementById(id), 'http://127.0.0.1:3107/scan'));
      document.getElementById('result').textContent = JSON.stringify(results);
    </script></body></html>`)
  const { stdout } = await promisify(execFile)(process.env.CHROME!, [
    '--headless', '--no-sandbox', '--no-first-run', `--user-data-dir=${join(directory, 'profile')}`,
    '--dump-dom', pathToFileURL(page).href
  ], { timeout: 30000, maxBuffer: 1024 * 1024 })
  const result = stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]
  expect(result).toBeDefined()
  expect(JSON.parse(result!)).toEqual({
    initial: { heading: true, panels: 1, interactive: false, readerReady: true },
    interactive: true,
    readOnly: false,
    missing: false,
    camera: true,
    missingReader: false,
    twoPanels: 2,
    noPanels: 0,
    excluded: [true, true, true, false]
  })
})
