<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { isMockMode } from "./shared/api";

onLaunch(() => {
  if (!isMockMode()) return;
  try {
    uni.hideShareMenu({ hideShareItems: ["shareAppMessage", "shareTimeline"] });
  } catch {
    // H5 / App have no WeChat share menu
  }
});
</script>

<style>
@import "./shared/styles/index.scss";
</style>
