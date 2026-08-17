<script setup lang="ts">
type IconName = "home" | "grid" | "check" | "settings" | "clock" | "menu" | "logout" | "loading" | "empty" | "forbidden" | "error" | "warning" | "help" | "close" | "stop" | "play" | "add";

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 20 });

const paths: Record<IconName, string> = {
  home: "M3 10.5 12 3l9 7.5V21H3z M9 21v-6h6v6",
  grid: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z",
  check: "m5 12 4 4L19 6",
  settings: "M19.4 15a7.8 7.8 0 0 0 0-6l2-1.5-2-3.4-2.3 1a7.8 7.8 0 0 0-5.2-3L11.5 0h-4l-.4 2.1a7.8 7.8 0 0 0-5.2 3L-.4 4.1l-2 3.4 2 1.5a7.8 7.8 0 0 0 0 6l-2 1.5 2 3.4 2.3-1a7.8 7.8 0 0 0 5.2 3l.4 2.1h4l.4-2.1a7.8 7.8 0 0 0 5.2-3l2.3 1 2-3.4z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-5V8m0 4h4",
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
  add: "M12 5v14M5 12h14"
};
</script>

<template>
  <svg class="app-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="paths[name]" />
  </svg>
</template>
