# kokoro-read-aloud

[English](README.md) | **简体中文**

使用 [Kokoro](https://github.com/hexgrad/kokoro) TTS 朗读网页 —— 一个可自托管的
神经网络文本转语音服务器，搭配一个跨浏览器扩展，从服务器流式获取音频，并以
卡拉 OK 式的高亮跟随朗读进度。

这是一个包含两个部分的 monorepo（单一代码仓库）：

| 目录 | 简介 |
| --- | --- |
| [`server/`](server) | 一个小巧的 FastAPI 服务器，通过 HTTP 流式输出 Kokoro 音频。支持美式英语（推荐）和英式英语语音，语速可调。 |
| [`extension/`](extension) | 一个 Chrome（MV3）/ Firefox（MV2）扩展，可朗读页面正文、点击的元素，或从某处开始到页尾的内容 —— 既可经由服务器（Kokoro），也可使用零配置的 Google 翻译作为后备方案。 |

扩展的 Kokoro 引擎需要服务器在运行；而它的 Google 翻译引擎则不需要。

## 快速开始

> **最简单的安装方式 —— Windows，无需命令行。** 从最新的
> [release](https://github.com/davuses/kokoro-read-aloud/releases) 下载：
>
> 1. 运行 **`kokoro-tts-server-setup.exe`**。它会自动完成全部安装配置（首次运行需
>    下载几百 MB，耗时数分钟），随后以**系统托盘图标**的方式在后台运行服务器，也
>    可设置为登录时自动启动。
> 2. 解压 **`kokoro-extension-chrome.zip`**，打开 `chrome://extensions`，启用
>    *开发者模式*，再**加载已解压的扩展程序**，选择解压后的文件夹。
> 3. 点击扩展图标，选择一个 Kokoro 语音，使用弹出窗口中的朗读按钮即可。
>
> 下面的步骤适用于 macOS/Linux 以及开发者。

**1. 运行服务器**（详见 [`server/README.md`](server/README.md)）：

不熟悉命令行？直接双击 `server/` 文件夹中对应你系统的启动器即可，无需运行下面的
命令 —— `start-server.bat`（Windows）、`start-server.command`（macOS）或
`start-server.sh`（Linux）。首次运行时它会自动完成所有安装配置。

```bash
cd server
uv sync
uv run uvicorn server:app --host 127.0.0.1 --port 18001
```

服务器启动时会预热美式和英式两套流水线（首次会下载一次模型权重），因此第一次
请求和后续请求一样快。有 GPU 时会使用 GPU，否则回退到 CPU。

**2. 构建并加载扩展**（详见 [`extension/README.md`](extension/README.md)）：

```bash
cd extension
npm install
npm run build:chrome     # 或 build:firefox
```

然后在浏览器中加载已解压的 `dist-chrome/`（或 `dist-firefox/`），在弹出窗口中
选择一个 Kokoro 语音，再通过弹出窗口中的朗读按钮或右键菜单开始朗读。

## 隐私与安全速览

- 用 **Kokoro** 朗读的文字只会发送到你自己运行的服务器。
- 用 **Google 翻译** 朗读的文字会发送到 Google 的公共 TTS 接口。详见
  [`extension/PRIVACY.md`](extension/PRIVACY.md)。
- 服务器**没有鉴权或限流** —— 除非你打算共享它，否则请将其绑定到
  `127.0.0.1`。详见服务器 README 中的安全说明。

## 许可证

[Apache-2.0](LICENSE)。Kokoro 模型同样采用 Apache-2.0 许可证。
