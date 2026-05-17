import { APP_SCRIPT } from "./ui/app.js";
import { APP_STYLES } from "./ui/styles.js";

export const APP_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="app-version" content="3.0.0" />
    <title>MicMail 邮箱归档后台</title>
    <style>${APP_STYLES}</style>
  </head>
  <body>
    <div id="app"></div>
    <script>${APP_SCRIPT}</script>
  </body>
</html>`;
