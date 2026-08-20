<script setup lang="ts">
type IconName =
  | "home"
  | "grid"
  | "check"
  | "circle-check"
  | "settings"
  | "clock"
  | "users"
  | "menu"
  | "logout"
  | "loading"
  | "empty"
  | "forbidden"
  | "error"
  | "warning"
  | "help"
  | "close"
  | "stop"
  | "play"
  | "add"
  | "eye"
  | "eye-off"
  | "copy";

const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 20 });

const glyphs: Record<IconName, string[]> = {
  home: [
    "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
    "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  ],
  grid: ["M3 3h8v8H3z", "M13 3h8v8h-8z", "M3 13h8v8H3z", "M13 13h8v8h-8z"],
  check: ["m5 12 4 4L19 6"],
  "circle-check": ["M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0", "m9 12 2 2 4-4"],
  settings: [
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  ],
  clock: ["M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0", "M12 6v6l4 2"],
  users: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M13 7A4 4 0 1 1 5 7a4 4 0 0 1 8 0",
    "M22 21v-2a4 4 0 0 0-3-3.87",
    "M16 3.13a4 4 0 0 1 0 7.75",
  ],
  menu: ["M4 6h16M4 12h16M4 18h16"],
  logout: ["M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5m5-4 4-4-4-4m4 4H9"],
  loading: ["M12 3a9 9 0 1 0 9 9"],
  empty: ["M4 5h16v14H4z M8 10h8M8 14h5"],
  forbidden: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-5 5 10 8"],
  error: ["M12 3v10m0 4v1"],
  warning: ["M12 3 2 21h20z M12 9v5m0 3v1"],
  help: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm-1-6h2v2h-2zm0-2v-1a3 3 0 1 1 3-3"],
  close: ["m5 5 14 14M19 5 5 19"],
  stop: ["M5 5h14v14H5z"],
  play: ["M5 3l14 9-14 9z"],
  add: ["M12 5v14M5 12h14"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  "eye-off": [
    "M3 3l18 18 M10.6 10.6a2 2 0 0 0 2.8 2.8 M9.4 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.1 M6.1 6.1C3.9 7.8 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4.4-1",
  ],
  copy: ["M9 9h11v12H9z M4 4h11v3"],
};
</script>

<template>
  <svg
    class="app-icon"
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(d, index) in glyphs[props.name]" :key="index" :d="d" />
  </svg>
</template>

<style scoped>
.app-icon { display: block; overflow: visible; flex: 0 0 auto; }
</style>
