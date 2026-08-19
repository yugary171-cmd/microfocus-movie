<script setup lang="ts">
type IconName = "home" | "grid" | "check" | "settings" | "clock" | "users" | "menu" | "logout" | "loading" | "empty" | "forbidden" | "error" | "warning" | "help" | "close" | "stop" | "play" | "add" | "eye" | "eye-off";

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 20 });

const paths: Record<IconName, string> = {
  home: "M3 10.5 12 3l9 7.5V21H3z M9 21v-6h6v6",
  grid: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z",
  check: "m5 12 4 4L19 6",
  settings: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-5V8m0 4h4",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  menu: "M4 6h16M4 12h16M4 18h16",
  logout: "M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5m5-4 4-4-4-4m4 4H9",
  loading: "M12 3a9 9 0 1 0 9 9",
  empty: "M4 5h16v14H4z M8 10h8M8 14h5",
  forbidden: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-5 5 10 8",
  error: "M12 3v10m0 4v1",
  warning: "M12 3 2 21h20z M12 9v5m0 3v1",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm-1-6h2v2h-2zm0-2v-1a3 3 0 1 1 3-3",
  close: "m5 5 14 14M19 5 5 19",
  stop: "M5 5h14v14H5z",
  play: "M5 3l14 9-14 9z",
  add: "M12 5v14M5 12h14",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  "eye-off": "M3 3l18 18 M10.6 10.6a2 2 0 0 0 2.8 2.8 M9.4 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.1 M6.1 6.1C3.9 7.8 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4.4-1"
};
</script>

<template>
  <svg class="app-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="paths[name]" />
  </svg>
</template>

<style scoped>
.app-icon { display: block; }
</style>
