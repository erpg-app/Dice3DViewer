export const loadModule = <Module>(url: string): Promise<Module> =>
	import(/* @vite-ignore */ /* webpackIgnore: true */ url)
