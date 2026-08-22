import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./app/router";
import "element-plus/dist/index.css";
import "./styles/tokens.css";
import "./shared/styles/index.scss";

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");
