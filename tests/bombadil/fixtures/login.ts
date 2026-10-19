import './env'
import { readFile, writeFile } from 'node:fs/promises'
import { ARTIFACT_DIR, ARTIFACT_FILE, type BombadilArtifact } from './env'
import { loginWithToken } from './auth'

async function main() {
  const origin = process.env.BOMBADIL_APP_ORIGIN
  if (!origin) throw new Error('Run login through tests/bombadil/run.sh.')
  const artifact: BombadilArtifact = JSON.parse(await readFile(ARTIFACT_FILE, 'utf8'))
  const pairs = await loginWithToken(origin, artifact.token, artifact.user)
  await writeFile(new URL('cookie.txt', ARTIFACT_DIR), pairs.join('\n') + '\n', { mode: 0o600 })
  process.stdout.write(pairs.join('\n') + '\n')
}

main().catch((error) => {
  console.error('Bombadil login failed:', error)
  process.exitCode = 1
})
