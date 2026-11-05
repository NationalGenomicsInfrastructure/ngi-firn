import { spawn } from 'node:child_process'

const supervisor = spawn('bash', ['container_images/firn-entrypoint.sh', 'pnpm', 'exec', 'nuxi', 'dev'], {
  stdio: 'inherit'
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => supervisor.kill(signal))
}

supervisor.on('error', (error) => {
  console.error(`Could not start the search supervisor: ${error.message}`)
  process.exit(1)
})

supervisor.on('exit', (code) => {
  process.exit(code ?? 1)
})
