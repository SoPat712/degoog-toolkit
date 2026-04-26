import speedtestPlugin, {
  command as baseCommand,
  routes as baseRoutes,
  slot as baseSlot,
} from "./index.mjs";

const debugModeSetting = {
  key: "debugMode",
  label: "Debug mode",
  type: "toggle",
  default: false,
  description:
    "Show Speedtest debug details for troubleshooting server behavior and measurement output.",
};

export const slot = {
  id: "speedtest-slot",
  name: "Speedtest",
  description:
    "Minimal internet speed test with selectable servers, latency, download-first flow, and a circular gauge.",
  position: "at-a-glance",
  settingsSchema: [debugModeSetting],
  init: baseSlot.init,
  configure: baseSlot.configure,
  trigger: baseSlot.trigger,
  execute: baseSlot.execute,
};

export const command = {
  name: "Speedtest",
  description:
    "Minimal internet speed test with selectable servers, latency, download-first flow, and a circular gauge.",
  trigger: "speedtest",
  aliases: ["speed-test", "networkspeed", "internetspeed"],
  settingsSchema: [debugModeSetting],
  init: baseCommand.init,
  configure: baseCommand.configure,
  execute: baseCommand.execute,
};

export const routes = baseRoutes;

export default {
  ...speedtestPlugin,
  slot,
  command,
  routes,
};
