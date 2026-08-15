import { DRAMA_EPISODE_MAX_COUNT, EPISODE_DURATION_SECONDS_MAX, EPISODE_TITLE_MAX_LENGTH, MediaStatus, UPLOAD_FILE_NAME_MAX_LENGTH } from "@microfocus/contracts";
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

  it("caps episode title, duration, and count to the contract limits", () => {
    const wrapper = mount(EpisodeTable, {
      props: { modelValue: [episode], dramaId: "drama-upload-test" },
    });

    expect(wrapper.get(".episode-fields input").attributes("maxlength")).toBe(
      String(EPISODE_TITLE_MAX_LENGTH),
    );
    expect(wrapper.get('input[type="number"]').attributes("max")).toBe(
      String(EPISODE_DURATION_SECONDS_MAX),
    );

    const full = Array.from({ length: DRAMA_EPISODE_MAX_COUNT }, (_, index) => ({
      ...episode,
      id: `episode-${index}`,
      episodeNumber: index + 1,
    }));
    const capped = mount(EpisodeTable, {
      props: { modelValue: full, dramaId: "drama-upload-test" },
    });
    expect(
      capped.findAll("button").find((button) => button.text().includes("添加剧集"))?.attributes("disabled"),
    ).toBeDefined();
    capped.unmount();
    wrapper.unmount();
  });

  it("rejects a selected file whose name exceeds the contract limit", async () => {
    const upload = vi.spyOn(adminApi, "uploadEpisode");
    const wrapper = mount(EpisodeTable, {
      props: { modelValue: [episode], dramaId: "drama-upload-test" },
    });

    const fileInput = wrapper.get('input[type="file"]');
    Object.defineProperty(fileInput.element, "files", {
      configurable: true,
      value: [
        new File(["mock video"], `${"a".repeat(UPLOAD_FILE_NAME_MAX_LENGTH + 1)}.mp4`, {
          type: "video/mp4",
        }),
      ],
    });
    await fileInput.trigger("change");
    await flushPromises();

    expect(upload).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("文件名不能超过");
    upload.mockRestore();
    wrapper.unmount();
  });
});
