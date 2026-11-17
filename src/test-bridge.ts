/** Test build only: boots the app, exposes every module export on window, then runs the classic test scripts. */
import './main';
import { modules } from './test-modules';

// The suite uses the app's names bare, as when every file was a classic script. Each one reads the
// live value; assigning one calls the owning module's set<Name>() or fails loudly.
const owner = new Map<string, string>();
for (const [file, mod] of Object.entries(modules)) {
  for (const name of Object.keys(mod)) {
    if (owner.has(name)) throw new Error(`test bridge: ${name} is exported by ${owner.get(name)} and ${file}`);
    owner.set(name, file);
    const setter = mod['set' + name[0].toUpperCase() + name.slice(1)];
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => mod[name],
      set:
        typeof setter === 'function'
          ? (v: unknown) => setter(v)
          : () => {
              throw new Error(`test assigns ${name}: add a setter`);
            },
    });
  }
}

// The page lists the scripts to run after boot (vite.config.ts, TEST_PAGES); they run in order.
const after = document.querySelector<HTMLMetaElement>('meta[name="test-after"]')?.content.split(' ') ?? [];
for (const src of after) {
  const script = document.createElement('script');
  script.src = src;
  script.async = false;
  document.body.append(script);
}
