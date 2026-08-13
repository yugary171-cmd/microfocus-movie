import { config } from "@vue/test-utils";
import { afterEach } from "vitest";

config.global.stubs = {
  RouterLink: {
    props: ["to"],
    template: "<a :href='typeof to === \"string\" ? to : \"#\"'><slot /></a>",
  },
  RouterView: { template: "<div />" },
  Teleport: true,
};

afterEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});
