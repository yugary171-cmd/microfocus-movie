import { DRAMA_EPISODE_MAX_COUNT, EPISODE_DURATION_SECONDS_MAX, EPISODE_TITLE_MAX_LENGTH, MediaStatus, UPLOAD_FILE_ACCEPT, UPLOAD_FILE_NAME_MAX_LENGTH, UPLOAD_FILE_SIZE_MAX_BYTES } from "@microfocus/contracts";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
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

async function openDrawer(wrapper: VueWrapper): Promise<void> {
  await wrapper.findAll("button").find((button) => button.text() === "管理剧集")?.trigger("click");
}

describe("EpisodeTable Mock upload path", () => {
  it("moves a selected file from simulated upload to ready media", async () => {
    const upload = vi.spyOn(adminApi, "uploadEpisode").mockImplementation(
      async (_dramaId, _episodeId, _file, onProgress) => {
        onProgress(100);
        return { fileId: "mock-file-id" };
      },
    );
    const wrapper = mount(EpisodeTable, {
      props: { modelValue: [episode], dramaId: "drama-upload-test" },
    });
    await openDrawer(wrapper);

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
    wrapper.unmount();
  });

  it("caps episode title, duration, and count to the contract limits", async () => {
    const wrapper = mount(EpisodeTable, {
      props: { modelValue: [episode], dramaId: "drama-upload-test" },
    });
    await openDrawer(wrapper);

    expect(wrapper.get('input[type="text"]').attributes("maxlength")).toBe(
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
    await openDrawer(capped);
    expect(wrapper.get('input[type="file"]').attributes("accept")).toBe(UPLOAD_FILE_ACCEPT);
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
    await openDrawer(wrapper);

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

  it("rejects a selected file whose size exceeds the contract limit", async () => {
    const upload = vi.spyOn(adminApi, "uploadEpisode");
    const wrapper = mount(EpisodeTable, {
      props: { modelValue: [episode], dramaId: "drama-upload-test" },
    });
    await openDrawer(wrapper);

    const oversized = new File(["mock video"], "episode.mp4", { type: "video/mp4" });
    Object.defineProperty(oversized, "size", { value: UPLOAD_FILE_SIZE_MAX_BYTES + 1 });
    const fileInput = wrapper.get('input[type="file"]');
    Object.defineProperty(fileInput.element, "files", {
      configurable: true,
      value: [oversized],
    });
    await fileInput.trigger("change");
    await flushPromises();

    expect(upload).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("文件不能超过 5GB");
    upload.mockRestore();
    wrapper.unmount();
  });

  it("rejects a selected file whose content type is not allowed", async () => {
    const upload = vi.spyOn(adminApi, "uploadEpisode");
    const wrapper = mount(EpisodeTable, {
      props: { modelValue: [episode], dramaId: "drama-upload-test" },
    });
    await openDrawer(wrapper);

    const fileInput = wrapper.get('input[type="file"]');
    Object.defineProperty(fileInput.element, "files", {
      configurable: true,
      value: [new File(["not a video"], "notes.txt", { type: "text/plain" })],
    });
    await fileInput.trigger("change");
    await flushPromises();

    expect(upload).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("仅支持 MP4、MOV、WebM");
    upload.mockRestore();
    wrapper.unmount();
  });

  it("keeps a page summary and opens the episode table in a drawer", async () => {
    const wrapper = mount(EpisodeTable, {
      props: { modelValue: [episode], dramaId: "drama-upload-test" },
    });

    expect(wrapper.text()).toContain("已添加 1 集");
    expect(wrapper.find(".episode-table").exists()).toBe(false);

    await openDrawer(wrapper);

    expect(wrapper.find(".episode-table").exists()).toBe(true);
    expect(wrapper.get('[role="dialog"]').text()).toContain("管理剧集");
    wrapper.unmount();
  });
});
