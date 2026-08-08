import { createApp } from "vue";
import { createPinia } from "pinia";
import Antd from "ant-design-vue";
import "ant-design-vue/dist/reset.css";
import "leaflet/dist/leaflet.css";
import App from "./App.vue";
import router from "./router";
import AIcon from "./components/AIcon.vue";

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(Antd);
app.component("a-icon", AIcon);
app.mount("#app");
