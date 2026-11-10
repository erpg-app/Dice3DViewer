import { chromium, devices } from 'playwright'
import { createServer } from 'vite'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const server = await createServer({
	root,
	logLevel: 'error',
	server: { host: '127.0.0.1', port: 4174, strictPort: true }
})

const browserErrors = []
let browser
try {
	await server.listen()
	browser = await chromium.launch({ headless: true })
	const context = await browser.newContext({ ...devices['Pixel 5'] })
	const effectRequests = new Set()
	context.on('request', request => {
		const effect = new URL(request.url()).pathname.match(/\/chunks\/(particles|particlePresets)-[^/]+\.js$/)
		if(effect) effectRequests.add(effect[1])
	})
	const runPage = async (setup) => {
		const page = await context.newPage()
		page.on('pageerror', error => browserErrors.push(error.message))
		page.on('console', message => {
			const text = message.text()
			if(text.includes('[DiceResultViewer]') && (message.type() === 'error' || text.includes('Skin texture unavailable'))) browserErrors.push(text)
		})
		if(setup) await setup(page)
		await page.goto('http://127.0.0.1:4174/e2e/index.html', { waitUntil: 'networkidle' })
		await page.waitForFunction(() => Boolean(window.diceSmoke))
		return page
	}

	const coldPage = await runPage()
	const d20 = await coldPage.evaluate(() => window.diceSmoke.runDisplay({ sides: 20, values: [20] }))
	assert.equal(d20.backend, 'worker')
	assert.equal(d20.replacedCanvas, false)
	await coldPage.evaluate(() => window.diceSmoke.runDisplay({
		sides: 6,
		values: [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6],
		enableShadows: true
	}))
	await coldPage.evaluate(() => window.diceSmoke.runTimeline())
	await coldPage.evaluate(() => window.diceSmoke.runTimelineEffects())
	await coldPage.evaluate(() => window.diceSmoke.runCancellation())
	await coldPage.evaluate(() => window.diceSmoke.runDisplay({ sides: 100, values: [37] }))
	await coldPage.evaluate(() => window.diceSmoke.runDisplay({ sides: 2, values: [1, 2] }))
	assert.equal(effectRequests.size, 0, 'ordinary rolls should not request particle assets')
	await coldPage.evaluate(() => window.diceSmoke.runDisplay({
		sides: 6,
		values: [1, 2, 6],
		resize: true,
		options: {
			theme: 'fate',
			skin: { texture: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#cc8833"/></svg>') },
			particles: { effect: { settle: {
				amount: 5,
				life: [0.2, 0.4],
				size: [0.1, 0.2],
				speed: [0.2, 0.5],
				colors: ['#fff'],
				image: '/dist/assets/dice-box/themes/default/coin-1.svg'
			} } }
		}
	}))
	assert.deepEqual([...effectRequests], ['particles'], 'custom effects only need the particle engine')
	await coldPage.evaluate(() => window.diceSmoke.runDisplay({
		sides: 6, values: [6], options: { particles: { preset: 'sparkle' } }
	}))
	assert.ok(effectRequests.has('particlePresets'), 'using a preset should request its definitions')
	const cold = await coldPage.evaluate(() => ({
		importMs: window.diceSmoke.importMs,
		...window.diceSmoke.resourceMetrics()
	}))
	await coldPage.close()

	const warmPage = await runPage()
	const warmD20 = await warmPage.evaluate(() => window.diceSmoke.runDisplay({ sides: 20, values: [20] }))
	const warm = await warmPage.evaluate(() => ({
		importMs: window.diceSmoke.importMs,
		...window.diceSmoke.resourceMetrics()
	}))
	await warmPage.close()

	const unsupportedPage = await runPage(page => page.addInitScript(() => {
		HTMLCanvasElement.prototype.transferControlToOffscreen = undefined
	}))
	const unsupported = await unsupportedPage.evaluate(() => window.diceSmoke.runDisplay({ sides: 6, values: [3], resize: true }))
	assert.equal(unsupported.backend, 'main')
	assert.equal(unsupported.replacedCanvas, false)
	await unsupportedPage.close()

	const failedTransferPage = await runPage(page => page.addInitScript(() => {
		const postMessage = Worker.prototype.postMessage
		Worker.prototype.postMessage = function(message, ...rest) {
			if(message.type === 'init' && message.canvas instanceof OffscreenCanvas) throw new DOMException('Simulated worker transfer failure', 'DataCloneError')
			return postMessage.call(this, message, ...rest)
		}
	}))
	const failedTransfer = await failedTransferPage.evaluate(() => window.diceSmoke.runDisplay({ sides: 6, values: [4] }))
	assert.equal(failedTransfer.backend, 'main')
	assert.equal(failedTransfer.replacedCanvas, true)
	await failedTransferPage.close()

	const failedRuntimePage = await runPage(page => page.addInitScript(() => {
		const postMessage = Worker.prototype.postMessage
		Worker.prototype.postMessage = function(message, ...rest) {
			if(message.type === 'options') throw new DOMException('Simulated worker transport failure', 'DataCloneError')
			return postMessage.call(this, message, ...rest)
		}
	}))
	const failedRuntime = await failedRuntimePage.evaluate(() => window.diceSmoke.runDisplay({
		sides: 6, values: [5], update: { themeColor: '#ff8844' }
	}))
	assert.equal(failedRuntime.backend, 'main')
	assert.equal(failedRuntime.replacedCanvas, true)
	await failedRuntimePage.close()

	await context.close()

	if(browserErrors.length) throw new Error(`Browser errors:\n${browserErrors.join('\n')}`)
	console.log(JSON.stringify({
		emulation: 'Playwright Pixel 5',
		cold: { ...cold, initMs: d20.initMs, firstDisplayMs: d20.displayMs },
		warm: { ...warm, initMs: warmD20.initMs, firstDisplayMs: warmD20.displayMs }
	}, null, 2))
	console.log('Chromium smoke passed: worker and fallback, resize, coins, SVG themes, skins, particles, timeline, cancellation and disposal.')
} finally {
	await browser?.close()
	await server.close()
}
