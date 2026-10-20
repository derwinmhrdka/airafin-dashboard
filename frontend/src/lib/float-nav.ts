import { browser } from '$app/environment';
import { writable } from 'svelte/store';

const KEY = 'airafin.float-nav';

export const floatNavEnabled = writable(false);

if (browser) {
  floatNavEnabled.set(localStorage.getItem(KEY) === '1');
}

export function setFloatNavEnabled(on: boolean) {
  if (browser) localStorage.setItem(KEY, on ? '1' : '0');
  floatNavEnabled.set(on);
}
