import { MediaStatus } from "@microfocus/contracts";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { adminApi } from "@/api/admin";
import type { EpisodeRecord } from "@/types/admin";
import EpisodeTable from "./EpisodeTable.vue";

const episode: EpisodeRecord = {
  id: "episode-upload-test",
  episodeNumber: 1,
  title: "第一集",
  durationSeconds: 120,
  mediaStatus: MediaStatus.CREATED,
  transcodeStatus: "PENDING",
  machineReviewStatus: "PENDING",
  manualReviewStatus: "PENDING",
  wechatReviewStatus: "PENDING",
  updatedAt: "2026-08-13T00:00:00.000Z",
};

describe("EpisodeTable Mock upload path", () => {
  it("moves a selected file from simulated upload to ready media", async () => {
    const upload = vi.spyOn(adminApi, "uploadEpisode").mockImplementation(
      async (_dramaId, _episodeId, _file, onProgress) => onProgress(100),
    );
    const wrapper = mount(EpisodeTable, {
      props: { modelValue: [episode], dramaId: "drama-upload-test" },
    });

    const fileInput = wrapper.get('input[type="file"]');
    Object.defineProperty(fileInput.element, "files", {
      configurable: true,
      value: [new File(["mock video"], "episode.mp4", { type: "video/mp4" })],
    });
    await fileInput.trigger("change");
    await flushPromises();

    expect(upload).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain("已完成模拟直传");
    await wrapper.get("button.link").trigger("click");

    const updates = wrapper.emitted("update:modelValue");
    const updatedEpisode = updates?.at(-1)?.[0] as EpisodeRecord[];
    expect(updatedEpisode?.[0]).toMatchObject({
      mediaStatus: MediaStatus.READY,
      transcodeStatus: "READY",
      machineReviewStatus: "APPROVED",
      manualReviewStatus: "APPROVED",
      wechatReviewStatus: "APPROVED",
    });
    upload.mockRestore();
  });
});
